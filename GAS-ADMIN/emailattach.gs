/**
 * ============================================================================
 * Per-Student Email Attachments (v2.9.0)
 * Merged from the standalone "Student Photo Email Dispatch System" v1.2.0
 * (Apps Script project 13qEt77GEnkAoTGtKZYjXlzQx4l1KDqRpLN8vjwdh8BZb7yWI_2yTPyZz)
 * ============================================================================
 *
 * What the dispatcher did: index every file under a Drive folder by its
 * extension-less name, read a CSV of [studentId, email], and mail each student
 * the file whose name equals their studentId.
 *
 * What changed in the merge, and why (each item was a real defect in v1.2.0):
 *   1. Its index was `index[name] = file` — a later file with the same name in
 *      another subfolder silently REPLACED the earlier one, so a student could
 *      receive someone else's photo. Here a file name that occurs more than once
 *      is AMBIGUOUS and is sent to nobody.
 *   2. `name.split('.')[0]` cut at the FIRST dot. Only the real extension (after
 *      the last dot, 1–5 alphanumerics) is stripped now.
 *   3. One file per student. Now several: an exact name match, or the key
 *      followed by a separator (`s001_成績單.pdf`, `s001-2.jpg`). `s1` never
 *      matches `s10_x` because the character after the key must be a separator.
 *   4. It sent immediately and kept no ledger, so re-running after the 6-minute
 *      timeout re-sent every student's photo. Now: mandatory preview, a mapping
 *      fingerprint that must still match at send time, a per-job ledger in
 *      Email_Logs written immediately after each send, resume that skips
 *      ledgered recipients, and a script lock so one job cannot run twice.
 *   5. Its logger used getActiveSpreadsheet() in a standalone script (null) and
 *      crashed inside its own error handler. GAS-ADMIN's DB sheet is used.
 *   6. CSV was parsed with split(','). The shared CSV/TSV parser + header
 *      aliases are used; the dispatcher's positional [key, email] layout still
 *      works.
 *   7. Unbounded folder walk. Bounded by file/folder/depth caps — and exceeding
 *      a cap is an ERROR, not a silent truncation, because an incomplete index
 *      cannot detect duplicate names (item 1) and would look like full coverage.
 *   8. No email validation. Every recipient is validated before preview.
 *
 * Out of scope on purpose: no new OAuth scopes. Drive is covered by auth/drive,
 * Gmail by mail.google.com — appsscript.json is unchanged.
 */

const EMAIL_ATTACH_CONFIG = {
  MAX_RECIPIENTS_PER_JOB: 300,
  MAX_FILES_PER_RECIPIENT: 10,
  MAX_BYTES_PER_EMAIL: 20 * 1024 * 1024,   // Gmail hard limit is 25 MB incl. encoding overhead
  MAX_INDEXED_FILES: 2000,
  MAX_FOLDERS_SCANNED: 300,
  MAX_FOLDER_DEPTH: 8,
  CHUNK_TIME_BUDGET_MS: 240000,            // leaves ~2 min of the 6-min ceiling for the last send + ledger
  LOCK_WAIT_MS: 10000,
  MAX_SUBJECT_LENGTH: 250,
  MAX_SENDER_NAME_LENGTH: 60,
  DEFAULT_SENDER_NAME: "Domain Admin System",
  KEY_SEPARATORS: "_-. (",                 // after NFKC, full-width （ becomes (
  REPORT_LIST_LIMIT: 100
};

const EMAIL_ATTACH_STATUS = {
  MATCHED: "MATCHED",
  NO_MATCH: "NO_MATCH",
  AMBIGUOUS: "AMBIGUOUS",
  TOO_MANY: "TOO_MANY",
  TOO_LARGE: "TOO_LARGE",
  INVALID_EMAIL: "INVALID_EMAIL",
  DUPLICATE_EMAIL: "DUPLICATE_EMAIL",
  DUPLICATE_KEY: "DUPLICATE_KEY",
  MISSING_KEY: "MISSING_KEY"
};

const EMAIL_ATTACH_MATCH_KEYS = ["EMAIL_LOCAL", "EMAIL", "NAME"];

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
const DRIVE_NATIVE_PREFIX = "application/vnd.google-apps.";
const DRIVE_NATIVE_PDF_EXPORTABLE = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.drawing"
];

const EMAIL_LEDGER_HEADERS = ["Timestamp", "Recipient", "Subject", "Status", "Sender", "JobId", "Attachments"];

const EMAIL_DISPATCH_HEADER_ALIASES = {
  "學號": "key", "學生學號": "key", "學生編號": "key", "編號": "key", "帳號": "key",
  "studentid": "key", "studentno": "key", "id": "key", "key": "key", "account": "key",
  "email": "email", "mail": "email", "emailaddress": "email",
  "信箱": "email", "電子郵件": "email", "電子信箱": "email", "電郵": "email",
  "姓名": "name", "name": "name", "fullname": "name"
};

/* -----------------------------------------
   PUBLIC API (bridge contract)
   ----------------------------------------- */

/**
 * Parses a dispatch list (the v1.2.0 dispatcher's CSV: 學號, Email). Headers are
 * matched by alias; when they are not recognizable the dispatcher's positional
 * layout is used (column A = key, column B = email), and row 1 is treated as a
 * header unless B1 is itself an email address.
 *
 * @param {string} fileName
 * @param {string} fileContent
 * @return {{fileName:string, delimiter:string, headerMode:string, totalRows:number,
 *           recipients:Array<{rowNumber:number,key:string,email:string,name:string}>,
 *           skipped:Array<{rowNumber:number,reason:string}>}}
 */
function parseEmailDispatchCsv(fileName, fileContent) {
  if (!fileContent || !String(fileContent).trim()) throw new Error("上傳的名單檔案是空的。");
  const delimiter = detectBatchDelimiter_(fileName, fileContent);
  const rows = parseDelimitedRows_(fileContent, delimiter);

  let map = {};
  (rows[0] || []).forEach((header, index) => {
    const field = EMAIL_DISPATCH_HEADER_ALIASES[normalizeDispatchHeader_(header)];
    if (field && map[field] === undefined) map[field] = index;
  });

  let headerMode = "HEADER";
  let startIndex = 1;
  if (map.key === undefined || map.email === undefined) {
    map = { key: 0, email: 1 };
    headerMode = "POSITIONAL";
    startIndex = isValidEmail_(getRowValue_(rows[0], 1)) ? 0 : 1;
  }

  const recipients = [];
  const skipped = [];
  const seenEmails = {};
  let nonEmpty = 0;

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i] || [];
    const rowNumber = i + 1;
    if (row.every(cell => !String(cell || "").trim())) continue;
    nonEmpty++;
    if (nonEmpty > EMAIL_ATTACH_CONFIG.MAX_RECIPIENTS_PER_JOB) {
      throw new Error(`名單超過上限 ${EMAIL_ATTACH_CONFIG.MAX_RECIPIENTS_PER_JOB} 位，請分批處理。`);
    }

    const key = getRowValue_(row, map.key);
    const email = getRowValue_(row, map.email).toLowerCase();
    const name = map.name === undefined ? "" : getRowValue_(row, map.name);

    if (!key) { skipped.push({ rowNumber: rowNumber, reason: "缺少學號／配對值" }); continue; }
    if (!isValidEmail_(email)) { skipped.push({ rowNumber: rowNumber, reason: `Email 格式無效：${email || "(空白)"}` }); continue; }
    if (seenEmails[email]) {
      skipped.push({ rowNumber: rowNumber, reason: `重複的 Email（第 ${seenEmails[email]} 列已使用）` });
      continue;
    }
    seenEmails[email] = rowNumber;
    recipients.push({ rowNumber: rowNumber, key: key, email: email, name: name });
  }

  return {
    fileName: String(fileName || ""),
    delimiter: delimiter === "\t" ? "TAB" : "COMMA",
    headerMode: headerMode,
    totalRows: nonEmpty,
    recipients: recipients,
    skipped: skipped
  };
}

/**
 * Dry run: indexes the folder, matches files to recipients and returns the full
 * mapping plus the `mappingHash` that sendPersonalizedEmailBatch requires.
 * Sends nothing and writes nothing except one system-log line.
 *
 * @param {Object} request {folderId, recipientSource:'LIST'|'CSV', matchKey, missingPolicy,
 *                          recipients:[{email,name,key}]}
 */
function previewEmailAttachments(request) {
  try {
    const plan = buildEmailAttachmentPlan_(request, null, false);
    const s = plan.summary;
    logSystemAction_("PREVIEW_EMAIL_ATTACH", plan.index.folderName, "SUCCESS",
      `Recipients: ${plan.rows.length}, WillSend: ${s.willSend}, Matched: ${s.byStatus.MATCHED || 0}, ` +
      `Ambiguous: ${s.byStatus.AMBIGUOUS || 0}, FilesIndexed: ${plan.index.files.length}`);
    return toEmailAttachPreviewResponse_(plan);
  } catch (e) {
    logSystemAction_("PREVIEW_EMAIL_ATTACH", "N/A", "ERROR", truncateLogDetail_(getExceptionMessage_(e), 3500));
    throw new Error(getExceptionMessage_(e));
  }
}

/**
 * Sends one time-bounded chunk of a personalized-attachment job. The page calls
 * this repeatedly with the same request until `done` is true.
 *
 * Duplicate safety: recipients already ledgered as SENT (or ERROR) for this
 * jobId are never sent again, so retrying after a timeout or network failure
 * with the same jobId is safe. The mapping is rebuilt from Drive on every call
 * and must hash to the previewed `mappingHash`.
 *
 * @param {Object} request preview request + {jobId, subject, body, senderName, mappingHash}
 * @return {{jobId:string, done:boolean, stoppedReason:string, message:string,
 *           summary:Object, results:Array<{email,name,status,attachments,error}>}}
 */
function sendPersonalizedEmailBatch(request) {
  return sendPersonalizedEmailBatch_(request, null);
}

/* -----------------------------------------
   PLAN (index + match) — pure apart from injected I/O
   ----------------------------------------- */

function buildEmailAttachmentPlan_(request, deps, forSend) {
  const d = getEmailAttachDeps_(deps);
  const req = normalizeEmailAttachRequest_(request, forSend);
  const index = indexDriveFolderForAttachments_(req.folderId, d);
  const rows = buildRecipientRows_(req);
  const keys = rows.filter(row => !row.status).map(row => row.matchValue);
  const match = matchFilesToKeys_(index.files, keys);

  rows.forEach(row => {
    if (row.status) {
      row.willSend = false;
      return;
    }
    const files = (match.byKey[row.matchValue] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const ambiguous = match.ambiguousByKey[row.matchValue] || [];
    row.files = files.map(f => ({ id: f.id, name: f.name, bytes: f.bytes, native: f.native, path: f.path }));
    row.totalBytes = files.reduce((sum, f) => sum + (f.bytes || 0), 0);

    if (ambiguous.length > 0) {
      row.status = EMAIL_ATTACH_STATUS.AMBIGUOUS;
      row.reason = "為避免寄錯，此收件人暫不寄送：" +
        ambiguous.map(a => `${a.file.name}（${a.reason}）`).join("；");
    } else if (files.length === 0) {
      row.status = EMAIL_ATTACH_STATUS.NO_MATCH;
      row.reason = "資料夾中找不到對應檔案";
    } else if (files.length > EMAIL_ATTACH_CONFIG.MAX_FILES_PER_RECIPIENT) {
      row.status = EMAIL_ATTACH_STATUS.TOO_MANY;
      row.reason = `符合 ${files.length} 個檔案，超過每封上限 ${EMAIL_ATTACH_CONFIG.MAX_FILES_PER_RECIPIENT} 個`;
    } else if (row.totalBytes > EMAIL_ATTACH_CONFIG.MAX_BYTES_PER_EMAIL) {
      row.status = EMAIL_ATTACH_STATUS.TOO_LARGE;
      row.reason = `附件合計 ${formatBytes_(row.totalBytes)}，超過每封上限 ${formatBytes_(EMAIL_ATTACH_CONFIG.MAX_BYTES_PER_EMAIL)}`;
    } else {
      row.status = EMAIL_ATTACH_STATUS.MATCHED;
    }
    row.willSend = row.status === EMAIL_ATTACH_STATUS.MATCHED ||
      (row.status === EMAIL_ATTACH_STATUS.NO_MATCH && req.missingPolicy === "SEND_WITHOUT");
  });

  const plan = {
    request: req,
    index: index,
    rows: rows,
    unmatchedFiles: match.unmatched,
    ambiguousFiles: match.ambiguous
  };
  plan.mappingHash = buildEmailMappingHash_(plan, d);
  plan.summary = summarizeEmailAttachRows_(rows);
  return plan;
}

function normalizeEmailAttachRequest_(request, forSend) {
  const r = request || {};
  const folderId = extractDriveFolderId_(r.folderId);
  if (!folderId) throw new Error("請提供有效的 Google Drive 資料夾網址或 ID。");

  const recipientSource = r.recipientSource === "CSV" ? "CSV" : "LIST";
  const matchKey = recipientSource === "CSV"
    ? "CSV_KEY"
    : (EMAIL_ATTACH_MATCH_KEYS.indexOf(r.matchKey) !== -1 ? r.matchKey : "EMAIL_LOCAL");
  const missingPolicy = r.missingPolicy === "SEND_WITHOUT" ? "SEND_WITHOUT" : "SKIP";

  const list = Array.isArray(r.recipients) ? r.recipients : [];
  if (list.length === 0) throw new Error("請至少選擇一位收件人。");
  if (list.length > EMAIL_ATTACH_CONFIG.MAX_RECIPIENTS_PER_JOB) {
    throw new Error(`收件人超過上限 ${EMAIL_ATTACH_CONFIG.MAX_RECIPIENTS_PER_JOB} 位（目前 ${list.length} 位），請分批處理。`);
  }

  const req = {
    folderId: folderId,
    recipientSource: recipientSource,
    matchKey: matchKey,
    missingPolicy: missingPolicy,
    recipients: list.map(x => ({
      email: String((x && x.email) || "").trim().toLowerCase(),
      name: String((x && x.name) || "").trim(),
      key: String((x && x.key) || "").trim()
    }))
  };

  if (forSend) {
    const jobId = String(r.jobId || "").trim();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(jobId)) throw new Error("無效的工作編號 (jobId)。");
    const subject = String(r.subject || "").replace(/[\r\n]+/g, " ").trim();
    const body = String(r.body || "");
    if (!subject) throw new Error("主旨不可空白。");
    if (subject.length > EMAIL_ATTACH_CONFIG.MAX_SUBJECT_LENGTH) {
      throw new Error(`主旨過長（上限 ${EMAIL_ATTACH_CONFIG.MAX_SUBJECT_LENGTH} 字）。`);
    }
    if (!body.trim()) throw new Error("郵件內容不可空白。");
    const mappingHash = String(r.mappingHash || "").trim();
    if (!/^[0-9a-f]{64}$/.test(mappingHash)) throw new Error("缺少預覽結果，請先按「預覽配對」。");

    req.jobId = jobId;
    req.subject = subject;
    req.body = body;
    req.senderName = sanitizeSenderName_(r.senderName);
    req.mappingHash = mappingHash;
  }
  return req;
}

function buildRecipientRows_(req) {
  const seenEmails = {};
  const keyCount = {};
  const rows = req.recipients.map((rcp, index) => {
    const row = {
      index: index,
      email: rcp.email,
      name: rcp.name,
      key: "",
      matchValue: "",
      status: "",
      reason: "",
      files: [],
      totalBytes: 0,
      willSend: false
    };
    if (!isValidEmail_(rcp.email)) {
      row.status = EMAIL_ATTACH_STATUS.INVALID_EMAIL;
      row.reason = `Email 格式無效：${rcp.email || "(空白)"}`;
      return row;
    }
    if (seenEmails[rcp.email]) {
      row.status = EMAIL_ATTACH_STATUS.DUPLICATE_EMAIL;
      row.reason = "重複的收件人（僅處理第一筆）";
      return row;
    }
    seenEmails[rcp.email] = true;

    let raw;
    if (req.matchKey === "EMAIL") raw = rcp.email;
    else if (req.matchKey === "NAME") raw = rcp.name;
    else if (req.matchKey === "CSV_KEY") raw = rcp.key;
    else raw = rcp.email.split("@")[0];

    row.key = raw;
    row.matchValue = normalizeMatchText_(raw);
    if (!row.matchValue) {
      row.status = EMAIL_ATTACH_STATUS.MISSING_KEY;
      row.reason = "沒有可用的配對值";
      return row;
    }
    keyCount[row.matchValue] = (keyCount[row.matchValue] || 0) + 1;
    return row;
  });

  // From a checked list, two people sharing one key (e.g. identical names in
  // NAME mode) would receive each other's files — refuse both. In CSV mode a
  // shared key is the admin's explicit mapping (student + parent) and is kept.
  if (req.recipientSource === "LIST") {
    rows.forEach(row => {
      if (!row.status && keyCount[row.matchValue] > 1) {
        row.status = EMAIL_ATTACH_STATUS.DUPLICATE_KEY;
        row.reason = `配對值「${row.key}」同時屬於多位收件人，為避免寄錯不附檔也不寄送`;
      }
    });
  }
  return rows;
}

/**
 * Assigns each indexed file to at most ONE key.
 *   - A file whose full name (with extension) occurs more than once is
 *     ambiguous (dispatcher defect #1) for every key it could match.
 *   - An exact base-name match wins outright.
 *   - Otherwise a key matches when the base name starts with it followed by a
 *     separator; matching two or more keys that way is ambiguous.
 * Ambiguous files are reported against every candidate key so those recipients
 * are held back rather than sent a partial or wrong set.
 *
 * @param {Array<{id,name}>} files
 * @param {string[]} keys normalized match values
 */
function matchFilesToKeys_(files, keys) {
  const keySet = {};
  (keys || []).forEach(k => { if (k) keySet[k] = true; });

  const nameCount = {};
  (files || []).forEach(f => {
    const n = normalizeMatchText_(f.name);
    nameCount[n] = (nameCount[n] || 0) + 1;
  });

  const byKey = {};
  const ambiguousByKey = {};
  const ambiguous = [];
  const unmatched = [];

  (files || []).forEach(f => {
    const base = normalizeMatchText_(stripFileExtension_(f.name));
    const candidates = candidateKeysForBase_(base, keySet);
    if (candidates.length === 0) {
      unmatched.push(f);
      return;
    }

    let owner = "";
    let reason = "";
    if (nameCount[normalizeMatchText_(f.name)] > 1) {
      reason = "同名檔案在資料夾中出現多次";
    } else if (keySet[base]) {
      owner = base;
    } else if (candidates.length === 1) {
      owner = candidates[0];
    } else {
      reason = `同時符合多位收件人：${candidates.join("、")}`;
    }

    if (reason) {
      ambiguous.push({ file: f, keys: candidates, reason: reason });
      candidates.forEach(k => {
        (ambiguousByKey[k] = ambiguousByKey[k] || []).push({ file: f, reason: reason });
      });
      return;
    }
    (byKey[owner] = byKey[owner] || []).push(f);
  });

  return { byKey: byKey, ambiguousByKey: ambiguousByKey, ambiguous: ambiguous, unmatched: unmatched };
}

function candidateKeysForBase_(base, keySet) {
  const found = [];
  if (!base) return found;
  if (keySet[base]) found.push(base);
  for (let i = 1; i < base.length; i++) {
    if (EMAIL_ATTACH_CONFIG.KEY_SEPARATORS.indexOf(base[i]) === -1) continue;
    const prefix = base.substring(0, i).trim();
    if (prefix && keySet[prefix] && found.indexOf(prefix) === -1) found.push(prefix);
  }
  return found;
}

/** Lower-cased, trimmed, NFKC-normalized (full-width letters/digits fold to ASCII). */
function normalizeMatchText_(value) {
  return normalizeWidth_(value).trim().toLowerCase();
}

/** Strips only a real trailing extension: "s001.v2.jpg" -> "s001.v2"; "s001" -> "s001". */
function stripFileExtension_(fileName) {
  const name = String(fileName || "");
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return name;
  const ext = name.substring(dot + 1);
  if (!/^[A-Za-z0-9]{1,5}$/.test(ext)) return name;
  return name.substring(0, dot);
}

/** Accepts a folder URL (…/folders/<id>, …?id=<id>) or a bare ID. Returns "" when invalid. */
function extractDriveFolderId_(input) {
  const text = String(input || "").trim();
  if (!text) return "";
  const patterns = [/\/folders\/([A-Za-z0-9_-]{10,})/, /[?&]id=([A-Za-z0-9_-]{10,})/];
  for (let i = 0; i < patterns.length; i++) {
    const m = patterns[i].exec(text);
    if (m) return m[1];
  }
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : "";
}

/**
 * Breadth-first walk of the folder tree. Any cap being hit throws: a partial
 * index cannot prove there are no duplicate names, so it must not be used to
 * send personal files.
 */
function indexDriveFolderForAttachments_(folderId, deps) {
  const d = getEmailAttachDeps_(deps);
  const root = d.getFolderMeta(folderId);
  if (!root || root.mimeType !== DRIVE_FOLDER_MIME) throw new Error("指定的 ID 不是 Google Drive 資料夾。");

  const files = [];
  const skipped = [];
  const visited = {};
  visited[root.id] = true;
  const queue = [{ id: root.id, path: String(root.name || root.id), depth: 0 }];
  let foldersScanned = 0;

  while (queue.length > 0) {
    const folder = queue.shift();
    foldersScanned++;
    if (foldersScanned > EMAIL_ATTACH_CONFIG.MAX_FOLDERS_SCANNED) {
      throw new Error(`子資料夾超過 ${EMAIL_ATTACH_CONFIG.MAX_FOLDERS_SCANNED} 個，請指定範圍較小的資料夾。`);
    }

    let pageToken = null;
    do {
      const page = d.listFolderChildren(folder.id, pageToken) || {};
      (page.files || []).forEach(item => {
        const mime = String(item.mimeType || "");
        const name = String(item.name || "");
        const path = `${folder.path}/${name}`;

        if (mime === DRIVE_FOLDER_MIME) {
          if (folder.depth + 1 > EMAIL_ATTACH_CONFIG.MAX_FOLDER_DEPTH) {
            throw new Error(`子資料夾超過 ${EMAIL_ATTACH_CONFIG.MAX_FOLDER_DEPTH} 層（${path}），請指定較深層的資料夾。`);
          }
          if (!visited[item.id]) {
            visited[item.id] = true;
            queue.push({ id: item.id, path: path, depth: folder.depth + 1 });
          }
          return;
        }
        if (mime === DRIVE_SHORTCUT_MIME) {
          skipped.push({ name: name, path: folder.path, reason: "捷徑不支援，請放入實際檔案" });
          return;
        }
        const native = mime.indexOf(DRIVE_NATIVE_PREFIX) === 0;
        if (native && DRIVE_NATIVE_PDF_EXPORTABLE.indexOf(mime) === -1) {
          skipped.push({ name: name, path: folder.path, reason: "此 Google 檔案類型無法轉為附件" });
          return;
        }
        if (files.length >= EMAIL_ATTACH_CONFIG.MAX_INDEXED_FILES) {
          throw new Error(`資料夾內檔案超過 ${EMAIL_ATTACH_CONFIG.MAX_INDEXED_FILES} 個，請指定範圍較小的資料夾。`);
        }
        files.push({
          id: String(item.id),
          name: name,
          mimeType: mime,
          bytes: item.size !== undefined && item.size !== null && item.size !== "" ? Number(item.size) : null,
          native: native,
          path: folder.path
        });
      });
      pageToken = page.nextPageToken || null;
    } while (pageToken);
  }

  return {
    folderId: String(root.id),
    folderName: String(root.name || root.id),
    files: files,
    skipped: skipped,
    foldersScanned: foldersScanned
  };
}

function buildEmailMappingHash_(plan, deps) {
  const d = getEmailAttachDeps_(deps);
  const canonicalRows = plan.rows
    .map(row => JSON.stringify([
      row.email,
      row.status,
      row.willSend ? 1 : 0,
      row.files.map(f => f.id).sort().join(",")
    ]))
    .sort();
  const payload = JSON.stringify([
    plan.request.folderId,
    plan.request.matchKey,
    plan.request.missingPolicy,
    canonicalRows
  ]);
  return d.sha256Hex(payload);
}

function summarizeEmailAttachRows_(rows) {
  const byStatus = {};
  let willSend = 0;
  let withAttachments = 0;
  let attachmentCount = 0;
  rows.forEach(row => {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    if (row.willSend) {
      willSend++;
      if (row.files.length > 0) withAttachments++;
      attachmentCount += row.files.length;
    }
  });
  return {
    recipients: rows.length,
    willSend: willSend,
    withAttachments: withAttachments,
    withoutAttachments: willSend - withAttachments,
    attachmentCount: attachmentCount,
    byStatus: byStatus
  };
}

function toEmailAttachPreviewResponse_(plan) {
  const limit = EMAIL_ATTACH_CONFIG.REPORT_LIST_LIMIT;
  return {
    mappingHash: plan.mappingHash,
    folder: {
      id: plan.index.folderId,
      name: plan.index.folderName,
      filesIndexed: plan.index.files.length,
      foldersScanned: plan.index.foldersScanned
    },
    summary: plan.summary,
    rows: plan.rows.map(row => ({
      email: row.email,
      name: row.name,
      key: row.key,
      status: row.status,
      reason: row.reason,
      willSend: row.willSend,
      totalBytes: row.totalBytes,
      files: row.files.map(f => ({ name: f.name, bytes: f.bytes, native: f.native, path: f.path }))
    })),
    unmatchedCount: plan.unmatchedFiles.length,
    unmatchedFiles: plan.unmatchedFiles.slice(0, limit).map(f => ({ name: f.name, path: f.path })),
    ambiguousCount: plan.ambiguousFiles.length,
    ambiguousFiles: plan.ambiguousFiles.slice(0, limit).map(a => ({
      name: a.file.name, path: a.file.path, keys: a.keys, reason: a.reason
    })),
    skippedCount: plan.index.skipped.length,
    skippedFiles: plan.index.skipped.slice(0, limit),
    limits: {
      maxRecipients: EMAIL_ATTACH_CONFIG.MAX_RECIPIENTS_PER_JOB,
      maxFilesPerRecipient: EMAIL_ATTACH_CONFIG.MAX_FILES_PER_RECIPIENT,
      maxBytesPerEmail: EMAIL_ATTACH_CONFIG.MAX_BYTES_PER_EMAIL
    }
  };
}

/* -----------------------------------------
   SEND (chunked, ledgered, locked)
   ----------------------------------------- */

function sendPersonalizedEmailBatch_(request, deps) {
  const d = getEmailAttachDeps_(deps);
  const startedAt = d.now();
  const lock = d.acquireLock();
  try {
    const plan = buildEmailAttachmentPlan_(request, d, true);
    const req = plan.request;
    if (plan.mappingHash !== req.mappingHash) {
      throw new Error("附件配對結果與預覽時不同（資料夾內容或收件人已變更），請重新預覽後再寄送。已寄出的收件人不會重複寄送。");
    }

    const ledger = d.ledgerLoad(req.jobId);
    const sendable = plan.rows.filter(row => row.willSend);
    const alreadySent = sendable.filter(row => ledger.sent.has(row.email)).length;
    const previouslyFailed = sendable.filter(row => !ledger.sent.has(row.email) && ledger.failed.has(row.email)).length;
    const pending = sendable.filter(row => !ledger.sent.has(row.email) && !ledger.failed.has(row.email));

    const quota = d.getRemainingQuota();
    if (quota === 0 && pending.length > 0) {
      throw new Error("今日 Gmail 寄信額度已用完。請明天以相同工作繼續寄送（已寄出者不會重複）。");
    }

    const sender = d.currentUser();
    const results = [];
    let sentNow = 0;
    let failedNow = 0;
    let stoppedReason = "";
    let ledgerError = "";

    for (let i = 0; i < pending.length; i++) {
      if (d.now() - startedAt > EMAIL_ATTACH_CONFIG.CHUNK_TIME_BUDGET_MS) { stoppedReason = "TIME_BUDGET"; break; }
      if (quota > 0 && sentNow >= quota) { stoppedReason = "QUOTA"; break; }

      const row = pending[i];
      const outcome = sendOneAttachmentEmail_(row, req, d);
      try {
        d.ledgerAppend({
          jobId: req.jobId,
          email: row.email,
          subject: req.subject,
          status: outcome.ok ? "SENT" : `ERROR: ${outcome.status}: ${outcome.error}`,
          sender: sender,
          attachments: outcome.attachmentNames || row.files.map(f => f.name)
        });
      } catch (e) {
        // Without a ledger row this recipient could be re-sent on resume, so
        // stop the job here rather than keep sending unrecorded mail.
        ledgerError = getExceptionMessage_(e);
      }

      if (outcome.ok) sentNow++; else failedNow++;
      results.push({
        email: row.email,
        name: row.name,
        status: outcome.ok ? "SENT" : outcome.status,
        attachments: outcome.attachmentNames || [],
        error: outcome.ok ? "" : outcome.error
      });
      if (ledgerError) { stoppedReason = "LEDGER_ERROR"; break; }
    }

    const remaining = pending.length - sentNow - failedNow;
    const done = remaining === 0;
    const summary = {
      recipients: plan.rows.length,
      sendable: sendable.length,
      notSendable: plan.rows.length - sendable.length,
      alreadySent: alreadySent,
      previouslyFailed: previouslyFailed,
      sentThisCall: sentNow,
      failedThisCall: failedNow,
      remaining: remaining
    };

    let message;
    if (stoppedReason === "LEDGER_ERROR") {
      message = `寄送紀錄寫入失敗，為避免重複寄送已停止：${ledgerError}`;
    } else if (stoppedReason === "QUOTA") {
      message = `已達今日 Gmail 寄信額度，剩餘 ${remaining} 位請明天以相同工作繼續寄送。`;
    } else if (done) {
      message = `寄送完成：本次寄出 ${sentNow}，失敗 ${failedNow}，先前已寄出 ${alreadySent}。`;
    } else {
      message = `本批寄出 ${sentNow}，剩餘 ${remaining} 位，繼續寄送中…`;
    }

    d.log("SEND_EMAIL_ATTACH", req.jobId, done ? "COMPLETE" : (stoppedReason || "PARTIAL"),
      truncateLogDetail_(`Folder: ${plan.index.folderName}, Sendable: ${sendable.length}, SentNow: ${sentNow}, ` +
        `FailedNow: ${failedNow}, AlreadySent: ${alreadySent}, Remaining: ${remaining}` +
        (ledgerError ? `, LedgerError: ${ledgerError}` : ""), 3500));

    return {
      jobId: req.jobId,
      done: done,
      stoppedReason: stoppedReason,
      message: message,
      summary: summary,
      results: results
    };
  } finally {
    lock.release();
  }
}

function sendOneAttachmentEmail_(row, req, d) {
  try {
    const blobs = [];
    let totalBytes = 0;
    for (let i = 0; i < row.files.length; i++) {
      const blob = d.getAttachmentBlob(row.files[i]);
      totalBytes += blob.getBytes().length;
      // Native Google files have no size until exported, and sizes can change
      // after preview — enforce the cap on the real bytes before sending.
      if (totalBytes > EMAIL_ATTACH_CONFIG.MAX_BYTES_PER_EMAIL) {
        return {
          ok: false,
          status: EMAIL_ATTACH_STATUS.TOO_LARGE,
          error: `實際附件合計超過 ${formatBytes_(EMAIL_ATTACH_CONFIG.MAX_BYTES_PER_EMAIL)}，未寄送`
        };
      }
      blobs.push(blob);
    }
    const values = {
      name: row.name || row.email.split("@")[0],
      email: row.email,
      key: row.key
    };
    const subject = renderEmailTemplate_(req.subject, values, false);
    const htmlBody = renderEmailTemplate_(req.body, values, true);
    d.sendEmail(row.email, subject, htmlBody, req.senderName, blobs);
    return { ok: true, attachmentNames: blobs.map(b => b.getName()) };
  } catch (e) {
    return { ok: false, status: "FAILED", error: extractErrorReasonFromException_(e) };
  }
}

/** Replaces {name} {email} {key}. In HTML bodies the values are escaped. */
function renderEmailTemplate_(template, values, asHtml) {
  return String(template || "").replace(/\{(name|email|key)\}/g, function (match, field) {
    const value = String(values[field] === undefined || values[field] === null ? "" : values[field]);
    return asHtml ? escapeHtmlForEmail_(value) : value.replace(/[\r\n]+/g, " ");
  });
}

function escapeHtmlForEmail_(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeSenderName_(value) {
  const cleaned = String(value || "").replace(/[\r\n"<>]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return EMAIL_ATTACH_CONFIG.DEFAULT_SENDER_NAME;
  return cleaned.substring(0, EMAIL_ATTACH_CONFIG.MAX_SENDER_NAME_LENGTH);
}

function normalizeDispatchHeader_(value) {
  return normalizeWidth_(value)
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.:：()]/g, "");
}

function formatBytes_(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* -----------------------------------------
   LEDGER (Email_Logs) — additive upgrade of the legacy 5-column sheet
   ----------------------------------------- */

function ensureEmailLedgerSheet_() {
  const ss = getDBSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_EMAILS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_EMAILS);
    sheet.appendRow(EMAIL_LEDGER_HEADERS);
    sheet.setFrozenRows(1);
    return sheet;
  }
  // Legacy sheets (sendCustomEmailBatch) have 5 header cells; add the two new
  // ones without touching existing rows. Legacy rows simply have no JobId.
  const extra = sheet.getRange(1, 6, 1, 2).getValues()[0];
  if (!String(extra[0] || "").trim() && !String(extra[1] || "").trim()) {
    sheet.getRange(1, 6, 1, 2).setValues([[EMAIL_LEDGER_HEADERS[5], EMAIL_LEDGER_HEADERS[6]]]);
  }
  return sheet;
}

/**
 * Reads this job's ledger rows. TextFinder locates the job's rows without
 * reading the whole (unbounded) sheet; one block read then covers them all,
 * since a job's rows are appended close together.
 */
function loadEmailJobLedger_(sheet, jobId) {
  const sent = new Set();
  const failed = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sent: sent, failed: failed };

  const hits = sheet.getRange(2, 6, lastRow - 1, 1)
    .createTextFinder(String(jobId))
    .matchEntireCell(true)
    .findAll();
  if (!hits || hits.length === 0) return { sent: sent, failed: failed };

  let minRow = Infinity;
  let maxRow = 0;
  hits.forEach(cell => {
    const r = cell.getRow();
    if (r < minRow) minRow = r;
    if (r > maxRow) maxRow = r;
  });
  const values = sheet.getRange(minRow, 2, maxRow - minRow + 1, 5).getValues(); // B..F
  values.forEach(v => {
    if (String(v[4]) !== String(jobId)) return;
    const email = String(v[0] || "").toLowerCase();
    if (String(v[2]) === "SENT") sent.add(email);
    else failed.add(email);
  });
  sent.forEach(email => failed.delete(email));
  return { sent: sent, failed: failed };
}

function appendEmailLedgerRow_(sheet, entry) {
  sheet.appendRow([
    new Date(),
    entry.email,
    entry.subject,
    entry.status,
    entry.sender || "",
    entry.jobId,
    truncateLogDetail_((entry.attachments || []).join(", "), 1000)
  ]);
}

/* -----------------------------------------
   DEPENDENCIES (injection seam for tests)
   ----------------------------------------- */

function getEmailAttachDeps_(deps) {
  if (deps && deps.__emailAttachResolved) return deps;
  const d = deps || {};
  let ledgerSheet = null;
  const getLedgerSheet = function () {
    if (!ledgerSheet) ledgerSheet = ensureEmailLedgerSheet_();
    return ledgerSheet;
  };
  return {
    __emailAttachResolved: true,
    getFolderMeta: d.getFolderMeta || defaultGetDriveFolderMeta_,
    listFolderChildren: d.listFolderChildren || defaultListDriveFolderChildren_,
    getAttachmentBlob: d.getAttachmentBlob || defaultGetAttachmentBlob_,
    sendEmail: d.sendEmail || defaultSendAttachmentEmail_,
    getRemainingQuota: d.getRemainingQuota || defaultGetRemainingMailQuota_,
    acquireLock: d.acquireLock || defaultAcquireEmailAttachLock_,
    ledgerLoad: d.ledgerLoad || function (jobId) { return loadEmailJobLedger_(getLedgerSheet(), jobId); },
    ledgerAppend: d.ledgerAppend || function (entry) { appendEmailLedgerRow_(getLedgerSheet(), entry); },
    sha256Hex: d.sha256Hex || sha256Hex_,
    now: d.now || function () { return Date.now(); },
    currentUser: d.currentUser || function () {
      try { return Session.getActiveUser().getEmail(); } catch (e) { return ""; }
    },
    log: d.log || logSystemAction_
  };
}

function defaultGetDriveFolderMeta_(folderId) {
  try {
    return Drive.Files.get(folderId, { fields: "id,name,mimeType,trashed", supportsAllDrives: true });
  } catch (e) {
    const sig = getDriveErrorSignature_(e);
    if (sig.code === 404) throw new Error("找不到資料夾，或您沒有此資料夾的存取權限。");
    throw new Error(`無法存取資料夾：${extractErrorReasonFromException_(e)}`);
  }
}

function defaultListDriveFolderChildren_(folderId, pageToken) {
  // folderId is validated by extractDriveFolderId_ / comes from the API, so it
  // cannot break out of the quoted query literal.
  const params = {
    q: `'${folderId}' in parents and trashed = false`,
    fields: "nextPageToken,files(id,name,mimeType,size)",
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives"
  };
  if (pageToken) params.pageToken = pageToken;
  const response = Drive.Files.list(params);
  return { files: response.files || [], nextPageToken: response.nextPageToken || null };
}

function defaultGetAttachmentBlob_(file) {
  const driveFile = DriveApp.getFileById(file.id);
  if (file.native) {
    return driveFile.getAs(MimeType.PDF).setName(`${stripFileExtension_(file.name)}.pdf`);
  }
  return driveFile.getBlob().setName(file.name);
}

function defaultSendAttachmentEmail_(to, subject, htmlBody, senderName, blobs) {
  const options = { htmlBody: htmlBody, name: senderName };
  if (blobs && blobs.length > 0) options.attachments = blobs;
  GmailApp.sendEmail(to, subject, "", options);
}

/** Remaining recipients for today, or -1 when the quota cannot be read. */
function defaultGetRemainingMailQuota_() {
  try {
    const n = MailApp.getRemainingDailyQuota();
    return typeof n === "number" && n >= 0 ? n : -1;
  } catch (e) {
    return -1;
  }
}

function defaultAcquireEmailAttachLock_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(EMAIL_ATTACH_CONFIG.LOCK_WAIT_MS)) {
    throw new Error("另一個個別附件寄送批次正在執行中，請稍候再試。");
  }
  return { release: function () { try { lock.releaseLock(); } catch (e) { /* already released */ } } };
}

function sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return hex;
}
