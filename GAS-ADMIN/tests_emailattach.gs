/**
 * Unit tests for emailattach.gs (v2.9.0 per-student email attachments).
 *
 * Hermetic: every Drive / Gmail / Sheet / Lock / Session touch point is injected
 * through getEmailAttachDeps_(deps). Nothing here reads Script Properties,
 * opens the DB spreadsheet, sends mail, or calls Utilities crypto.
 */
function runEmailAttachUnitTests() {
  const tests = [
    test_stripFileExtension_onlyRealExtension,
    test_normalizeMatchText_foldsFullWidth,
    test_extractDriveFolderId_formats,
    test_matchFilesToKeys_exactAndSeparatorPrefix,
    test_matchFilesToKeys_prefixNeedsSeparator,
    test_matchFilesToKeys_ambiguousPrefixGoesToNobody,
    test_matchFilesToKeys_duplicateFileNameGoesToNobody,
    test_parseEmailDispatchCsv_headerAliasesBomAndQuotes,
    test_parseEmailDispatchCsv_positionalLayoutAndDuplicates,
    test_parseEmailDispatchCsv_tsvWithoutHeader,
    test_indexDriveFolder_recursesAndSkipsUnsupported,
    test_indexDriveFolder_refusesToTruncate,
    test_buildEmailAttachmentPlan_statuses,
    test_buildEmailAttachmentPlan_duplicateKeyInListMode,
    test_buildEmailAttachmentPlan_sendWithoutPolicy,
    test_buildEmailMappingHash_ignoresRecipientOrder,
    test_sendPersonalizedEmailBatch_skipsLedgeredAndRecordsEachSend,
    test_sendPersonalizedEmailBatch_rejectsChangedMapping,
    test_sendPersonalizedEmailBatch_stopsAtTimeBudget,
    test_sendPersonalizedEmailBatch_enforcesRealSizeAtSendTime,
    test_sendPersonalizedEmailBatch_stopsWhenLedgerWriteFails,
    test_sendPersonalizedEmailBatch_releasesLockOnError,
    test_renderEmailTemplate_escapesHtmlValues
  ];

  let passCount = 0;
  const failures = [];
  tests.forEach(testFn => {
    try {
      testFn();
      passCount++;
    } catch (e) {
      failures.push(`${testFn.name}: ${e.message}`);
    }
  });

  const summary = `Email attachment tests passed ${passCount}/${tests.length}.`;
  if (failures.length > 0) {
    throw new Error(`${summary}\n${failures.join("\n")}`);
  }
  return summary;
}

/* ---------- fakes ---------- */

const FAKE_ROOT_FOLDER_ID = "rootFolder0001";

/**
 * @param {Object<string, Array>} tree folderId -> children [{id,name,mimeType,size}]
 * @param {Object=} extra overrides merged into deps
 */
function createFakeEmailAttachDeps_(tree, extra) {
  const state = {
    sent: [],
    ledgerRows: [],
    lockAcquired: 0,
    lockReleased: 0,
    clock: 0,
    preSent: new Set(),
    preFailed: new Set()
  };
  const deps = {
    getFolderMeta: function (id) {
      if (id !== FAKE_ROOT_FOLDER_ID) throw new Error("找不到資料夾");
      return { id: id, name: "照片", mimeType: DRIVE_FOLDER_MIME };
    },
    listFolderChildren: function (id) {
      return { files: (tree[id] || []).slice(), nextPageToken: null };
    },
    getAttachmentBlob: function (file) {
      const size = file.bytes || 10;
      return { getBytes: function () { return { length: size }; }, getName: function () { return file.name; } };
    },
    sendEmail: function (to, subject, htmlBody, senderName, blobs) {
      state.sent.push({ to: to, subject: subject, htmlBody: htmlBody, senderName: senderName, files: blobs.map(b => b.getName()) });
    },
    getRemainingQuota: function () { return -1; },
    acquireLock: function () {
      state.lockAcquired++;
      return { release: function () { state.lockReleased++; } };
    },
    ledgerLoad: function () { return { sent: new Set(state.preSent), failed: new Set(state.preFailed) }; },
    ledgerAppend: function (entry) { state.ledgerRows.push(entry); },
    sha256Hex: function (text) {
      // Deterministic, non-cryptographic stand-in: 64 hex chars derived from the text.
      let h1 = 0x811c9dc5;
      let h2 = 0x01000193;
      for (let i = 0; i < text.length; i++) {
        h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
        h2 = Math.imul(h2 + text.charCodeAt(i), 2246822519) >>> 0;
      }
      const part = (h1.toString(16) + h2.toString(16)).padStart(16, "0");
      return (part + part + part + part).substring(0, 64);
    },
    now: function () { return state.clock; },
    currentUser: function () { return "admin@x.edu"; },
    log: function () {}
  };
  Object.keys(extra || {}).forEach(k => { deps[k] = extra[k]; });
  return { deps: deps, state: state };
}

function fakeFile_(id, name, bytes, mimeType) {
  return { id: id, name: name, mimeType: mimeType || "image/jpeg", size: bytes === undefined ? 1000 : bytes };
}

function baseAttachRequest_(recipients, overrides) {
  const req = {
    folderId: FAKE_ROOT_FOLDER_ID,
    recipientSource: "LIST",
    matchKey: "EMAIL_LOCAL",
    missingPolicy: "SKIP",
    recipients: recipients
  };
  Object.keys(overrides || {}).forEach(k => { req[k] = overrides[k]; });
  return req;
}

function sendableRequest_(fake, recipients, overrides) {
  const req = baseAttachRequest_(recipients, overrides);
  const plan = buildEmailAttachmentPlan_(req, fake.deps, false);
  req.jobId = "job-0001-test";
  req.subject = "【通知】{name} 的照片";
  req.body = "<p>{name} 您好</p>";
  req.senderName = "校園資訊系統";
  req.mappingHash = plan.mappingHash;
  return req;
}

/* ---------- pure helpers ---------- */

function test_stripFileExtension_onlyRealExtension() {
  assertEqual_(stripFileExtension_("s001.jpg"), "s001", "Simple extension");
  assertEqual_(stripFileExtension_("s001.v2.jpg"), "s001.v2", "Only the LAST extension is removed");
  assertEqual_(stripFileExtension_("s001"), "s001", "No extension (Google Docs)");
  assertEqual_(stripFileExtension_(".hidden"), ".hidden", "Leading-dot name kept");
  assertEqual_(stripFileExtension_("王小明.成績單"), "王小明.成績單", "Non-alphanumeric suffix is not an extension");
}

function test_normalizeMatchText_foldsFullWidth() {
  assertEqual_(normalizeMatchText_("  Ｓ００１ "), "s001", "Full-width letters/digits fold and lower-case");
  assertEqual_(normalizeMatchText_(null), "", "Null -> empty");
}

function test_extractDriveFolderId_formats() {
  const id = "1AbCdEfGhIjKlMnOp_qr-st";
  assertEqual_(extractDriveFolderId_(`https://drive.google.com/drive/folders/${id}?usp=sharing`), id, "folders URL");
  assertEqual_(extractDriveFolderId_(`https://drive.google.com/drive/u/0/folders/${id}`), id, "u/0 folders URL");
  assertEqual_(extractDriveFolderId_(`https://drive.google.com/open?id=${id}`), id, "open?id URL");
  assertEqual_(extractDriveFolderId_(id), id, "Bare id");
  assertEqual_(extractDriveFolderId_("' or 1=1"), "", "Garbage rejected");
  assertEqual_(extractDriveFolderId_(""), "", "Empty rejected");
}

function test_matchFilesToKeys_exactAndSeparatorPrefix() {
  const files = [
    { id: "1", name: "s001.jpg" },
    { id: "2", name: "s001_成績單.pdf" },
    { id: "3", name: "s001.v2.jpg" },
    { id: "4", name: "s002-1.png" },
    { id: "5", name: "other.txt" }
  ];
  const result = matchFilesToKeys_(files, ["s001", "s002"]);
  assertEqual_((result.byKey.s001 || []).map(f => f.id).join(","), "1,2,3", "Exact + _ + . separators");
  assertEqual_((result.byKey.s002 || []).map(f => f.id).join(","), "4", "- separator");
  assertEqual_(result.unmatched.map(f => f.id).join(","), "5", "Unmatched reported");
  assertEqual_(result.ambiguous.length, 0, "Nothing ambiguous");
}

function test_matchFilesToKeys_prefixNeedsSeparator() {
  const result = matchFilesToKeys_([{ id: "1", name: "s10_x.jpg" }, { id: "2", name: "s1.jpg" }], ["s1"]);
  assertEqual_((result.byKey.s1 || []).map(f => f.id).join(","), "2", "s1 must not take s10_x");
  assertEqual_(result.unmatched.length, 1, "s10_x stays unmatched");
}

function test_matchFilesToKeys_ambiguousPrefixGoesToNobody() {
  const files = [{ id: "1", name: "wang.xm_photo.jpg" }, { id: "2", name: "wang.xm.jpg" }];
  const result = matchFilesToKeys_(files, ["wang", "wang.xm"]);
  assertEqual_(result.ambiguous.length, 1, "Prefix matching two keys is ambiguous");
  assertEqual_(result.ambiguous[0].file.id, "1", "The prefix file is the ambiguous one");
  assertEqual_((result.byKey["wang.xm"] || []).map(f => f.id).join(","), "2", "Exact match still wins");
  assertTrue_((result.ambiguousByKey.wang || []).length === 1, "Ambiguity recorded against every candidate key");
  assertFalse_(result.byKey.wang, "Ambiguous file assigned to nobody");
}

function test_matchFilesToKeys_duplicateFileNameGoesToNobody() {
  // The v1.2.0 dispatcher's index silently kept only the LAST of these.
  const files = [{ id: "A", name: "01.jpg" }, { id: "B", name: "01.jpg" }];
  const result = matchFilesToKeys_(files, ["01"]);
  assertFalse_(result.byKey["01"], "Duplicate-named files are never attached");
  assertEqual_(result.ambiguous.length, 2, "Both copies reported");
  assertEqual_((result.ambiguousByKey["01"] || []).length, 2, "Recipient is held back");
}

/* ---------- CSV (dispatcher list) ---------- */

function test_parseEmailDispatchCsv_headerAliasesBomAndQuotes() {
  const csv = "﻿學號,姓名,Email\n" +
    "s001,\"王, 小明\",S001@x.edu\n" +
    "s002,李小華,s002@x.edu\n";
  const result = parseEmailDispatchCsv("list.csv", csv);
  assertEqual_(result.headerMode, "HEADER", "Aliases recognized despite BOM");
  assertEqual_(result.recipients.length, 2, "Two recipients");
  assertEqual_(result.recipients[0].name, "王, 小明", "Quoted comma kept inside the field");
  assertEqual_(result.recipients[0].email, "s001@x.edu", "Email lower-cased");
  assertEqual_(result.recipients[0].key, "s001", "Key from 學號 column");
}

function test_parseEmailDispatchCsv_positionalLayoutAndDuplicates() {
  const csv = "StudentCode,Address\n" +
    "s001,s001@x.edu\n" +
    "s002,not-an-email\n" +
    ",s003@x.edu\n" +
    "s004,s001@x.edu\n" +
    "\n";
  const result = parseEmailDispatchCsv("list.csv", csv);
  assertEqual_(result.headerMode, "POSITIONAL", "Unknown headers -> dispatcher layout");
  assertEqual_(result.recipients.length, 1, "Only s001 is valid");
  assertEqual_(result.skipped.length, 3, "Invalid email, missing key, duplicate email skipped");
  assertTrue_(result.skipped[2].reason.indexOf("重複") !== -1, "Duplicate email reason");
}

function test_parseEmailDispatchCsv_tsvWithoutHeader() {
  const tsv = "s001\ts001@x.edu\ns002\ts002@x.edu";
  const result = parseEmailDispatchCsv("list.tsv", tsv);
  assertEqual_(result.delimiter, "TAB", "TSV detected");
  assertEqual_(result.recipients.length, 2, "Row 1 is data because B1 is an email");
}

/* ---------- folder index ---------- */

function test_indexDriveFolder_recursesAndSkipsUnsupported() {
  const tree = {};
  tree[FAKE_ROOT_FOLDER_ID] = [
    fakeFile_("f1", "s001.jpg"),
    { id: "sub1", name: "6年一班", mimeType: DRIVE_FOLDER_MIME },
    { id: "sc1", name: "s009.jpg", mimeType: DRIVE_SHORTCUT_MIME },
    { id: "form1", name: "問卷", mimeType: "application/vnd.google-apps.form" }
  ];
  tree.sub1 = [
    fakeFile_("f2", "s002.jpg"),
    { id: "doc1", name: "s003", mimeType: "application/vnd.google-apps.document" }
  ];
  const fake = createFakeEmailAttachDeps_(tree);
  const index = indexDriveFolderForAttachments_(FAKE_ROOT_FOLDER_ID, fake.deps);
  assertEqual_(index.files.map(f => f.id).sort().join(","), "doc1,f1,f2", "Recursed into subfolder; Doc is exportable");
  assertTrue_(index.files.filter(f => f.id === "doc1")[0].native, "Doc flagged native (PDF export)");
  assertEqual_(index.skipped.length, 2, "Shortcut and Form skipped with reasons");
  assertEqual_(index.foldersScanned, 2, "Two folders scanned");
}

function test_indexDriveFolder_refusesToTruncate() {
  const tree = {};
  const many = [];
  for (let i = 0; i <= EMAIL_ATTACH_CONFIG.MAX_INDEXED_FILES; i++) many.push(fakeFile_(`f${i}`, `s${i}.jpg`));
  tree[FAKE_ROOT_FOLDER_ID] = many;
  const fake = createFakeEmailAttachDeps_(tree);
  assertThrows_(function () {
    indexDriveFolderForAttachments_(FAKE_ROOT_FOLDER_ID, fake.deps);
  }, "超過", "Over the file cap must throw, never silently truncate");

  const deep = {};
  let parent = FAKE_ROOT_FOLDER_ID;
  for (let level = 1; level <= EMAIL_ATTACH_CONFIG.MAX_FOLDER_DEPTH + 1; level++) {
    deep[parent] = [{ id: `lvl${level}`, name: `L${level}`, mimeType: DRIVE_FOLDER_MIME }];
    parent = `lvl${level}`;
  }
  const deepFake = createFakeEmailAttachDeps_(deep);
  assertThrows_(function () {
    indexDriveFolderForAttachments_(FAKE_ROOT_FOLDER_ID, deepFake.deps);
  }, "層", "Over the depth cap must throw");
}

/* ---------- plan ---------- */

function test_buildEmailAttachmentPlan_statuses() {
  const tree = {};
  const tooMany = [];
  for (let i = 0; i <= EMAIL_ATTACH_CONFIG.MAX_FILES_PER_RECIPIENT; i++) tooMany.push(fakeFile_(`m${i}`, `many_${i}.jpg`));
  tree[FAKE_ROOT_FOLDER_ID] = [
    fakeFile_("ok1", "good.jpg"),
    fakeFile_("big1", "big.jpg", EMAIL_ATTACH_CONFIG.MAX_BYTES_PER_EMAIL + 1),
    fakeFile_("d1", "dup.jpg"),
    fakeFile_("d2", "dup.jpg")
  ].concat(tooMany);
  const fake = createFakeEmailAttachDeps_(tree);
  const plan = buildEmailAttachmentPlan_(baseAttachRequest_([
    { email: "good@x.edu", name: "Good" },
    { email: "big@x.edu", name: "Big" },
    { email: "dup@x.edu", name: "Dup" },
    { email: "many@x.edu", name: "Many" },
    { email: "none@x.edu", name: "None" },
    { email: "broken", name: "Broken" },
    { email: "GOOD@x.edu", name: "Good again" }
  ]), fake.deps, false);

  const status = {};
  plan.rows.forEach(r => { status[`${r.email}#${r.index}`] = r.status; });
  assertEqual_(status["good@x.edu#0"], "MATCHED", "good");
  assertEqual_(status["big@x.edu#1"], "TOO_LARGE", "big");
  assertEqual_(status["dup@x.edu#2"], "AMBIGUOUS", "duplicate file names");
  assertEqual_(status["many@x.edu#3"], "TOO_MANY", "too many files");
  assertEqual_(status["none@x.edu#4"], "NO_MATCH", "no file");
  assertEqual_(status["broken#5"], "INVALID_EMAIL", "invalid email");
  assertEqual_(status["good@x.edu#6"], "DUPLICATE_EMAIL", "duplicate recipient");
  assertEqual_(plan.summary.willSend, 1, "Only the MATCHED row will be sent under SKIP policy");
  assertTrue_(/^[0-9a-f]{64}$/.test(plan.mappingHash), "Mapping hash produced");
}

function test_buildEmailAttachmentPlan_duplicateKeyInListMode() {
  const tree = {};
  tree[FAKE_ROOT_FOLDER_ID] = [fakeFile_("f1", "王小明.jpg")];
  const fake = createFakeEmailAttachDeps_(tree);
  const listPlan = buildEmailAttachmentPlan_(baseAttachRequest_([
    { email: "a@x.edu", name: "王小明" },
    { email: "b@x.edu", name: "王小明" }
  ], { matchKey: "NAME" }), fake.deps, false);
  assertEqual_(listPlan.rows.map(r => r.status).join(","), "DUPLICATE_KEY,DUPLICATE_KEY",
    "Same name for two checked people -> neither gets the file");

  const csvPlan = buildEmailAttachmentPlan_(baseAttachRequest_([
    { email: "student@x.edu", key: "王小明" },
    { email: "parent@x.edu", key: "王小明" }
  ], { recipientSource: "CSV" }), fake.deps, false);
  assertEqual_(csvPlan.rows.map(r => r.status).join(","), "MATCHED,MATCHED",
    "In CSV mode a shared key is an explicit mapping and is honored");
}

function test_buildEmailAttachmentPlan_sendWithoutPolicy() {
  const tree = {};
  tree[FAKE_ROOT_FOLDER_ID] = [fakeFile_("d1", "dup.jpg"), fakeFile_("d2", "dup.jpg")];
  const fake = createFakeEmailAttachDeps_(tree);
  const plan = buildEmailAttachmentPlan_(baseAttachRequest_([
    { email: "none@x.edu" },
    { email: "dup@x.edu" }
  ], { missingPolicy: "SEND_WITHOUT" }), fake.deps, false);
  assertTrue_(plan.rows[0].willSend, "NO_MATCH is sent without attachment under SEND_WITHOUT");
  assertFalse_(plan.rows[1].willSend, "AMBIGUOUS is never sent, even under SEND_WITHOUT");
}

function test_buildEmailMappingHash_ignoresRecipientOrder() {
  const tree = {};
  tree[FAKE_ROOT_FOLDER_ID] = [fakeFile_("f1", "a.jpg"), fakeFile_("f2", "b.jpg")];
  const fake = createFakeEmailAttachDeps_(tree);
  const one = buildEmailAttachmentPlan_(baseAttachRequest_([{ email: "a@x.edu" }, { email: "b@x.edu" }]), fake.deps, false);
  const two = buildEmailAttachmentPlan_(baseAttachRequest_([{ email: "b@x.edu" }, { email: "a@x.edu" }]), fake.deps, false);
  assertEqual_(one.mappingHash, two.mappingHash, "Same mapping -> same hash regardless of order");

  tree[FAKE_ROOT_FOLDER_ID].push(fakeFile_("f3", "a_2.jpg"));
  const three = buildEmailAttachmentPlan_(baseAttachRequest_([{ email: "a@x.edu" }, { email: "b@x.edu" }]), fake.deps, false);
  assertTrue_(one.mappingHash !== three.mappingHash, "A new matching file changes the hash");
}

/* ---------- send ---------- */

function test_sendPersonalizedEmailBatch_skipsLedgeredAndRecordsEachSend() {
  const tree = {};
  tree[FAKE_ROOT_FOLDER_ID] = [fakeFile_("f1", "s001.jpg"), fakeFile_("f2", "s002.jpg"), fakeFile_("f3", "s003.jpg")];
  const fake = createFakeEmailAttachDeps_(tree);
  fake.state.preSent.add("s001@x.edu");   // sent by an earlier chunk of this job
  fake.state.preFailed.add("s003@x.edu"); // failed earlier; not retried within the job
  const req = sendableRequest_(fake, [
    { email: "s001@x.edu", name: "甲" },
    { email: "s002@x.edu", name: "乙" },
    { email: "s003@x.edu", name: "丙" }
  ]);

  const result = sendPersonalizedEmailBatch_(req, fake.deps);
  assertEqual_(fake.state.sent.length, 1, "Only the un-ledgered recipient is sent");
  assertEqual_(fake.state.sent[0].to, "s002@x.edu", "s002 sent");
  assertEqual_(fake.state.sent[0].files.join(","), "s002.jpg", "Own file attached");
  assertEqual_(fake.state.sent[0].subject, "【通知】乙 的照片", "Subject personalized");
  assertEqual_(fake.state.ledgerRows.length, 1, "One ledger row per send");
  assertEqual_(fake.state.ledgerRows[0].status, "SENT", "Ledgered as SENT");
  assertTrue_(result.done, "Job done");
  assertEqual_(result.summary.alreadySent, 1, "alreadySent counted");
  assertEqual_(result.summary.previouslyFailed, 1, "previouslyFailed counted");
  assertEqual_(fake.state.lockReleased, 1, "Lock released");
}

function test_sendPersonalizedEmailBatch_rejectsChangedMapping() {
  const tree = {};
  tree[FAKE_ROOT_FOLDER_ID] = [fakeFile_("f1", "s001.jpg")];
  const fake = createFakeEmailAttachDeps_(tree);
  const req = sendableRequest_(fake, [{ email: "s001@x.edu" }, { email: "s002@x.edu" }]);
  tree[FAKE_ROOT_FOLDER_ID].push(fakeFile_("f2", "s002.jpg")); // folder changed after preview
  assertThrows_(function () {
    sendPersonalizedEmailBatch_(req, fake.deps);
  }, "重新預覽", "Changed mapping must be refused");
  assertEqual_(fake.state.sent.length, 0, "Nothing sent");
  assertEqual_(fake.state.lockReleased, 1, "Lock released after refusal");
}

function test_sendPersonalizedEmailBatch_stopsAtTimeBudget() {
  const tree = {};
  tree[FAKE_ROOT_FOLDER_ID] = [fakeFile_("f1", "s001.jpg"), fakeFile_("f2", "s002.jpg")];
  const fake = createFakeEmailAttachDeps_(tree, {
    sendEmail: function (to, subject, html, sender, blobs) {
      fake.state.sent.push({ to: to, files: blobs.map(b => b.getName()) });
      fake.state.clock += EMAIL_ATTACH_CONFIG.CHUNK_TIME_BUDGET_MS + 1; // first send exhausts the budget
    }
  });
  const req = sendableRequest_(fake, [{ email: "s001@x.edu" }, { email: "s002@x.edu" }]);
  const result = sendPersonalizedEmailBatch_(req, fake.deps);
  assertFalse_(result.done, "Not done");
  assertEqual_(result.stoppedReason, "TIME_BUDGET", "Stopped for time");
  assertEqual_(result.summary.remaining, 1, "One remaining for the next chunk");
  assertEqual_(fake.state.ledgerRows.length, 1, "The completed send is ledgered before stopping");
}

function test_sendPersonalizedEmailBatch_enforcesRealSizeAtSendTime() {
  const tree = {};
  // A Google Doc reports no size at preview; the export is what counts.
  tree[FAKE_ROOT_FOLDER_ID] = [{ id: "doc1", name: "s001", mimeType: "application/vnd.google-apps.document" }];
  const fake = createFakeEmailAttachDeps_(tree, {
    getAttachmentBlob: function (file) {
      return {
        getBytes: function () { return { length: EMAIL_ATTACH_CONFIG.MAX_BYTES_PER_EMAIL + 1 }; },
        getName: function () { return `${file.name}.pdf`; }
      };
    }
  });
  const req = sendableRequest_(fake, [{ email: "s001@x.edu" }]);
  const result = sendPersonalizedEmailBatch_(req, fake.deps);
  assertEqual_(fake.state.sent.length, 0, "Oversize export not sent");
  assertEqual_(result.results[0].status, "TOO_LARGE", "Reported TOO_LARGE");
  assertTrue_(fake.state.ledgerRows[0].status.indexOf("ERROR: TOO_LARGE") === 0, "Ledgered as error (not retried)");
}

function test_sendPersonalizedEmailBatch_stopsWhenLedgerWriteFails() {
  const tree = {};
  tree[FAKE_ROOT_FOLDER_ID] = [fakeFile_("f1", "s001.jpg"), fakeFile_("f2", "s002.jpg")];
  const fake = createFakeEmailAttachDeps_(tree, {
    ledgerAppend: function () { throw new Error("Sheet unavailable"); }
  });
  const req = sendableRequest_(fake, [{ email: "s001@x.edu" }, { email: "s002@x.edu" }]);
  const result = sendPersonalizedEmailBatch_(req, fake.deps);
  assertEqual_(fake.state.sent.length, 1, "Stops right after the first unrecorded send");
  assertEqual_(result.stoppedReason, "LEDGER_ERROR", "Reason reported");
  assertFalse_(result.done, "Not done");
}

function test_sendPersonalizedEmailBatch_releasesLockOnError() {
  const fake = createFakeEmailAttachDeps_({});
  const req = baseAttachRequest_([{ email: "s001@x.edu" }]);
  req.jobId = "job-0001-test";
  req.subject = "x";
  req.body = "y";
  req.mappingHash = "0".repeat(64);
  req.folderId = "wrongFolder0001"; // getFolderMeta throws
  assertThrows_(function () { sendPersonalizedEmailBatch_(req, fake.deps); }, "找不到資料夾", "Error propagates");
  assertEqual_(fake.state.lockAcquired, 1, "Lock taken");
  assertEqual_(fake.state.lockReleased, 1, "Lock always released");
}

function test_renderEmailTemplate_escapesHtmlValues() {
  const html = renderEmailTemplate_("<p>{name} / {email} / {key}</p>", { name: "<b>王</b>", email: "a@x.edu", key: "s001" }, true);
  assertEqual_(html, "<p>&lt;b&gt;王&lt;/b&gt; / a@x.edu / s001</p>", "Values escaped, template HTML kept");
  const subject = renderEmailTemplate_("Hi {name}", { name: "A\nB" }, false);
  assertEqual_(subject, "Hi A B", "Newlines stripped from subject values");
}
