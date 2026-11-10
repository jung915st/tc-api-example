/**
 * ============================================================================
 * Course Materials Drive Provisioning (v2.8.0) — implements ADR-001
 * ============================================================================
 *
 * Removes the three manual steps around course material folders:
 *   1. teacher creates a folder            -> provisionCourseDrives()
 *   2. teacher shares it with each student -> a ONE-TIME grant to the
 *                                             Classroom-maintained course group
 *   3. student adds a shortcut so the folder appears in Drive for desktop
 *                                          -> not needed in SHARED_DRIVE mode;
 *                                             automated in SHORTCUT mode
 *
 * The load-bearing idea (ADR-001 finding F1): `Course.courseGroupEmail` is a
 * Google group that Classroom creates per course and keeps in sync with the
 * roster. Granting Drive access to that group once means a transfer student
 * inherits access simply by being enrolled. We therefore never write per-student
 * ACLs — doing so would turn a one-time grant into an unbounded stream of
 * permission mutations and put us right back where we started.
 *
 * Two modes:
 *   SHARED_DRIVE (default, ADR Option A)
 *     One shared drive per course. Drive for desktop mounts shared drives
 *     natively, so nothing is ever written into a student account.
 *
 *   SHORTCUT (fallback, ADR Option B)
 *     A folder under a configured root, plus a shortcut created in each
 *     student's My Drive by impersonating them through the existing
 *     domain-wide-delegation service account. Needed where shared drives are
 *     disabled, or where materials must stay in My Drive. Requires the
 *     reconciler trigger, because a shortcut is a real file the student can
 *     delete or move.
 *
 * Every operation is idempotent and driven by the `Course_Drive_Map` registry
 * sheet, so a run that dies against the 6-minute ceiling can simply be re-run.
 */

const COURSE_DRIVE_CONFIG = {
  MODE_SHARED_DRIVE: "SHARED_DRIVE",
  MODE_SHORTCUT: "SHORTCUT",

  STATE_ACTIVE: "ACTIVE",
  STATE_ARCHIVED: "ARCHIVED",
  STATE_FAILED: "FAILED",
  // Classroom populates courseGroupEmail asynchronously, so a course created
  // seconds ago legitimately cannot be provisioned yet. PENDING records that
  // fact instead of dropping it, and maintenance retries it later.
  STATE_PENDING: "PENDING",

  // Students read; teachers organize. Drive resolves the most permissive grant,
  // so a teacher who is also inside courseGroupEmail still keeps write access.
  STUDENT_ROLE: "reader",
  TEACHER_ROLE: "fileOrganizer",
  ARCHIVED_STUDENT_ROLE: "reader",

  FOLDER_MIME: "application/vnd.google-apps.folder",
  SHORTCUT_MIME: "application/vnd.google-apps.shortcut",

  DRIVE_API_HOST: "www.googleapis.com",
  DRIVE_BATCH_ENDPOINT: "https://www.googleapis.com/batch/drive/v3",
  DRIVE_FILES_ENDPOINT: "https://www.googleapis.com/drive/v3/files",

  // appProperties are scoped to the OAuth client that wrote them, so this key
  // is a private marker only this project can see — and, unlike targetId, it is
  // queryable in a Drive `q` filter. That turns "does this student already have
  // the shortcut?" into one indexed lookup instead of paging their whole root.
  SHORTCUT_MARKER_KEY: "cdCourseId",
  SHORTCUT_TARGET_KEY: "cdTargetId",

  PROP_DEFAULT_MODE: "COURSE_DRIVE_DEFAULT_MODE",
  PROP_ROOT_FOLDER_ID: "COURSE_DRIVE_ROOT_FOLDER_ID",
  PROP_AUTO_PROVISION: "COURSE_DRIVE_AUTO_PROVISION",
  PROP_RECONCILE_CURSOR: "COURSE_DRIVE_RECONCILE_CURSOR",

  // A student's hand-made shortcut carries none of our appProperties, so the
  // marker lookup cannot see it. We fall back to scanning their My Drive root
  // for a shortcut pointing at the same target, bounded by this page size.
  ROOT_SHORTCUT_SCAN_PAGE_SIZE: 200,

  // A shared drive is not instantly consistent after Drives.create: the first
  // permissions.create against it can return "File not found". Same propagation
  // problem the Drive audit already handles, so the same constants are reused.
  GRANT_MAX_ATTEMPTS: 3,

  MAX_COURSES_PER_RUN: 40,
  // Leaves ~90s of the 6-minute ceiling for sheet writes and logging.
  BUDGET_MS: 270000,
  NAME_MAX_LENGTH: 120,
  MAINTENANCE_TRIGGER_HANDLER: "runCourseDriveMaintenance",

  REGISTRY_HEADERS: [
    "Course ID", "Course Name", "Section", "Mode", "Drive ID", "Folder ID",
    "Folder URL", "Course Group", "Teacher Group", "State",
    "Provisioned At", "Last Reconciled At", "Note"
  ]
};

/* ==================== dependency injection seam ==================== */

/**
 * Everything that touches a Google service goes through here so the unit tests
 * can run entirely offline, matching the convention already used by
 * getUserBatchDeps_ and the Drive escalation helpers.
 */
function getCourseDriveDeps_(overrides) {
  const base = {
    classroomCourses: (typeof Classroom !== "undefined" && Classroom.Courses) ? Classroom.Courses : null,
    drivesApi: (typeof Drive !== "undefined" && Drive.Drives) ? Drive.Drives : null,
    filesApi: (typeof Drive !== "undefined" && Drive.Files) ? Drive.Files : null,
    permissionsApi: (typeof Drive !== "undefined" && Drive.Permissions) ? Drive.Permissions : null,
    fetchFn: function (url, params) { return UrlFetchApp.fetch(url, params); },
    // NOT getEnrolledStudentEmails: that helper returns [] on any API error,
    // which would make an outage look like an empty class and mark the course
    // reconciled. Here a failure must be loud.
    getEnrolledStudents: function (courseId) { return listCourseStudentEmailsOrThrow_(courseId); },
    readRegistry: function () { return readCourseDriveRegistry_(); },
    writeRecord: function (record) { return upsertCourseDriveRecord_(record); },
    now: function () { return new Date().getTime(); },
    sleep: function (ms) { Utilities.sleep(ms); },
    uuid: function () { return Utilities.getUuid(); },
    log: function (action, target, status, detail) { logSystemAction_(action, target, status, detail); },
    isDelegationConfigured: function () { return isDriveDelegationConfigured_(); },
    getProperty: function (key) { return PropertiesService.getScriptProperties().getProperty(key); },
    setProperty: function (key, value) { PropertiesService.getScriptProperties().setProperty(key, value); },
    deleteProperty: function (key) { PropertiesService.getScriptProperties().deleteProperty(key); }
  };
  if (!overrides) return base;
  Object.keys(overrides).forEach(function (key) { base[key] = overrides[key]; });
  return base;
}

/**
 * Roster read that propagates API failures. Same pagination as
 * getEnrolledStudentEmails, without the blanket catch.
 */
function listCourseStudentEmailsOrThrow_(courseId) {
  const emails = [];
  let pageToken = null;
  do {
    const response = Classroom.Courses.Students.list(courseId, { pageSize: 200, pageToken: pageToken });
    (response.students || []).forEach(function (student) {
      const email = student.profile && student.profile.emailAddress;
      if (email) emails.push(email.toLowerCase());
    });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return emails;
}

/* ==================== registry ==================== */

function ensureCourseDriveSheet_() {
  const ss = getDBSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_COURSE_DRIVES);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_COURSE_DRIVES);
    sheet.appendRow(COURSE_DRIVE_CONFIG.REGISTRY_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function courseDriveRecordToRow_(record) {
  return [
    String(record.courseId || ""),
    record.courseName || "",
    record.section || "",
    record.mode || "",
    record.driveId || "",
    record.folderId || "",
    record.folderUrl || "",
    record.courseGroupEmail || "",
    record.teacherGroupEmail || "",
    record.state || "",
    record.provisionedAt || "",
    record.lastReconciledAt || "",
    truncateLogDetail_(record.note || "", 400)
  ];
}

function courseDriveRowToRecord_(row) {
  return {
    courseId: String(row[0] || ""),
    courseName: row[1] || "",
    section: row[2] || "",
    mode: row[3] || "",
    driveId: row[4] || "",
    folderId: row[5] || "",
    folderUrl: row[6] || "",
    courseGroupEmail: row[7] || "",
    teacherGroupEmail: row[8] || "",
    state: row[9] || "",
    provisionedAt: row[10] || "",
    lastReconciledAt: row[11] || "",
    note: row[12] || ""
  };
}

function readCourseDriveRegistry_() {
  const sheet = ensureCourseDriveSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  const values = sheet.getRange(2, 1, lastRow - 1, COURSE_DRIVE_CONFIG.REGISTRY_HEADERS.length).getValues();
  const map = {};
  values.forEach(function (row, index) {
    const record = courseDriveRowToRecord_(row);
    if (!record.courseId) return;
    record.rowNumber = index + 2;
    map[record.courseId] = record;
  });
  return map;
}

/**
 * Insert-or-update by courseId. This is what makes provisioning re-runnable:
 * a run that timed out halfway leaves correct rows behind, and the next run
 * skips everything already recorded rather than creating duplicate drives.
 */
function upsertCourseDriveRecord_(record) {
  const sheet = ensureCourseDriveSheet_();
  const row = courseDriveRecordToRow_(record);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || "") === String(record.courseId)) {
        sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
        return i + 2;
      }
    }
  }
  sheet.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);
  return lastRow + 1;
}

/* ==================== settings ==================== */

function getCourseDriveSettings(deps) {
  const d = getCourseDriveDeps_(deps);
  const mode = d.getProperty(COURSE_DRIVE_CONFIG.PROP_DEFAULT_MODE) || COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE;
  const delegationConfigured = d.isDelegationConfigured();
  const rootFolderId = d.getProperty(COURSE_DRIVE_CONFIG.PROP_ROOT_FOLDER_ID) || "";
  return {
    defaultMode: mode,
    rootFolderId: rootFolderId,
    autoProvision: String(d.getProperty(COURSE_DRIVE_CONFIG.PROP_AUTO_PROVISION) || "") === "true",
    delegationConfigured: delegationConfigured,
    shortcutModeReady: delegationConfigured && !!rootFolderId
  };
}

function setCourseDriveSettings(payload, deps) {
  const d = getCourseDriveDeps_(deps);
  const settings = payload || {};
  const mode = normalizeCourseDriveMode_(settings.defaultMode);
  d.setProperty(COURSE_DRIVE_CONFIG.PROP_DEFAULT_MODE, mode);
  d.setProperty(COURSE_DRIVE_CONFIG.PROP_ROOT_FOLDER_ID, String(settings.rootFolderId || "").trim());
  d.setProperty(COURSE_DRIVE_CONFIG.PROP_AUTO_PROVISION, settings.autoProvision ? "true" : "false");
  d.log("COURSE_DRIVE_SETTINGS", mode, "SUCCESS",
    `autoProvision=${settings.autoProvision ? "true" : "false"}, rootFolderId=${settings.rootFolderId || "-"}`);
  return getCourseDriveSettings(deps);
}

function normalizeCourseDriveMode_(mode) {
  const value = String(mode || "").trim().toUpperCase();
  if (value === COURSE_DRIVE_CONFIG.MODE_SHORTCUT) return COURSE_DRIVE_CONFIG.MODE_SHORTCUT;
  return COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE;
}

/* ==================== naming + identity helpers ==================== */

function buildCourseDriveName_(name, section) {
  const base = [String(name || "").trim(), String(section || "").trim()]
    .filter(function (part) { return part.length > 0; })
    .join(" - ");
  const safe = base.replace(/\s+/g, " ").trim() || "Course Materials";
  return safe.length > COURSE_DRIVE_CONFIG.NAME_MAX_LENGTH
    ? safe.substring(0, COURSE_DRIVE_CONFIG.NAME_MAX_LENGTH)
    : safe;
}

/**
 * Drives.create takes a requestId used for de-duplication. Deriving it from the
 * courseId (rather than a fresh UUID) means a retry after a timeout that
 * actually succeeded server-side returns the SAME drive instead of a duplicate.
 */
function buildCourseDriveRequestId_(courseId) {
  return `coursedrive-${String(courseId || "").replace(/[^A-Za-z0-9_-]/g, "")}`;
}

/* ==================== course resolution ==================== */

/**
 * Reads the course and its Classroom-maintained permission groups.
 * `courseGroupEmail` is populated asynchronously after course creation, so a
 * course provisioned microseconds after createClassroomCourse may not have one
 * yet — that is reported as a blocking reason rather than silently skipped.
 */
function resolveCourseForProvisioning_(courseId, deps) {
  const d = getCourseDriveDeps_(deps);
  if (!d.classroomCourses) throw new Error("Classroom advanced service is unavailable.");
  const course = d.classroomCourses.get(String(courseId));
  return {
    courseId: String(course.id),
    courseName: course.name || "",
    section: course.section || "",
    courseState: course.courseState || "",
    courseGroupEmail: course.courseGroupEmail || "",
    teacherGroupEmail: course.teacherGroupEmail || "",
    teacherFolderId: (course.teacherFolder && course.teacherFolder.id) || ""
  };
}

function classifyCourseForProvisioning_(course, existing, mode, settings) {
  if (existing && existing.state === COURSE_DRIVE_CONFIG.STATE_ACTIVE) {
    return { action: "SKIP", reason: `Already provisioned (${existing.mode}).` };
  }
  if (!course.courseGroupEmail) {
    return {
      action: "BLOCKED",
      reason: "Course has no courseGroupEmail yet. Classroom populates it asynchronously — retry in a few minutes."
    };
  }
  if (mode === COURSE_DRIVE_CONFIG.MODE_SHORTCUT) {
    if (!settings.delegationConfigured) {
      return {
        action: "BLOCKED",
        reason: "SHORTCUT mode needs the domain-wide-delegation service account (run setDriveDelegationCredentials first)."
      };
    }
    if (!settings.rootFolderId) {
      return {
        action: "BLOCKED",
        reason: "SHORTCUT mode needs a root folder ID in Course Drive settings."
      };
    }
  }
  return { action: "PROVISION", reason: "" };
}

/* ==================== preview (mandatory before apply) ==================== */

/**
 * Mirrors the mandatory-preview contract already used by previewBatchUserUpdate:
 * the UI keeps Apply disabled until this runs, and apply recomputes anyway so a
 * stale preview cannot provision the wrong thing.
 */
function previewCourseDriveProvisioning(courseIds, mode, deps) {
  const ids = (courseIds || []).map(String).filter(function (id) { return id; });
  if (ids.length === 0) throw new Error("No courses selected.");
  if (ids.length > COURSE_DRIVE_CONFIG.MAX_COURSES_PER_RUN) {
    throw new Error(`Maximum ${COURSE_DRIVE_CONFIG.MAX_COURSES_PER_RUN} courses per run. Split the selection.`);
  }

  const d = getCourseDriveDeps_(deps);
  const settings = getCourseDriveSettings(deps);
  const resolvedMode = normalizeCourseDriveMode_(mode || settings.defaultMode);
  const registry = d.readRegistry();

  const rows = [];
  const summary = { toProvision: 0, skipped: 0, blocked: 0, failed: 0 };

  ids.forEach(function (courseId) {
    let course;
    try {
      course = resolveCourseForProvisioning_(courseId, deps);
    } catch (e) {
      summary.failed++;
      rows.push({
        courseId: courseId, courseName: "", section: "",
        action: "ERROR", reason: getExceptionMessage_(e)
      });
      return;
    }
    const existing = registry[course.courseId];
    const verdict = classifyCourseForProvisioning_(course, existing, resolvedMode, settings);
    if (verdict.action === "PROVISION") summary.toProvision++;
    else if (verdict.action === "SKIP") summary.skipped++;
    else summary.blocked++;

    rows.push({
      courseId: course.courseId,
      courseName: course.courseName,
      section: course.section,
      courseGroupEmail: course.courseGroupEmail,
      teacherGroupEmail: course.teacherGroupEmail,
      targetName: buildCourseDriveName_(course.courseName, course.section),
      action: verdict.action,
      reason: verdict.reason,
      existingUrl: existing ? existing.folderUrl : ""
    });
  });

  return { mode: resolvedMode, summary: summary, rows: rows };
}

/* ==================== Drive API compatibility wrappers ==================== */

function createSharedDrive_(name, requestId, deps) {
  const d = getCourseDriveDeps_(deps);
  if (!d.drivesApi) throw new Error("Drive.Drives advanced service is unavailable.");
  return d.drivesApi.create({ name: name }, requestId);
}

function createDriveFolder_(name, parentId, deps) {
  const d = getCourseDriveDeps_(deps);
  if (!d.filesApi) throw new Error("Drive.Files advanced service is unavailable.");
  const resource = {
    name: name,
    mimeType: COURSE_DRIVE_CONFIG.FOLDER_MIME,
    parents: parentId ? [parentId] : undefined
  };
  // Apps Script has shipped both Files.create(resource) and the fuller
  // Files.create(resource, media, optionalArgs); probe rather than assume,
  // exactly as removeDriveFileWithCompatibility_ does for deletes.
  const optionalArgs = { supportsAllDrives: true, fields: "id,name,webViewLink" };
  try {
    return d.filesApi.create(resource, null, optionalArgs);
  } catch (e) {
    if (!isMethodSignatureError_(e)) throw e;
    // Legacy two-arg signature. Keep optionalArgs — dropping supportsAllDrives
    // here would break creating the folder under a shared-drive root.
    return d.filesApi.create(resource, optionalArgs);
  }
}

/**
 * Attempt ladder for a shared-drive grant.
 *
 * Ordinary member access comes FIRST and domain-admin access is only a fallback.
 * That order matters: when we just created the drive we are already its
 * organizer, and `useDomainAdminAccess: true` resolves the file through the
 * domain-admin index instead — which for a seconds-old drive routinely answers
 * "File not found". Leading with domain-admin access made every fresh
 * SHARED_DRIVE provision fail. The fallback is still needed for adoption, where
 * the admin may not be a member of the drive at all.
 */
function buildGrantAttempts_(isSharedDrive) {
  const base = { supportsAllDrives: true, sendNotificationEmail: false };
  if (!isSharedDrive) return [base];
  const asDomainAdmin = {
    supportsAllDrives: true,
    sendNotificationEmail: false,
    useDomainAdminAccess: true
  };
  return [base, base, asDomainAdmin];
}

/**
 * The one-time grant that replaces every future "share with the new student"
 * click. sendNotificationEmail is false on purpose: these are permission-only
 * groups that do not accept mail, and a notification storm across a whole
 * semester of courses is not something to inflict on a school.
 */
function grantCourseGroupAccess_(targetId, groupEmail, role, isSharedDrive, deps) {
  const d = getCourseDriveDeps_(deps);
  if (!d.permissionsApi) throw new Error("Drive.Permissions advanced service is unavailable.");
  const resource = { type: "group", role: role, emailAddress: groupEmail };
  const attempts = buildGrantAttempts_(isSharedDrive);
  let lastError = null;

  for (let i = 0; i < attempts.length && i < COURSE_DRIVE_CONFIG.GRANT_MAX_ATTEMPTS; i++) {
    try {
      return d.permissionsApi.create(resource, targetId, attempts[i]);
    } catch (e) {
      lastError = e;
      // Only "not found" is worth retrying. A bad role or an unresolvable group
      // will fail identically every time; retrying those just burns the budget.
      if (!isDriveNotFoundError_(e) || i === attempts.length - 1) throw e;
      d.sleep(DRIVE_ESCALATION_CONFIG.SHARED_DRIVE_GRANT_PROPAGATION_MS * (i + 1));
    }
  }
  throw lastError || new Error(`Could not grant ${groupEmail} on ${targetId}.`);
}

/* ==================== provisioning ==================== */

function provisionCourseDrives(courseIds, mode, deps) {
  const ids = (courseIds || []).map(String).filter(function (id) { return id; });
  if (ids.length === 0) throw new Error("No courses selected.");
  if (ids.length > COURSE_DRIVE_CONFIG.MAX_COURSES_PER_RUN) {
    throw new Error(`Maximum ${COURSE_DRIVE_CONFIG.MAX_COURSES_PER_RUN} courses per run. Split the selection.`);
  }

  const d = getCourseDriveDeps_(deps);
  const settings = getCourseDriveSettings(deps);
  const resolvedMode = normalizeCourseDriveMode_(mode || settings.defaultMode);
  const registry = d.readRegistry();
  const startedAt = d.now();

  const provisioned = [];
  const skipped = [];
  const errors = [];

  for (let i = 0; i < ids.length; i++) {
    if (d.now() - startedAt > COURSE_DRIVE_CONFIG.BUDGET_MS) {
      ids.slice(i).forEach(function (remaining) {
        skipped.push({ courseId: remaining, reason: "Time budget reached — re-run to continue." });
      });
      break;
    }

    const courseId = ids[i];
    const progress = { record: null };
    try {
      const course = resolveCourseForProvisioning_(courseId, deps);
      const verdict = classifyCourseForProvisioning_(course, registry[course.courseId], resolvedMode, settings);
      if (verdict.action !== "PROVISION") {
        skipped.push({ courseId: courseId, courseName: course.courseName, reason: verdict.reason });
        // A course blocked purely because Classroom has not published its group
        // yet is not a failure — park it so maintenance can finish the job.
        if (verdict.action === "BLOCKED" && !course.courseGroupEmail) {
          d.writeRecord({
            courseId: course.courseId, courseName: course.courseName, section: course.section,
            mode: resolvedMode, state: COURSE_DRIVE_CONFIG.STATE_PENDING,
            note: verdict.reason, provisionedAt: ""
          });
        }
        continue;
      }
      const record = provisionSingleCourseDrive_(
        course, resolvedMode, settings, deps, registry[course.courseId], progress);
      d.writeRecord(record);
      registry[record.courseId] = record;
      provisioned.push(record);
    } catch (e) {
      const message = getExceptionMessage_(e);
      errors.push({ courseId: courseId, message: message });
      try {
        // Merge onto whatever is already recorded. upsert replaces the whole
        // row, so writing a bare failure record here would drop a container id
        // captured moments ago and make the next retry create a duplicate.
        const previous = progress.record || registry[courseId] || {};
        d.writeRecord({
          courseId: courseId,
          courseName: previous.courseName || "",
          section: previous.section || "",
          mode: resolvedMode,
          driveId: previous.driveId || "",
          folderId: previous.folderId || "",
          folderUrl: previous.folderUrl || "",
          courseGroupEmail: previous.courseGroupEmail || "",
          teacherGroupEmail: previous.teacherGroupEmail || "",
          state: COURSE_DRIVE_CONFIG.STATE_FAILED,
          note: message,
          provisionedAt: previous.provisionedAt || ""
        });
      } catch (writeError) {
        // Registry write failure must not mask the original provisioning error.
      }
    }
  }

  d.log("COURSE_DRIVE_PROVISION", `${ids.length} course(s)`,
    errors.length > 0 ? "PARTIAL" : "SUCCESS",
    `mode=${resolvedMode}, provisioned=${provisioned.length}, skipped=${skipped.length}, errors=${errors.length}`);

  const result = {
    mode: resolvedMode,
    provisioned: provisioned,
    skipped: skipped,
    errors: errors,
    message: `Provisioned ${provisioned.length}, skipped ${skipped.length}, failed ${errors.length}.`
  };

  // SHORTCUT mode is only half-done at this point: access is granted but the
  // student-side shortcuts still have to be written. Do it inline for the
  // courses just provisioned so a small run finishes in one click.
  if (resolvedMode === COURSE_DRIVE_CONFIG.MODE_SHORTCUT && provisioned.length > 0) {
    result.shortcutSync = reconcileCourseShortcuts({
      courseIds: provisioned.map(function (r) { return r.courseId; }),
      budgetMs: Math.max(30000, COURSE_DRIVE_CONFIG.BUDGET_MS - (d.now() - startedAt))
    }, deps);
  }

  return result;
}

/**
 * `existing` is the registry row from a previous FAILED/PENDING attempt. Reusing
 * its container id is what stops an hourly retry from creating a fresh orphan
 * folder every time a grant keeps failing — the container is created once, the
 * grants are retried against it.
 */
function provisionSingleCourseDrive_(course, mode, settings, deps, existing, progress) {
  const d = getCourseDriveDeps_(deps);
  const targetName = buildCourseDriveName_(course.courseName, course.section);
  const reusable = (existing && existing.mode === mode) ? existing : null;
  const record = {
    courseId: course.courseId,
    courseName: course.courseName,
    section: course.section,
    mode: mode,
    courseGroupEmail: course.courseGroupEmail,
    teacherGroupEmail: course.teacherGroupEmail,
    state: COURSE_DRIVE_CONFIG.STATE_ACTIVE,
    provisionedAt: new Date(),
    lastReconciledAt: "",
    note: ""
  };

  const isSharedDrive = mode === COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE;

  if (isSharedDrive) {
    if (reusable && reusable.driveId) {
      record.driveId = reusable.driveId;
      record.folderId = reusable.driveId;
      record.folderUrl = reusable.folderUrl || `https://drive.google.com/drive/folders/${reusable.driveId}`;
    } else {
      const drive = createSharedDrive_(targetName, buildCourseDriveRequestId_(course.courseId), deps);
      record.driveId = drive.id;
      record.folderId = drive.id; // a shared drive's root folder id IS the drive id
      record.folderUrl = `https://drive.google.com/drive/folders/${drive.id}`;
    }
  } else if (reusable && reusable.folderId) {
    record.driveId = "";
    record.folderId = reusable.folderId;
    record.folderUrl = reusable.folderUrl || `https://drive.google.com/drive/folders/${reusable.folderId}`;
  } else {
    const folder = createDriveFolder_(targetName, settings.rootFolderId, deps);
    record.driveId = "";
    record.folderId = folder.id;
    record.folderUrl = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;
  }

  // Persist the container id BEFORE granting. A grant failure past this point
  // leaves a FAILED row that still knows what was created, so the retry reuses
  // it instead of leaking another empty drive or folder.
  record.state = COURSE_DRIVE_CONFIG.STATE_PENDING;
  record.note = "Container created; applying group grants.";
  d.writeRecord(record);
  // The caller holds a snapshot of the registry taken before this run, so it
  // cannot see the write above. Hand the partial record back explicitly, or a
  // grant failure would be recorded without the container id and the next
  // retry would create a duplicate.
  if (progress) progress.record = JSON.parse(JSON.stringify(record));

  const teacherRole = isSharedDrive ? COURSE_DRIVE_CONFIG.TEACHER_ROLE : "writer";
  if (course.teacherGroupEmail) {
    grantCourseGroupAccess_(record.folderId, course.teacherGroupEmail, teacherRole, isSharedDrive, deps);
  }
  grantCourseGroupAccess_(record.folderId, course.courseGroupEmail, COURSE_DRIVE_CONFIG.STUDENT_ROLE, isSharedDrive, deps);

  record.state = COURSE_DRIVE_CONFIG.STATE_ACTIVE;
  record.note = "";
  return record;
}

/* ==================== adopting an existing folder ==================== */

/**
 * Accepts a raw Drive folder id or any of the URL shapes an admin is likely to
 * paste out of the browser.
 */
// A real Drive file ID is ~28-44 chars. Drive's own UI sometimes puts a much
// longer navigation token in the address bar (opening a folder from "Shared
// with me", a shortcut, or a search result), and that token is NOT a file ID —
// Files.get on it returns a bare 404 that tells the admin nothing.
const DRIVE_ID_PLAUSIBLE_MAX = 60;

function looksLikeDriveNavigationToken_(id) {
  return String(id || "").length > DRIVE_ID_PLAUSIBLE_MAX;
}

function parseDriveFolderId_(input) {
  const text = String(input || "").trim();
  if (!text) return "";
  const patterns = [
    /\/folders\/([A-Za-z0-9_-]{10,})/,
    /\/drive\/u\/\d+\/folders\/([A-Za-z0-9_-]{10,})/,
    /[?&]id=([A-Za-z0-9_-]{10,})/
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = patterns[i].exec(text);
    if (match) return match[1];
  }
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : "";
}

function getDriveFolderMetadata_(folderId, deps) {
  const d = getCourseDriveDeps_(deps);
  if (!d.filesApi) throw new Error("Drive.Files advanced service is unavailable.");
  const optionalArgs = {
    supportsAllDrives: true,
    fields: "id,name,mimeType,driveId,webViewLink,trashed"
  };
  try {
    return d.filesApi.get(folderId, optionalArgs);
  } catch (e) {
    if (!isMethodSignatureError_(e)) throw e;
    return d.filesApi.get(folderId);
  }
}

/**
 * Decides which mode an existing folder implies. This is deliberately derived
 * from where the folder lives rather than chosen by the admin, because the
 * answer is a fact about Drive, not a preference:
 *
 *   - the ROOT of a shared drive  -> members see it under "Shared drives"      -> SHARED_DRIVE
 *   - a folder in My Drive        -> lands in "Shared with me", never mounted  -> SHORTCUT
 *   - a folder INSIDE a shared drive -> access without drive membership, so the
 *     drive does not appear in their nav either                                -> SHORTCUT
 */
function classifyAdoptionTarget_(folderMeta) {
  if (!folderMeta || !folderMeta.id) {
    return { ok: false, reason: "Folder not found, or the admin cannot see it." };
  }
  if (folderMeta.trashed) {
    return { ok: false, reason: "That folder is in the trash." };
  }
  if (folderMeta.mimeType && folderMeta.mimeType !== COURSE_DRIVE_CONFIG.FOLDER_MIME) {
    return { ok: false, reason: "That Drive item is a file, not a folder." };
  }
  const isSharedDriveRoot = !!folderMeta.driveId && folderMeta.driveId === folderMeta.id;
  return {
    ok: true,
    mode: isSharedDriveRoot ? COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE : COURSE_DRIVE_CONFIG.MODE_SHORTCUT,
    isSharedDriveRoot: isSharedDriveRoot,
    driveId: isSharedDriveRoot ? folderMeta.driveId : "",
    reason: isSharedDriveRoot
      ? "Shared drive root — members see it in Drive for desktop with no shortcut."
      : "Folder is not a shared drive root, so enrolled students need a shortcut to see it in Drive for desktop."
  };
}

function normalizeAdoptionEntries_(entries) {
  const normalized = [];
  (entries || []).forEach(function (entry) {
    if (!entry) return;
    const courseId = String(entry.courseId || "").trim();
    const folderId = parseDriveFolderId_(entry.folderId || entry.folderUrl);
    if (!courseId) return;
    normalized.push({ courseId: courseId, folderId: folderId, rawFolder: String(entry.folderId || entry.folderUrl || "") });
  });
  return normalized;
}

/**
 * Preview for adoption. Nothing is created and nothing is moved: adoption only
 * records an existing folder as the course's container and adds the two group
 * grants. Materials stay exactly where the teacher put them, and ownership does
 * not change.
 */
function previewCourseDriveAdoption(entries, deps) {
  const normalized = normalizeAdoptionEntries_(entries);
  if (normalized.length === 0) throw new Error("No courses selected.");
  if (normalized.length > COURSE_DRIVE_CONFIG.MAX_COURSES_PER_RUN) {
    throw new Error(`Maximum ${COURSE_DRIVE_CONFIG.MAX_COURSES_PER_RUN} courses per run. Split the selection.`);
  }

  const d = getCourseDriveDeps_(deps);
  const settings = getCourseDriveSettings(deps);
  const registry = d.readRegistry();
  const rows = [];
  const summary = { toAdopt: 0, skipped: 0, blocked: 0, failed: 0 };

  normalized.forEach(function (entry) {
    const row = { courseId: entry.courseId, folderId: entry.folderId, action: "", reason: "" };
    if (!entry.folderId) {
      row.action = "BLOCKED";
      row.reason = `Could not read a folder ID from "${entry.rawFolder}".`;
      summary.blocked++;
      rows.push(row);
      return;
    }
    if (looksLikeDriveNavigationToken_(entry.folderId)) {
      row.action = "BLOCKED";
      row.reason = "That link is a Drive browsing link, not a folder link — its ID is a " +
        "navigation token. Open the folder, use Share > Copy link, and paste that instead.";
      summary.blocked++;
      rows.push(row);
      return;
    }

    let course;
    try {
      course = resolveCourseForProvisioning_(entry.courseId, deps);
    } catch (e) {
      row.action = "ERROR";
      row.reason = getExceptionMessage_(e);
      summary.failed++;
      rows.push(row);
      return;
    }
    row.courseName = course.courseName;
    row.section = course.section;
    row.courseGroupEmail = course.courseGroupEmail;

    const existing = registry[course.courseId];
    if (existing && existing.state === COURSE_DRIVE_CONFIG.STATE_ACTIVE) {
      row.action = "SKIP";
      row.reason = `Already has a materials container (${existing.mode}). Clear its registry row first if you want to re-point it.`;
      summary.skipped++;
      rows.push(row);
      return;
    }
    if (!course.courseGroupEmail) {
      row.action = "BLOCKED";
      row.reason = "Course has no courseGroupEmail yet. Classroom populates it asynchronously — retry in a few minutes.";
      summary.blocked++;
      rows.push(row);
      return;
    }

    let meta;
    try {
      meta = getDriveFolderMetadata_(entry.folderId, deps);
    } catch (e) {
      const detail = getExceptionMessage_(e);
      row.action = "ERROR";
      row.reason = `Could not read folder ${entry.folderId}: ${detail}` +
        (isDriveNotFoundError_(e)
          ? " — if you copied this from the Drive address bar, use Share > Copy link instead."
          : "");
      summary.failed++;
      rows.push(row);
      return;
    }

    const verdict = classifyAdoptionTarget_(meta);
    row.folderName = meta.name || "";
    row.mode = verdict.mode || "";
    if (!verdict.ok) {
      row.action = "BLOCKED";
      row.reason = verdict.reason;
      summary.blocked++;
      rows.push(row);
      return;
    }
    row.action = "ADOPT";
    row.reason = verdict.reason;
    // Without delegation we cannot place shortcuts, but the valuable half — the
    // one-time grant that makes the roster self-syncing — works regardless.
    // Refusing the whole adoption over the optional half was wrong: it left the
    // admin with a dead button and no way to link an existing folder at all.
    if (verdict.mode === COURSE_DRIVE_CONFIG.MODE_SHORTCUT && !settings.delegationConfigured) {
      row.warning = "Access will be granted, but shortcuts cannot be placed for students " +
        "(no delegation service account). Students reach the folder via Shared with me, or " +
        "keep the shortcut they already made.";
    }
    summary.toAdopt++;
    rows.push(row);
  });

  return { summary: summary, rows: rows };
}

/**
 * Registers existing folders as course containers and applies the group grants.
 * Creates nothing, moves nothing, deletes nothing.
 */
function adoptCourseDriveFolders(entries, deps) {
  const normalized = normalizeAdoptionEntries_(entries);
  if (normalized.length === 0) throw new Error("No courses selected.");
  if (normalized.length > COURSE_DRIVE_CONFIG.MAX_COURSES_PER_RUN) {
    throw new Error(`Maximum ${COURSE_DRIVE_CONFIG.MAX_COURSES_PER_RUN} courses per run. Split the selection.`);
  }

  const d = getCourseDriveDeps_(deps);
  const settings = getCourseDriveSettings(deps);
  const registry = d.readRegistry();
  const startedAt = d.now();

  const adopted = [];
  const skipped = [];
  const errors = [];

  for (let i = 0; i < normalized.length; i++) {
    if (d.now() - startedAt > COURSE_DRIVE_CONFIG.BUDGET_MS) {
      normalized.slice(i).forEach(function (remaining) {
        skipped.push({ courseId: remaining.courseId, reason: "Time budget reached — re-run to continue." });
      });
      break;
    }

    const entry = normalized[i];
    try {
      if (!entry.folderId) {
        skipped.push({ courseId: entry.courseId, reason: "No usable folder ID." });
        continue;
      }
      if (looksLikeDriveNavigationToken_(entry.folderId)) {
        skipped.push({
          courseId: entry.courseId,
          reason: "That is a Drive browsing link, not a folder link. Use Share > Copy link."
        });
        continue;
      }
      const course = resolveCourseForProvisioning_(entry.courseId, deps);
      const existing = registry[course.courseId];
      if (existing && existing.state === COURSE_DRIVE_CONFIG.STATE_ACTIVE) {
        skipped.push({ courseId: course.courseId, courseName: course.courseName, reason: "Already has a container." });
        continue;
      }
      if (!course.courseGroupEmail) {
        skipped.push({ courseId: course.courseId, courseName: course.courseName, reason: "courseGroupEmail not published yet." });
        continue;
      }

      const meta = getDriveFolderMetadata_(entry.folderId, deps);
      const verdict = classifyAdoptionTarget_(meta);
      if (!verdict.ok) {
        skipped.push({ courseId: course.courseId, courseName: course.courseName, reason: verdict.reason });
        continue;
      }
      const record = {
        courseId: course.courseId,
        courseName: course.courseName,
        section: course.section,
        mode: verdict.mode,
        driveId: verdict.driveId,
        folderId: meta.id,
        folderUrl: meta.webViewLink || `https://drive.google.com/drive/folders/${meta.id}`,
        courseGroupEmail: course.courseGroupEmail,
        teacherGroupEmail: course.teacherGroupEmail,
        state: COURSE_DRIVE_CONFIG.STATE_ACTIVE,
        provisionedAt: new Date(),
        lastReconciledAt: "",
        note: `Adopted existing folder "${meta.name || meta.id}".`
      };
      if (verdict.mode === COURSE_DRIVE_CONFIG.MODE_SHORTCUT && !settings.delegationConfigured) {
        record.note += " Shortcut fan-out unavailable (no delegation service account).";
      }

      const teacherRole = verdict.isSharedDriveRoot ? COURSE_DRIVE_CONFIG.TEACHER_ROLE : "writer";
      if (course.teacherGroupEmail) {
        grantCourseGroupAccess_(meta.id, course.teacherGroupEmail, teacherRole, verdict.isSharedDriveRoot, deps);
      }
      grantCourseGroupAccess_(meta.id, course.courseGroupEmail,
        COURSE_DRIVE_CONFIG.STUDENT_ROLE, verdict.isSharedDriveRoot, deps);

      d.writeRecord(record);
      registry[record.courseId] = record;
      adopted.push(record);
    } catch (e) {
      errors.push({ courseId: entry.courseId, message: getExceptionMessage_(e) });
    }
  }

  d.log("COURSE_DRIVE_ADOPT", `${normalized.length} course(s)`,
    errors.length > 0 ? "PARTIAL" : "SUCCESS",
    `adopted=${adopted.length}, skipped=${skipped.length}, errors=${errors.length}`);

  const result = {
    mode: "ADOPT",
    provisioned: adopted,
    skipped: skipped,
    errors: errors,
    message: `Adopted ${adopted.length}, skipped ${skipped.length}, failed ${errors.length}.`
  };

  const shortcutCourses = settings.delegationConfigured
    ? adopted
        .filter(function (r) { return r.mode === COURSE_DRIVE_CONFIG.MODE_SHORTCUT; })
        .map(function (r) { return r.courseId; })
    : [];
  if (!settings.delegationConfigured &&
      adopted.some(function (r) { return r.mode === COURSE_DRIVE_CONFIG.MODE_SHORTCUT; })) {
    result.shortcutSync = {
      mode: COURSE_DRIVE_CONFIG.MODE_SHORTCUT,
      message: "Access granted. Shortcuts were not placed — no delegation service account is " +
        "configured, so students will find the folder under Shared with me.",
      created: 0, repaired: 0, skipped: 0, failed: 0
    };
  }
  if (shortcutCourses.length > 0) {
    result.shortcutSync = reconcileCourseShortcuts({
      courseIds: shortcutCourses,
      budgetMs: Math.max(30000, COURSE_DRIVE_CONFIG.BUDGET_MS - (d.now() - startedAt))
    }, deps);
  }

  return result;
}

/* ==================== SHORTCUT mode: per-student fan-out ==================== */

function buildShortcutResource_(courseId, targetId, targetName) {
  return {
    name: targetName,
    mimeType: COURSE_DRIVE_CONFIG.SHORTCUT_MIME,
    parents: ["root"],
    shortcutDetails: { targetId: targetId },
    appProperties: (function () {
      const props = {};
      props[COURSE_DRIVE_CONFIG.SHORTCUT_MARKER_KEY] = String(courseId);
      props[COURSE_DRIVE_CONFIG.SHORTCUT_TARGET_KEY] = String(targetId);
      return props;
    })()
  };
}

function buildShortcutLookupQuery_(courseId) {
  const escaped = String(courseId).replace(/'/g, "\\'");
  return `appProperties has { key='${COURSE_DRIVE_CONFIG.SHORTCUT_MARKER_KEY}' and value='${escaped}' } and trashed = false`;
}

function findShortcutAsUser_(studentEmail, courseId, targetId, deps) {
  const d = getCourseDriveDeps_(deps);
  const token = fetchImpersonatedAccessToken_(studentEmail, deps);
  const url = `${COURSE_DRIVE_CONFIG.DRIVE_FILES_ENDPOINT}` +
    `?q=${encodeURIComponent(buildShortcutLookupQuery_(courseId))}` +
    `&pageSize=5&fields=${encodeURIComponent("files(id,name,shortcutDetails/targetId)")}&supportsAllDrives=true`;
  const response = d.fetchFn(url, {
    method: "get",
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code !== 200) {
    throw new Error(`Shortcut lookup for ${studentEmail} failed (HTTP ${code}): ` +
      extractApiErrorMessage_(safeJsonParse_(body), body));
  }
  const parsed = safeJsonParse_(body) || {};
  const marked = (parsed.files || [])[0];
  if (marked) return marked;

  // Nothing carrying our marker. Before deciding the student needs a shortcut,
  // check whether they already made one by hand — a very common case when a
  // teacher set the folder up manually before this tool existed. Creating a
  // second shortcut to the same folder would just clutter their Drive.
  return findUnmarkedShortcutToTarget_(studentEmail, token, targetId, deps);
}

/**
 * shortcutDetails.targetId is not queryable in a Drive `q` filter, so this lists
 * the shortcuts in the student's My Drive root and matches client-side. One page
 * is enough: a shortcut this tool cares about lives in root, and a root holding
 * more than ROOT_SHORTCUT_SCAN_PAGE_SIZE shortcuts is pathological.
 */
function findUnmarkedShortcutToTarget_(studentEmail, token, targetId, deps) {
  if (!targetId) return null;
  const d = getCourseDriveDeps_(deps);
  const query = `'root' in parents and mimeType = '${COURSE_DRIVE_CONFIG.SHORTCUT_MIME}' and trashed = false`;
  const url = `${COURSE_DRIVE_CONFIG.DRIVE_FILES_ENDPOINT}` +
    `?q=${encodeURIComponent(query)}` +
    `&pageSize=${COURSE_DRIVE_CONFIG.ROOT_SHORTCUT_SCAN_PAGE_SIZE}` +
    `&fields=${encodeURIComponent("files(id,name,shortcutDetails/targetId)")}&supportsAllDrives=true`;
  const response = d.fetchFn(url, {
    method: "get",
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) return null;
  const parsed = safeJsonParse_(response.getContentText()) || {};
  const match = (parsed.files || []).filter(function (file) {
    return file.shortcutDetails && file.shortcutDetails.targetId === String(targetId);
  })[0];
  if (!match) return null;
  // Flagged so the caller knows this one is the student's own: it is correct,
  // so it is left exactly as it is — never renamed, never replaced.
  match.unmarked = true;
  return match;
}

/**
 * shortcutDetails.targetId is write-once — the Drive API will not let us patch a
 * shortcut to point somewhere else — so repairing means trashing the stale one
 * and creating a fresh shortcut. Without this the reconciler would add a second
 * shortcut on every pass instead of fixing the first.
 */
function trashShortcutAsUser_(studentEmail, shortcutId, deps) {
  const d = getCourseDriveDeps_(deps);
  const token = fetchImpersonatedAccessToken_(studentEmail, deps);
  const response = d.fetchFn(
    `${COURSE_DRIVE_CONFIG.DRIVE_FILES_ENDPOINT}/${encodeURIComponent(shortcutId)}?supportsAllDrives=true`,
    {
      method: "patch",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${token}` },
      payload: JSON.stringify({ trashed: true }),
      muteHttpExceptions: true
    }
  );
  const code = response.getResponseCode();
  if (code === 200 || code === 204 || code === 404) return { ok: true, message: "" };
  const body = response.getContentText();
  return { ok: false, message: `HTTP ${code}: ${extractApiErrorMessage_(safeJsonParse_(body), body)}` };
}

function createShortcutAsUser_(studentEmail, courseId, targetId, targetName, deps) {
  const d = getCourseDriveDeps_(deps);
  const token = fetchImpersonatedAccessToken_(studentEmail, deps);
  const response = d.fetchFn(
    `${COURSE_DRIVE_CONFIG.DRIVE_FILES_ENDPOINT}?supportsAllDrives=true&fields=id,name`,
    {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${token}` },
      payload: JSON.stringify(buildShortcutResource_(courseId, targetId, targetName)),
      muteHttpExceptions: true
    }
  );
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code === 200 || code === 201) {
    return { ok: true, id: (safeJsonParse_(body) || {}).id || "", message: "" };
  }
  const detail = extractApiErrorMessage_(safeJsonParse_(body), body);
  if (code === 403 || code === 404) {
    // Access has not propagated from the course group yet, or the student's
    // Drive is not provisioned. Both are transient — report, do not throw, so
    // one student cannot fail an entire course.
    return { ok: false, id: "", message: `HTTP ${code}: ${detail}`, retryable: true };
  }
  return { ok: false, id: "", message: `HTTP ${code}: ${detail}`, retryable: false };
}

/**
 * Decides what to do for one student without performing any I/O, so the
 * behaviour is unit-testable: create when missing, repair when the shortcut
 * points at a stale target, skip when correct.
 */
function decideShortcutAction_(existing, targetId) {
  if (!existing) return { action: "CREATE", reason: "No shortcut found." };
  const currentTarget = (existing.shortcutDetails && existing.shortcutDetails.targetId) || "";
  if (currentTarget !== String(targetId)) {
    return { action: "REPAIR", reason: `Shortcut points at ${currentTarget || "nothing"}.` };
  }
  return { action: "SKIP", reason: "Shortcut already present." };
}

/**
 * Resumable reconciler. Safe to run from a time-driven trigger and safe to run
 * twice: every student is checked before anything is written. Deliberately does
 * NOT delete shortcuts for unenrolled students — a shortcut breaks on its own
 * when access is lost, and deleting files out of student accounts is not
 * something an admin tool should do silently.
 */
function reconcileCourseShortcuts(options, deps) {
  const opts = options || {};
  const d = getCourseDriveDeps_(deps);
  const startedAt = d.now();
  const budgetMs = opts.budgetMs || COURSE_DRIVE_CONFIG.BUDGET_MS;

  if (!d.isDelegationConfigured()) {
    return {
      message: "SHORTCUT reconciliation skipped: no delegation service account configured.",
      created: 0, repaired: 0, skipped: 0, failed: 0, courses: [], complete: true
    };
  }

  const registry = d.readRegistry();
  let courseIds = (opts.courseIds || []).map(String).filter(function (id) { return id; });
  if (courseIds.length === 0) {
    const eligible = Object.keys(registry).filter(function (courseId) {
      const record = registry[courseId];
      return record.mode === COURSE_DRIVE_CONFIG.MODE_SHORTCUT &&
        record.state === COURSE_DRIVE_CONFIG.STATE_ACTIVE;
    });
    // Resume where the last budget-limited run stopped. Registry key order is
    // stable, so without this the same prefix would be reprocessed every hour
    // and courses past the cutoff would never be reconciled at all.
    courseIds = orderCourseIdsFromCursor_(eligible, readReconcileCursor_(d));
  }

  const totals = { created: 0, repaired: 0, skipped: 0, failed: 0 };
  const courseReports = [];
  let complete = true;

  for (let i = 0; i < courseIds.length; i++) {
    if (d.now() - startedAt > budgetMs) {
      complete = false;
      d.setProperty(COURSE_DRIVE_CONFIG.PROP_RECONCILE_CURSOR,
        JSON.stringify({ pending: courseIds.slice(i), savedAt: new Date().toISOString() }));
      break;
    }

    const courseId = courseIds[i];
    const record = registry[courseId];
    if (!record || record.mode !== COURSE_DRIVE_CONFIG.MODE_SHORTCUT ||
        record.state !== COURSE_DRIVE_CONFIG.STATE_ACTIVE || !record.folderId) {
      courseReports.push({ courseId: courseId, skipped: 0, note: "Not an active SHORTCUT-mode course." });
      continue;
    }

    const report = reconcileSingleCourseShortcuts_(record, deps);
    totals.created += report.created;
    totals.repaired += report.repaired;
    totals.skipped += report.skipped;
    totals.failed += report.failed;
    courseReports.push(report);

    // A course whose roster could not be read has NOT been reconciled. Stamping
    // it would make an unreadable course indistinguishable from a synced one.
    if (!report.rosterError) {
      record.lastReconciledAt = new Date();
      d.writeRecord(record);
    }
  }

  if (complete && !(opts.courseIds || []).length) {
    // Only a full sweep may clear the cursor. A targeted run (one course after
    // an enrolment change) must not discard another run's saved position.
    d.deleteProperty(COURSE_DRIVE_CONFIG.PROP_RECONCILE_CURSOR);
  }

  d.log("COURSE_DRIVE_RECONCILE", `${courseIds.length} course(s)`,
    totals.failed > 0 ? "PARTIAL" : "SUCCESS",
    `created=${totals.created}, repaired=${totals.repaired}, skipped=${totals.skipped}, failed=${totals.failed}`);

  return {
    message: `Shortcuts created ${totals.created}, repaired ${totals.repaired}, already present ${totals.skipped}, failed ${totals.failed}.` +
      (complete ? "" : " Time budget reached — remaining courses saved for the next run."),
    created: totals.created,
    repaired: totals.repaired,
    skipped: totals.skipped,
    failed: totals.failed,
    courses: courseReports,
    complete: complete
  };
}

function readReconcileCursor_(d) {
  const raw = d.getProperty(COURSE_DRIVE_CONFIG.PROP_RECONCILE_CURSOR);
  const parsed = safeJsonParse_(raw);
  return (parsed && parsed.pending) ? parsed.pending.map(String) : [];
}

/** Pending courses first, in their saved order, then everything else. */
function orderCourseIdsFromCursor_(eligible, pending) {
  if (!pending || pending.length === 0) return eligible;
  const eligibleSet = {};
  eligible.forEach(function (id) { eligibleSet[id] = true; });
  const ordered = pending.filter(function (id) { return eligibleSet[id]; });
  const seen = {};
  ordered.forEach(function (id) { seen[id] = true; });
  eligible.forEach(function (id) { if (!seen[id]) ordered.push(id); });
  return ordered;
}

function reconcileSingleCourseShortcuts_(record, deps) {
  const d = getCourseDriveDeps_(deps);
  const report = {
    courseId: record.courseId,
    courseName: record.courseName,
    created: 0, repaired: 0, skipped: 0, failed: 0,
    rosterError: "",
    failures: []
  };

  let students;
  try {
    students = d.getEnrolledStudents(record.courseId) || [];
  } catch (e) {
    report.rosterError = getExceptionMessage_(e);
    report.failures.push(`roster unavailable: ${report.rosterError}`);
    report.failed++;
    return report;
  }
  const targetName = buildCourseDriveName_(record.courseName, record.section);

  students.forEach(function (studentEmail) {
    try {
      const existing = findShortcutAsUser_(studentEmail, record.courseId, record.folderId, deps);
      const decision = decideShortcutAction_(existing, record.folderId);
      if (decision.action === "SKIP") {
        report.skipped++;
        return;
      }
      if (decision.action === "REPAIR") {
        // Belt and braces: an unmarked shortcut is the student's own work and is
        // only ever returned when it already points at the right target, so it
        // can never reach here — but nothing this tool does should be one bug
        // away from deleting a student's file.
        if (existing.unmarked) {
          report.skipped++;
          return;
        }
        const trashed = trashShortcutAsUser_(studentEmail, existing.id, deps);
        if (!trashed.ok) {
          report.failed++;
          report.failures.push(`${studentEmail}: could not remove stale shortcut — ${trashed.message}`);
          return;
        }
      }
      const created = createShortcutAsUser_(studentEmail, record.courseId, record.folderId, targetName, deps);
      if (!created.ok) {
        report.failed++;
        report.failures.push(`${studentEmail}: ${created.message}`);
        return;
      }
      if (decision.action === "REPAIR") report.repaired++;
      else report.created++;
    } catch (e) {
      report.failed++;
      report.failures.push(`${studentEmail}: ${getExceptionMessage_(e)}`);
    }
  });

  return report;
}

/* ==================== teardown ==================== */

/**
 * Archiving a course must not orphan its materials, and must never delete them.
 * Students are dropped to read-only and the row is marked ARCHIVED; the drive
 * or folder itself is left in place for a human to dispose of deliberately.
 */
function archiveCourseDriveRecords(courseIds, deps) {
  const d = getCourseDriveDeps_(deps);
  const ids = (courseIds || []).map(String).filter(function (id) { return id; });
  const registry = d.readRegistry();
  const archived = [];
  const errors = [];

  ids.forEach(function (courseId) {
    const record = registry[courseId];
    if (!record || record.state !== COURSE_DRIVE_CONFIG.STATE_ACTIVE) return;
    try {
      record.state = COURSE_DRIVE_CONFIG.STATE_ARCHIVED;
      record.note = "Archived with the course; content retained.";
      d.writeRecord(record);
      archived.push(courseId);
    } catch (e) {
      errors.push({ courseId: courseId, message: getExceptionMessage_(e) });
    }
  });

  if (archived.length > 0 || errors.length > 0) {
    d.log("COURSE_DRIVE_ARCHIVE", `${ids.length} course(s)`,
      errors.length > 0 ? "PARTIAL" : "SUCCESS",
      `archived=${archived.length}, errors=${errors.length}`);
  }
  return { archived: archived, errors: errors };
}

function getCourseDriveStatus(courseIds, deps) {
  const d = getCourseDriveDeps_(deps);
  const registry = d.readRegistry();
  const ids = (courseIds || []).map(String).filter(function (id) { return id; });
  const source = ids.length > 0 ? ids : Object.keys(registry);
  return source.map(function (courseId) {
    const record = registry[courseId];
    if (!record) return { courseId: courseId, state: "NONE" };
    return {
      courseId: record.courseId,
      courseName: record.courseName,
      section: record.section,
      mode: record.mode,
      state: record.state,
      folderUrl: record.folderUrl,
      lastReconciledAt: record.lastReconciledAt ? String(record.lastReconciledAt) : "",
      note: record.note
    };
  });
}

/* ==================== triggers ==================== */

function installCourseDriveReconcileTrigger() {
  const existing = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === COURSE_DRIVE_CONFIG.MAINTENANCE_TRIGGER_HANDLER;
  });
  if (existing.length > 0) {
    return "Shortcut reconciliation trigger is already installed (hourly).";
  }
  ScriptApp.newTrigger(COURSE_DRIVE_CONFIG.MAINTENANCE_TRIGGER_HANDLER).timeBased().everyHours(1).create();
  logSystemAction_("COURSE_DRIVE_TRIGGER", "runCourseDriveMaintenance", "SUCCESS", "Hourly trigger installed.");
  return "Hourly shortcut reconciliation trigger installed. Only needed for SHORTCUT mode.";
}

function removeCourseDriveReconcileTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === COURSE_DRIVE_CONFIG.MAINTENANCE_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  logSystemAction_("COURSE_DRIVE_TRIGGER", "runCourseDriveMaintenance", "SUCCESS", `Removed ${removed} trigger(s).`);
  return `Removed ${removed} shortcut reconciliation trigger(s).`;
}

/* ============================================================================
 * Integration with the existing bulk course / roster flows
 * ============================================================================
 *
 * These are wrappers rather than edits to the shipped functions. The bulk
 * create and roster paths are the most heavily exercised code in this project
 * and already have unit-test coverage; wrapping keeps that behaviour bit-for-bit
 * identical while adding the Drive step, and lets the UI opt in per action.
 */

/**
 * Bulk course creation + folder provisioning in one pass.
 * Courses whose Classroom group has not appeared yet are parked as PENDING and
 * picked up by runCourseDriveMaintenance(); nothing is silently lost.
 */
function processBatchCourseUploadWithDrive(fileName, fileContent, mode, deps) {
  const uploadResult = processBatchCourseUpload(fileName, fileContent);

  // "NONE" is the explicit opt-out from the upload card. It must be checked
  // before normalizeCourseDriveMode_, which deliberately coerces anything it
  // does not recognise to SHARED_DRIVE — that default is right for a mode
  // choice and wrong for an opt-out.
  if (String(mode || "").trim().toUpperCase() === "NONE") {
    uploadResult.driveProvisioning = { skippedReason: "Materials folder provisioning was not requested." };
    return uploadResult;
  }

  const createdIds = (uploadResult.created || [])
    .map(function (item) { return String(item.courseId || ""); })
    .filter(function (id) { return id; });

  if (createdIds.length === 0) {
    uploadResult.driveProvisioning = { skippedReason: "No courses were created." };
    return uploadResult;
  }

  try {
    uploadResult.driveProvisioning = provisionCourseDrives(createdIds, mode, deps);
  } catch (e) {
    uploadResult.driveProvisioning = { error: getExceptionMessage_(e) };
  }
  return uploadResult;
}

/**
 * Roster enrolment + shortcut sync. In SHARED_DRIVE mode this does nothing
 * beyond the enrolment itself, and that is the point: access follows the
 * Classroom group with no further API calls.
 */
function applyEnrollmentChangesWithDrive(courseId, toEnroll, toRemove, deps) {
  const result = applyEnrollmentChanges(courseId, toEnroll, toRemove);
  result.driveSync = syncCourseDriveForRoster_([courseId], deps);
  return result;
}

function addStudentsToCourseWithDrive(courseId, studentEmails, deps) {
  const result = addStudentsToCourse(courseId, studentEmails);
  result.driveSync = syncCourseDriveForRoster_([courseId], deps);
  return result;
}

function processBatchCourseStudentUploadWithDrive(fileName, fileContent, deps) {
  const result = processBatchCourseStudentUpload(fileName, fileContent);
  const affected = {};
  (result.enrolled || []).forEach(function (item) {
    if (item && item.courseId) affected[String(item.courseId)] = true;
  });
  result.driveSync = syncCourseDriveForRoster_(Object.keys(affected), deps);
  return result;
}

/**
 * The only roster-triggered Drive work that ever needs doing. Returns a plain
 * "nothing to do" for SHARED_DRIVE courses so the UI can say so honestly rather
 * than implying work happened.
 */
function syncCourseDriveForRoster_(courseIds, deps) {
  const ids = (courseIds || []).map(String).filter(function (id) { return id; });
  if (ids.length === 0) return { mode: "NONE", message: "No courses affected." };

  const d = getCourseDriveDeps_(deps);
  let registry;
  try {
    registry = d.readRegistry();
  } catch (e) {
    return { mode: "NONE", message: `Registry unavailable: ${getExceptionMessage_(e)}` };
  }

  const shortcutCourses = ids.filter(function (courseId) {
    const record = registry[courseId];
    return record && record.mode === COURSE_DRIVE_CONFIG.MODE_SHORTCUT &&
      record.state === COURSE_DRIVE_CONFIG.STATE_ACTIVE;
  });

  if (shortcutCourses.length === 0) {
    const provisioned = ids.filter(function (courseId) { return !!registry[courseId]; });
    return {
      mode: COURSE_DRIVE_CONFIG.MODE_SHARED_DRIVE,
      message: provisioned.length > 0
        ? "No action needed — access follows the Classroom course group automatically."
        : "No course materials folder is provisioned for these courses yet.",
      created: 0, repaired: 0, failed: 0
    };
  }

  try {
    const report = reconcileCourseShortcuts({ courseIds: shortcutCourses }, deps);
    report.mode = COURSE_DRIVE_CONFIG.MODE_SHORTCUT;
    return report;
  } catch (e) {
    return { mode: COURSE_DRIVE_CONFIG.MODE_SHORTCUT, error: getExceptionMessage_(e) };
  }
}

function archiveClassroomCoursesWithDrive(courseIds, deps) {
  const result = archiveClassroomCourses(courseIds);
  try {
    result.driveTeardown = archiveCourseDriveRecords(courseIds, deps);
  } catch (e) {
    result.driveTeardown = { error: getExceptionMessage_(e) };
  }
  return result;
}

function deleteClassroomCoursesWithDrive(courseIds, deps) {
  const result = deleteClassroomCourses(courseIds);
  try {
    // Deleting a course never deletes its materials. The row is archived so the
    // folder stays discoverable for whoever has to dispose of it.
    result.driveTeardown = archiveCourseDriveRecords(courseIds, deps);
  } catch (e) {
    result.driveTeardown = { error: getExceptionMessage_(e) };
  }
  return result;
}

/* ==================== maintenance ==================== */

/**
 * Retries courses parked as PENDING (Classroom group not yet published) or
 * FAILED. Bounded per run so a large backlog cannot blow the execution ceiling.
 */
function retryPendingCourseDriveProvisioning(deps) {
  const d = getCourseDriveDeps_(deps);
  const registry = d.readRegistry();
  const pending = Object.keys(registry).filter(function (courseId) {
    const state = registry[courseId].state;
    return state === COURSE_DRIVE_CONFIG.STATE_PENDING || state === COURSE_DRIVE_CONFIG.STATE_FAILED;
  }).slice(0, COURSE_DRIVE_CONFIG.MAX_COURSES_PER_RUN);

  if (pending.length === 0) {
    return { message: "No pending course folders to provision.", provisioned: [], skipped: [], errors: [] };
  }

  const byMode = {};
  pending.forEach(function (courseId) {
    const mode = normalizeCourseDriveMode_(registry[courseId].mode);
    if (!byMode[mode]) byMode[mode] = [];
    byMode[mode].push(courseId);
  });

  const merged = { message: "", provisioned: [], skipped: [], errors: [] };
  Object.keys(byMode).forEach(function (mode) {
    const outcome = provisionCourseDrives(byMode[mode], mode, deps);
    merged.provisioned = merged.provisioned.concat(outcome.provisioned || []);
    merged.skipped = merged.skipped.concat(outcome.skipped || []);
    merged.errors = merged.errors.concat(outcome.errors || []);
  });
  merged.message = `Retried ${pending.length} pending course(s): provisioned ${merged.provisioned.length}, ` +
    `still waiting ${merged.skipped.length}, failed ${merged.errors.length}.`;
  return merged;
}

/** Single trigger entry point: finish pending provisioning, then repair shortcuts. */
function runCourseDriveMaintenance() {
  const provisioning = retryPendingCourseDriveProvisioning();
  const reconciliation = reconcileCourseShortcuts();
  return {
    provisioning: provisioning,
    reconciliation: reconciliation,
    message: `${provisioning.message} ${reconciliation.message}`
  };
}
