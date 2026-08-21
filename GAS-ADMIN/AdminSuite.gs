/**
 * Project: Domain Admin Suite
 * Version: 2.6.0
 * Updated: 2026-08-21 (Timezone UTC+8)
 * Description: Comprehensive Admin System (Classroom, Groups, Directory, Drive, Email).
 * * CORE FEATURES:
 * 1. Classroom: Create/Delete Courses, Add up to two Teachers, Manage (add/remove) teachers per course, Roster Students via OU, Batch Create (CSV/TSV)
 * 2. Groups: Batch Create Groups (CSV/TSV), Multi-group Member Assignment via OU selector
 * 3. Directory: Inactive User Detection, Suspend, Move OU
 * 4. Lifecycle: Automated deletion of suspended accounts after 3 months
 * 5. Drive: Outdated File Auditing with paginated BFS recursive sub-directory scan + domain-wide shared drive sweep; results saved to Drive_Audit_Logs sheet with owner Gmail; Batch Delete/Archive with locale-independent 403 classification, Trash fallback, shared-drive domain-admin escalation, and optional delete-as-owner via domain-wide delegation
 * 6. Email: Custom HTML notification sending with variable support ({name}, {email})
 * 7. Logging: Centralized logging to Spreadsheet (UTC+8); Drive audit snapshots persisted per run
 * * * REQUIRED SCOPES:
 * @include https://www.googleapis.com/auth/script.scriptapp
 * @include https://www.googleapis.com/auth/script.external_request
 * @include https://www.googleapis.com/auth/spreadsheets
 * @include https://www.googleapis.com/auth/classroom.courses
 * @include https://www.googleapis.com/auth/classroom.rosters
 * @include https://www.googleapis.com/auth/classroom.profile.emails
 * @include https://www.googleapis.com/auth/admin.directory.group
 * @include https://www.googleapis.com/auth/admin.directory.group.member
 * @include https://www.googleapis.com/auth/admin.directory.user
 * @include https://www.googleapis.com/auth/admin.directory.orgunit
 * @include https://www.googleapis.com/auth/drive
 * @include https://www.googleapis.com/auth/gmail.send
 */

const APP_VERSION = "2.6.0";
const CONFIG = {
  TIME_ZONE: "GMT+8",
  SHEET_NAME_COURSES: "Classroom_Courses",
  SHEET_NAME_LOGS: "Classroom_Logs",
  SHEET_NAME_ACTIONS: "Action_Logs",
  SHEET_NAME_GROUP_AUDIT: "Group_Audit_Logs",
  SHEET_NAME_EMAILS: "Email_Logs",
  SHEET_NAME_DRIVE_AUDIT: "Drive_Audit_Logs",
  PROP_SHEET_ID: "MANAGE_SPREADSHEET_ID"
};

const COURSE_BATCH_CONFIG = {
  MAX_ROWS: 100,
  MAX_CALLS_PER_BATCH: 50,
  ENDPOINT: "https://classroom.googleapis.com/batch",
  TEMPLATE_HEADERS: ["name", "section", "teacherEmail", "description"]
};

const COURSE_BATCH_REQUIRED_FIELDS = ["name", "teacherEmail"];

const COURSE_BATCH_HEADER_ALIAS_LOOKUP = {
  name: "name",
  course: "name",
  coursename: "name",
  classname: "name",
  classtitle: "name",
  title: "name",
  section: "section",
  classsection: "section",
  period: "section",
  semester: "section",
  teacher: "teacherEmail",
  teacheremail: "teacherEmail",
  teacherid: "teacherEmail",
  instructor: "teacherEmail",
  instructoremail: "teacherEmail",
  owneremail: "teacherEmail",
  description: "description",
  coursedescription: "description",
  desc: "description",
  details: "description"
};

const GROUP_BATCH_CONFIG = {
  MAX_ROWS: 100,
  TEMPLATE_HEADERS: ["email", "name", "description"]
};

const GROUP_BATCH_REQUIRED_FIELDS = ["email"];

const GROUP_BATCH_HEADER_ALIAS_LOOKUP = {
  email: "email",
  groupemail: "email",
  groupemailaddress: "email",
  address: "email",
  group: "email",
  groupname: "name",
  name: "name",
  displayname: "name",
  title: "name",
  description: "description",
  desc: "description",
  details: "description",
  note: "description"
};

const GROUP_MEMBER_ALLOWED_ROLES = ["MEMBER", "MANAGER", "OWNER"];

/**
 * Serves the Web App UI.
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');
  template.appVersion = APP_VERSION;
  
  return template.evaluate()
    .setTitle(`Domain Admin Suite v${APP_VERSION}`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Gets the connected Spreadsheet object.
 */
function getDBSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const storedId = props.getProperty(CONFIG.PROP_SHEET_ID);

  try {
    if (storedId) return SpreadsheetApp.openById(storedId);
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    console.error("Could not open spreadsheet from properties.");
    return SpreadsheetApp.getActiveSpreadsheet(); 
  }
}

/**
 * Saves the target Spreadsheet ID in script properties.
 */
function setDbSpreadsheetId(spreadsheetId) {
  if (!spreadsheetId) throw new Error("Spreadsheet ID is required.");
  PropertiesService.getScriptProperties().setProperty(CONFIG.PROP_SHEET_ID, spreadsheetId);
  return "Spreadsheet ID saved.";
}

/**
 * Writes a general log entry to the spreadsheet.
 */
function logSystemAction_(action, target, status, detail) {
  try {
    const ss = getDBSpreadsheet_();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAME_LOGS);
      sheet.appendRow(["Timestamp (UTC+8)", "Action", "Target", "Status", "Detail", "Version"]);
      sheet.setFrozenRows(1);
    }

    const timestamp = Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([timestamp, action, target, status, detail, APP_VERSION]);
    
    if (sheet.getLastRow() > 2000) {
      sheet.deleteRows(2, sheet.getLastRow() - 2000);
    }
  } catch (e) {
    console.error("Logging failed", e);
  }
}

/* =========================================
   FEATURE 1: CLASSROOM MANAGEMENT
   ========================================= */

/**
 * Creates a new Course and optionally invites a teacher.
 */
function createClassroomCourse(payload) {
  if (!payload || !payload.name) throw new Error("Course Name is required.");
  
  const coursePayload = {
    name: payload.name,
    section: payload.section || "",
    description: payload.description || "",
    ownerId: "me",
    courseState: "ACTIVE"
  };

  try {
    const created = Classroom.Courses.create(coursePayload);

    // Assign up to two teachers (deduped, ignoring the "me"/owner sentinel).
    const teacherEmails = [];
    [payload.teacherEmail, payload.teacherEmail2].forEach(email => {
      if (email && email !== "me" && teacherEmails.indexOf(email) === -1) {
        teacherEmails.push(email);
      }
    });

    const teacherStatuses = [];
    teacherEmails.forEach(email => {
      try {
        Classroom.Courses.Teachers.create({ userId: email }, created.id);
        teacherStatuses.push(`Teacher added: ${email}`);
      } catch (e) {
        teacherStatuses.push(`Failed to add teacher ${email}: ${e.message}`);
      }
    });
    const teacherStatus = teacherStatuses.length ? teacherStatuses.join("; ") : "Owner only (Admin)";

    appendCourseRecordsToSheet_([{
      courseId: created.id,
      name: created.name || payload.name,
      section: created.section || payload.section || "",
      ownerId: created.ownerId || "me",
      teacherEmail: teacherEmails.join(", "),
      createdAt: new Date()
    }]);
    
    logSystemAction_("CREATE_COURSE", created.id, "SUCCESS", `Name: ${created.name}, ${teacherStatus}`);
    
    return { 
      id: created.id, 
      name: created.name, 
      section: created.section,
      enrollmentCode: created.enrollmentCode
    };

  } catch (e) {
    logSystemAction_("CREATE_COURSE", payload.name, "FAILED", e.message);
    throw new Error("Create Failed: " + e.message);
  }
}

/**
 * Lists courses and merges with local DB data.
 */
function listCourses() {
  try {
    const response = Classroom.Courses.list({ courseStates: ['ACTIVE'], pageSize: 50 });
    const courses = response.courses || [];
    
    logSystemAction_("LIST_COURSES", "N/A", "SUCCESS", `Retrieved ${courses.length} courses`);
    return courses.map(c => ({ 
      id: c.id, 
      name: c.name, 
      section: c.section || "", 
      enrollmentCode: c.enrollmentCode,
      ownerId: c.ownerId 
    }));
  } catch (err) {
    logSystemAction_("LIST_COURSES", "N/A", "ERROR", err.message);
    throw err;
  }
}

/**
 * Lists archived courses.
 */
function listArchivedCourses() {
  try {
    const response = Classroom.Courses.list({ courseStates: ['ARCHIVED'], pageSize: 50 });
    const courses = response.courses || [];
    logSystemAction_("LIST_ARCHIVED_COURSES", "N/A", "SUCCESS", `Retrieved ${courses.length} archived courses`);
    return courses.map(c => ({
      id: c.id,
      name: c.name,
      section: c.section || "",
      ownerId: c.ownerId
    }));
  } catch (err) {
    logSystemAction_("LIST_ARCHIVED_COURSES", "N/A", "ERROR", err.message);
    throw err;
  }
}

/**
 * Deletes a course.
 */
function deleteClassroomCourse(courseId) {
  if (!courseId) throw new Error("Course ID required.");
  try {
    Classroom.Courses.remove(courseId);
    
    // Sync Sheet: Mark as deleted or remove row
    const ss = getDBSpreadsheet_();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_COURSES);
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(courseId)) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
    }
    
    logSystemAction_("DELETE_COURSE", courseId, "SUCCESS", "Course deleted");
    return `Course ${courseId} deleted successfully.`;
  } catch (e) {
    logSystemAction_("DELETE_COURSE", courseId, "FAILED", e.message);
    throw new Error("Delete Failed: " + e.message);
  }
}

/**
 * Archives one or more Classroom courses using batch PATCH requests.
 * Archived courses become read-only but can be unarchived later.
 * @param {string[]} courseIds - Array of course IDs to archive.
 * @return {{ summary: {total, archived, failed}, archived: [{id}], failed: [{id, reason}] }}
 */
function archiveClassroomCourses(courseIds) {
  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    throw new Error("courseIds must be a non-empty array.");
  }

  const operations = courseIds.map(id => ({
    contentId: `archive-${id}`,
    method: "PATCH",
    path: `/v1/courses/${encodeURIComponent(id)}?updateMask=courseState`,
    body: { courseState: "ARCHIVED" }
  }));

  const results = executeBatchOperations_(operations);
  const resultMap = mapBatchResultsByContentId_(results);

  const archived = [];
  const failed = [];

  courseIds.forEach(id => {
    const r = resultMap[`archive-${id}`];
    if (r && r.ok) {
      archived.push({ id });
    } else {
      failed.push({ id, reason: (r && r.message) || "No response" });
    }
  });

  const status = failed.length === 0 ? "SUCCESS" : (archived.length === 0 ? "FAILED" : "PARTIAL");
  logSystemAction_(
    "BATCH_ARCHIVE_COURSES",
    "Batch",
    status,
    `Total: ${courseIds.length}, Archived: ${archived.length}, Failed: ${failed.length}`
  );

  return {
    summary: { total: courseIds.length, archived: archived.length, failed: failed.length },
    archived,
    failed
  };
}

/**
 * Batch-deletes one or more courses permanently using multipart batch requests.
 * Works on courses of any state (ACTIVE or ARCHIVED).
 * @param {string[]} courseIds - Array of course IDs to delete.
 * @return {{ summary: {total, deleted, failed}, deleted: [{id}], failed: [{id, reason}] }}
 */
function deleteClassroomCourses(courseIds) {
  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    throw new Error("courseIds must be a non-empty array.");
  }

  const operations = courseIds.map(id => ({
    contentId: `delete-${id}`,
    method: "DELETE",
    path: `/v1/courses/${encodeURIComponent(id)}`,
    body: {}
  }));

  const results = executeBatchOperations_(operations);
  const resultMap = mapBatchResultsByContentId_(results);

  const deleted = [];
  const failed = [];

  courseIds.forEach(id => {
    const r = resultMap[`delete-${id}`];
    if (r && r.ok) {
      deleted.push({ id });
    } else {
      failed.push({ id, reason: (r && r.message) || "No response" });
    }
  });

  const status = failed.length === 0 ? "SUCCESS" : (deleted.length === 0 ? "FAILED" : "PARTIAL");
  logSystemAction_(
    "BATCH_DELETE_COURSES",
    "Batch",
    status,
    `Total: ${courseIds.length}, Deleted: ${deleted.length}, Failed: ${failed.length}`
  );

  return {
    summary: { total: courseIds.length, deleted: deleted.length, failed: failed.length },
    deleted,
    failed
  };
}

function addStudentsToCourse(courseId, studentEmails) {
  if (!studentEmails || studentEmails.length === 0) return { message: "No students provided." };
  
  const results = { success: [], errors: [] };
  studentEmails.forEach(email => {
    try {
      Classroom.Courses.Students.create({ userId: email }, courseId);
      results.success.push(email);
    } catch (e) {
      let msg = e.message;
      if (msg.includes("ALREADY_EXISTS")) msg = "Already Enrolled";
      results.errors.push(`${email}: ${msg}`);
    }
  });
  logSystemAction_("ADD_STUDENTS", courseId, "COMPLETE", `Success: ${results.success.length}, Errors: ${results.errors.length}`);
  return { message: `Processed ${studentEmails.length} students.`, details: results };
}

function getEnrolledStudentEmails(courseId) {
  if (!courseId) return [];
  try {
    const emails = [];
    let pageToken = null;
    do {
      const response = Classroom.Courses.Students.list(courseId, {
        pageSize: 200,
        pageToken: pageToken
      });
      (response.students || []).forEach(s => {
        const email = s.profile && s.profile.emailAddress;
        if (email) emails.push(email.toLowerCase());
      });
      pageToken = response.nextPageToken;
    } while (pageToken);
    return emails;
  } catch (e) {
    return [];
  }
}

function applyEnrollmentChanges(courseId, toEnroll, toRemove) {
  if (!courseId) return { message: "No course specified." };
  const enrolled = { success: [], errors: [] };
  const removed  = { success: [], errors: [] };

  (toEnroll || []).forEach(email => {
    try {
      Classroom.Courses.Students.create({ userId: email }, courseId);
      enrolled.success.push(email);
    } catch (e) {
      let msg = e.message;
      if (msg.includes("ALREADY_EXISTS")) msg = "Already Enrolled";
      enrolled.errors.push(`${email}: ${msg}`);
    }
  });

  (toRemove || []).forEach(email => {
    try {
      Classroom.Courses.Students.remove(courseId, email);
      removed.success.push(email);
    } catch (e) {
      let msg = e.message;
      if (msg.includes("NOT_FOUND")) msg = "Not Enrolled";
      removed.errors.push(`${email}: ${msg}`);
    }
  });

  logSystemAction_("APPLY_ENROLLMENT", courseId, "COMPLETE",
    `Enrolled: ${enrolled.success.length}, Removed: ${removed.success.length}, Errors: ${enrolled.errors.length + removed.errors.length}`);
  return {
    message: `Enrolled: ${enrolled.success.length}, Removed: ${removed.success.length}` +
      (enrolled.errors.length + removed.errors.length > 0
        ? ` (${enrolled.errors.length + removed.errors.length} error(s))` : ''),
    enrolled,
    removed
  };
}

/**
 * Returns the current teacher roster of a course. The course owner is also a
 * teacher and is flagged with `isOwner: true` so the UI can protect it from
 * removal. Used by the "Manage Teachers" modal (`openTeacherManager()`).
 *
 * @param {string} courseId
 * @return {{courseId:string, ownerId:string, teachers:Array<{userId,email,name,isOwner}>}}
 */
function getCourseTeachers(courseId) {
  if (!courseId) throw new Error("Course ID required.");
  try {
    let ownerId = "";
    try {
      const course = Classroom.Courses.get(courseId);
      ownerId = course && course.ownerId ? String(course.ownerId) : "";
    } catch (e) {
      // Owner detection is best-effort; absence only means the UI won't tag the owner.
    }

    const teachers = [];
    let pageToken = null;
    do {
      const response = Classroom.Courses.Teachers.list(courseId, { pageSize: 100, pageToken: pageToken });
      (response.teachers || []).forEach(t => {
        const profile = t.profile || {};
        const userId = String(t.userId || "");
        teachers.push({
          userId: userId,
          email: (profile.emailAddress || "").toLowerCase(),
          name: (profile.name && profile.name.fullName) || profile.emailAddress || userId,
          isOwner: ownerId !== "" && userId === ownerId
        });
      });
      pageToken = response.nextPageToken;
    } while (pageToken);

    // Owner first, then natural-sorted by name (shares the directory sort key).
    teachers.sort(function (a, b) {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return buildUserSortKey_(a.name).localeCompare(buildUserSortKey_(b.name), "zh-Hant");
    });

    logSystemAction_("LIST_COURSE_TEACHERS", courseId, "SUCCESS", `Retrieved ${teachers.length} teachers`);
    return { courseId: String(courseId), ownerId: ownerId, teachers: teachers };
  } catch (err) {
    logSystemAction_("LIST_COURSE_TEACHERS", courseId, "ERROR", err.message);
    throw new Error("Failed to list teachers: " + getExceptionMessage_(err));
  }
}

/**
 * Adds and/or removes teachers on an existing course. Mirrors the partial-success
 * contract of `applyEnrollmentChanges`. The course OWNER cannot be removed (the
 * Classroom API forbids it) — any attempt is rejected and reported as an error
 * rather than throwing, so the rest of the batch still applies.
 *
 * @param {string} courseId
 * @param {string[]} toAdd     teacher emails to add
 * @param {string[]} toRemove  teacher userIds (preferred) or emails to remove
 * @return {{message:string, added:{success,errors}, removed:{success,errors}}}
 */
function updateCourseTeachers(courseId, toAdd, toRemove) {
  if (!courseId) throw new Error("Course ID required.");

  // Resolve the owner up front so we can protect it from removal.
  let ownerId = "";
  try {
    const course = Classroom.Courses.get(courseId);
    ownerId = course && course.ownerId ? String(course.ownerId) : "";
  } catch (e) {
    // Best-effort; if we cannot resolve the owner, the API itself still guards it.
  }

  const added = { success: [], errors: [] };
  const removed = { success: [], errors: [] };

  const addList = (toAdd || []).map(e => String(e).trim()).filter(Boolean);
  const removeList = (toRemove || []).map(e => String(e).trim()).filter(Boolean);

  addList.forEach(email => {
    try {
      Classroom.Courses.Teachers.create({ userId: email }, courseId);
      added.success.push(email);
    } catch (e) {
      let msg = getExceptionMessage_(e);
      if (msg.indexOf("ALREADY_EXISTS") !== -1) msg = "Already a teacher";
      added.errors.push(`${email}: ${msg}`);
    }
  });

  removeList.forEach(idOrEmail => {
    if (ownerId && String(idOrEmail) === ownerId) {
      removed.errors.push(`${idOrEmail}: Cannot remove the course owner.`);
      return;
    }
    try {
      Classroom.Courses.Teachers.remove(courseId, idOrEmail);
      removed.success.push(idOrEmail);
    } catch (e) {
      let msg = getExceptionMessage_(e);
      if (msg.indexOf("NOT_FOUND") !== -1) msg = "Not a teacher";
      else if (msg.indexOf("FAILED_PRECONDITION") !== -1) msg = "Cannot remove the course owner.";
      removed.errors.push(`${idOrEmail}: ${msg}`);
    }
  });

  const errorCount = added.errors.length + removed.errors.length;
  logSystemAction_("UPDATE_COURSE_TEACHERS", courseId, "COMPLETE",
    `Added: ${added.success.length}, Removed: ${removed.success.length}, Errors: ${errorCount}`);

  return {
    message: `Added: ${added.success.length}, Removed: ${removed.success.length}` +
      (errorCount > 0 ? ` (${errorCount} error(s))` : ''),
    added,
    removed
  };
}

/**
 * Processes CSV/TSV content and creates courses in Classroom using true multipart batch requests.
 * Teacher assignment is required per row and applied as phase 2 after successful course creation.
 */
function processBatchCourseUpload(fileName, fileContent) {
  if (!fileContent || !String(fileContent).trim()) {
    throw new Error("Upload file is empty.");
  }

  const delimiter = detectBatchDelimiter_(fileName, fileContent);
  const rows = parseDelimitedRows_(fileContent, delimiter);
  if (rows.length < 2) {
    throw new Error("File must include headers and at least one data row.");
  }

  const headerMap = mapCourseBatchHeaderIndexes_(rows[0]);
  const existingCourseKeys = getActiveCourseKeySet_();
  const seenUploadKeys = new Set();
  const skipped = [];
  const candidates = [];
  let nonEmptyRowCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const rowObj = normalizeBatchCourseRow_(rows[i], headerMap);
    if (isBatchCourseRowEmpty_(rowObj)) continue;

    nonEmptyRowCount++;
    const validation = validateBatchCourseRow_(rowObj);
    if (!validation.valid) {
      skipped.push({ rowNumber: rowNumber, reason: validation.errors.join(" ") });
      continue;
    }

    const key = buildCourseKey_(rowObj.name, rowObj.section);
    if (existingCourseKeys.has(key)) {
      skipped.push({ rowNumber: rowNumber, reason: "Skipped duplicate active course (name + section)." });
      continue;
    }
    if (seenUploadKeys.has(key)) {
      skipped.push({ rowNumber: rowNumber, reason: "Skipped duplicate row in upload file (name + section)." });
      continue;
    }

    seenUploadKeys.add(key);
    candidates.push({
      rowNumber: rowNumber,
      key: key,
      name: rowObj.name,
      section: rowObj.section,
      teacherEmail: rowObj.teacherEmail,
      description: rowObj.description
    });
  }

  assertBatchRowLimit_(nonEmptyRowCount);
  if (nonEmptyRowCount === 0) {
    throw new Error("No non-empty rows found in upload file.");
  }

  const phaseOutput = runCourseBatchPhases_(candidates, function(operations) {
    return executeBatchOperations_(operations);
  });

  if (phaseOutput.createdRecords.length > 0) {
    appendCourseRecordsToSheet_(phaseOutput.createdRecords);
  }

  const created = phaseOutput.createdRecords.map(record => ({
    rowNumber: record.rowNumber,
    courseId: record.courseId,
    name: record.name,
    section: record.section,
    teacherEmail: record.teacherEmail,
    enrollmentCode: record.enrollmentCode || "",
    teacherStatus: record.teacherAssigned ? "ASSIGNED" : "FAILED",
    teacherError: record.teacherError || ""
  }));

  const result = {
    fileName: fileName || "upload",
    delimiter: delimiter === "\t" ? "TSV" : "CSV",
    rowLimit: COURSE_BATCH_CONFIG.MAX_ROWS,
    summary: {
      totalRows: nonEmptyRowCount,
      attemptedRows: candidates.length,
      created: created.filter(item => item.teacherStatus === "ASSIGNED").length,
      partial: created.filter(item => item.teacherStatus === "FAILED").length,
      skipped: skipped.length,
      errors: phaseOutput.errors.length
    },
    created: created,
    skipped: skipped,
    errors: phaseOutput.errors
  };

  logSystemAction_(
    "BATCH_CREATE_COURSES",
    result.fileName,
    "COMPLETE",
    buildBatchCreateLogDetail_(result)
  );

  return result;
}

/**
 * Returns a sample CSV/TSV template for bulk Classroom course creation.
 */
function getCourseBatchTemplate(format) {
  const normalizedFormat = String(format || "csv").toLowerCase() === "tsv" ? "tsv" : "csv";
  const delimiter = normalizedFormat === "tsv" ? "\t" : ",";
  const mimeType = normalizedFormat === "tsv" ? "text/tab-separated-values" : "text/csv";

  const templateRows = [
    COURSE_BATCH_CONFIG.TEMPLATE_HEADERS,
    ["Math 6A", "2026-Spring", "teacher01@example.edu", "Grade 6 math class"],
    ["Science 5B", "2026-Spring", "teacher02@example.edu", "Grade 5 science class"]
  ];

  const content = templateRows
    .map(row => row.map(cell => escapeDelimitedValue_(cell, delimiter)).join(delimiter))
    .join("\n");

  return {
    filename: `classroom-course-batch-template.${normalizedFormat}`,
    mimeType: mimeType,
    content: content
  };
}

function runCourseBatchPhases_(rows, batchExecutor) {
  const createdRecords = [];
  const errors = [];

  if (!rows || rows.length === 0) {
    return { createdRecords: createdRecords, errors: errors };
  }

  const createOps = rows.map(row => ({
    contentId: `create-row-${row.rowNumber}`,
    method: "POST",
    path: "/v1/courses",
    body: {
      name: row.name,
      section: row.section || "",
      description: row.description || "",
      ownerId: "me",
      courseState: "ACTIVE"
    },
    meta: row
  }));

  const createResultMap = mapBatchResultsByContentId_(batchExecutor(createOps));
  const createdForTeacherPhase = [];

  createOps.forEach(op => {
    const row = op.meta;
    const result = createResultMap[op.contentId];
    if (!result || !result.ok) {
      errors.push({
        rowNumber: row.rowNumber,
        stage: "CREATE_COURSE",
        statusCode: result ? result.statusCode : 0,
        message: result ? result.message : "No response received for create request."
      });
      return;
    }

    if (!result.body || !result.body.id) {
      errors.push({
        rowNumber: row.rowNumber,
        stage: "CREATE_COURSE",
        statusCode: result.statusCode || 200,
        message: "Course created response did not include a course ID."
      });
      return;
    }

    createdForTeacherPhase.push({
      rowNumber: row.rowNumber,
      name: row.name,
      section: row.section,
      teacherEmail: row.teacherEmail,
      course: result.body
    });
  });

  const teacherOps = createdForTeacherPhase.map(item => ({
    contentId: `teacher-row-${item.rowNumber}`,
    method: "POST",
    path: `/v1/courses/${encodeURIComponent(item.course.id)}/teachers`,
    body: { userId: item.teacherEmail },
    meta: item
  }));

  const teacherResultMap = teacherOps.length > 0
    ? mapBatchResultsByContentId_(batchExecutor(teacherOps))
    : {};

  createdForTeacherPhase.forEach(item => {
    const teacherResult = teacherResultMap[`teacher-row-${item.rowNumber}`];
    const teacherAssigned = Boolean(teacherResult && teacherResult.ok);
    const teacherError = teacherAssigned
      ? ""
      : (teacherResult ? teacherResult.message : "No response received for teacher assignment.");
    if (!teacherAssigned) {
      errors.push({
        rowNumber: item.rowNumber,
        stage: "ADD_TEACHER",
        statusCode: teacherResult ? teacherResult.statusCode : 0,
        message: teacherError
      });
    }

    createdRecords.push({
      rowNumber: item.rowNumber,
      courseId: item.course.id,
      name: item.course.name || item.name,
      section: item.course.section || item.section || "",
      ownerId: item.course.ownerId || "me",
      teacherEmail: item.teacherEmail,
      enrollmentCode: item.course.enrollmentCode || "",
      teacherAssigned: teacherAssigned,
      teacherError: teacherError,
      createdAt: new Date()
    });
  });

  return { createdRecords: createdRecords, errors: errors };
}

function executeBatchOperations_(operations, fetchFn) {
  if (!operations || operations.length === 0) return [];

  const allResults = [];
  for (let i = 0; i < operations.length; i += COURSE_BATCH_CONFIG.MAX_CALLS_PER_BATCH) {
    const chunk = operations.slice(i, i + COURSE_BATCH_CONFIG.MAX_CALLS_PER_BATCH);
    const chunkResults = executeBatchChunk_(chunk, fetchFn);
    allResults.push.apply(allResults, chunkResults);
  }
  return allResults;
}

function executeBatchChunk_(operations, fetchFn) {
  const boundary = `batch_${Utilities.getUuid().replace(/-/g, "")}`;
  const payload = buildBatchMultipartRequest_(operations, boundary);
  const fetcher = fetchFn || UrlFetchApp.fetch;

  const response = fetcher(COURSE_BATCH_CONFIG.ENDPOINT, {
    method: "post",
    contentType: `multipart/mixed; boundary=${boundary}`,
    payload: payload,
    muteHttpExceptions: true,
    headers: {
      Authorization: `Bearer ${ScriptApp.getOAuthToken()}`,
      Accept: "multipart/mixed"
    }
  });

  const statusCode = response.getResponseCode ? response.getResponseCode() : 0;
  const headers = response.getAllHeaders ? response.getAllHeaders() : {};
  const contentType = getHeaderValueIgnoreCase_(headers, "Content-Type");
  const responseText = response.getContentText ? response.getContentText() : "";

  if (statusCode >= 400 && String(contentType || "").indexOf("multipart/mixed") === -1) {
    const parsed = safeJsonParse_(responseText);
    const message = extractApiErrorMessage_(parsed, responseText || `HTTP ${statusCode}`);
    return operations.map(op => ({
      contentId: op.contentId,
      ok: false,
      statusCode: statusCode,
      message: message,
      body: parsed,
      rawBody: responseText
    }));
  }

  let parsedParts = [];
  try {
    parsedParts = parseBatchMultipartResponse_(responseText, contentType);
  } catch (e) {
    return operations.map(op => ({
      contentId: op.contentId,
      ok: false,
      statusCode: statusCode || 0,
      message: `Failed to parse batch response: ${e.message}`,
      body: null,
      rawBody: responseText
    }));
  }
  const partMap = {};
  parsedParts.forEach(part => {
    partMap[part.contentId] = part;
  });

  return operations.map(op => {
    const part = partMap[op.contentId];
    if (!part) {
      return {
        contentId: op.contentId,
        ok: false,
        statusCode: 0,
        message: "No response part returned for this batch request item.",
        body: null,
        rawBody: ""
      };
    }
    return {
      contentId: op.contentId,
      ok: part.statusCode >= 200 && part.statusCode < 300,
      statusCode: part.statusCode,
      message: part.message,
      body: part.body,
      rawBody: part.rawBody
    };
  });
}

function buildBatchMultipartRequest_(operations, boundary) {
  const lines = [];
  operations.forEach(op => {
    lines.push(`--${boundary}`);
    lines.push("Content-Type: application/http");
    lines.push(`Content-ID: <${op.contentId}>`);
    lines.push("");
    lines.push(`${op.method} ${op.path} HTTP/1.1`);
    lines.push("Host: classroom.googleapis.com");
    lines.push("Content-Type: application/json; charset=UTF-8");
    lines.push("Accept: application/json");
    lines.push("");
    lines.push(JSON.stringify(op.body || {}));
    lines.push("");
  });
  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}

function parseBatchMultipartResponse_(responseText, contentType) {
  const boundaryMatch = /boundary="?([^";]+)"?/i.exec(String(contentType || ""));
  if (!boundaryMatch) {
    throw new Error("Batch response is missing multipart boundary.");
  }

  const boundary = boundaryMatch[1];
  const pieces = String(responseText || "").split(`--${boundary}`);
  const parsedParts = [];

  pieces.forEach(piece => {
    let part = piece.trim();
    if (!part || part === "--") return;
    if (part.endsWith("--")) {
      part = part.substring(0, part.length - 2).trim();
    }

    const normalized = part.replace(/\r\n/g, "\n");
    const outerHeaderEnd = normalized.indexOf("\n\n");
    if (outerHeaderEnd === -1) return;

    const outerHeaders = normalized.substring(0, outerHeaderEnd);
    const contentId = normalizeBatchContentId_(extractOuterContentId_(outerHeaders));
    if (!contentId) return;

    const embeddedHttp = normalized.substring(outerHeaderEnd + 2).trim();
    const httpResult = parseEmbeddedHttpResponse_(embeddedHttp);
    parsedParts.push({
      contentId: contentId,
      statusCode: httpResult.statusCode,
      body: httpResult.body,
      rawBody: httpResult.rawBody,
      message: httpResult.message
    });
  });

  return parsedParts;
}

function parseEmbeddedHttpResponse_(httpPayload) {
  const normalized = String(httpPayload || "").replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  const statusLine = lines[0] || "";
  const statusMatch = /^HTTP\/\d+(?:\.\d+)?\s+(\d+)/i.exec(statusLine);
  const statusCode = statusMatch ? Number(statusMatch[1]) : 0;

  let bodyStart = lines.length;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      bodyStart = i + 1;
      break;
    }
  }

  const rawBody = lines.slice(bodyStart).join("\n").trim();
  const body = safeJsonParse_(rawBody);
  const message = extractApiErrorMessage_(body, rawBody || statusLine);

  return {
    statusCode: statusCode,
    body: body,
    rawBody: rawBody,
    message: message
  };
}

function mapBatchResultsByContentId_(results) {
  const map = {};
  (results || []).forEach(item => {
    if (!item || !item.contentId) return;
    map[item.contentId] = item;
  });
  return map;
}

function detectBatchDelimiter_(fileName, fileContent) {
  const lowerFileName = String(fileName || "").toLowerCase();
  if (lowerFileName.endsWith(".tsv")) return "\t";
  if (lowerFileName.endsWith(".csv")) return ",";

  const firstLine = String(fileContent || "").replace(/^\uFEFF/, "").split(/\r?\n/)[0] || "";
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function parseDelimitedRows_(fileContent, delimiter) {
  const cleaned = String(fileContent || "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) throw new Error("Upload file is empty.");
  const rows = Utilities.parseCsv(cleaned, delimiter);
  if (!rows || rows.length === 0) throw new Error("Upload file could not be parsed.");
  return rows;
}

function mapCourseBatchHeaderIndexes_(headerRow) {
  const map = {};
  (headerRow || []).forEach((header, index) => {
    const normalized = normalizeHeader_(header);
    const canonicalField = COURSE_BATCH_HEADER_ALIAS_LOOKUP[normalized];
    if (canonicalField && map[canonicalField] === undefined) {
      map[canonicalField] = index;
    }
  });

  const missing = COURSE_BATCH_REQUIRED_FIELDS.filter(field => map[field] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing required headers: ${missing.join(", ")}.`);
  }
  return map;
}

function normalizeBatchCourseRow_(rawRow, headerMap) {
  return {
    name: getRowValue_(rawRow, headerMap.name),
    section: getRowValue_(rawRow, headerMap.section),
    teacherEmail: getRowValue_(rawRow, headerMap.teacherEmail).toLowerCase(),
    description: getRowValue_(rawRow, headerMap.description)
  };
}

function isBatchCourseRowEmpty_(rowObj) {
  return !rowObj.name && !rowObj.section && !rowObj.teacherEmail && !rowObj.description;
}

function validateBatchCourseRow_(rowObj) {
  const errors = [];
  if (!rowObj.name) {
    errors.push("Course name is required.");
  }
  if (!rowObj.teacherEmail) {
    errors.push("Teacher email is required.");
  } else if (!isValidEmail_(rowObj.teacherEmail)) {
    errors.push(`Teacher email is invalid (${rowObj.teacherEmail}).`);
  }
  return { valid: errors.length === 0, errors: errors };
}

function assertBatchRowLimit_(nonEmptyRowCount) {
  if (nonEmptyRowCount > COURSE_BATCH_CONFIG.MAX_ROWS) {
    throw new Error(`Upload exceeds row limit (${COURSE_BATCH_CONFIG.MAX_ROWS}).`);
  }
}

function getAllActiveCourses_() {
  const allCourses = [];
  let pageToken = null;
  do {
    const response = Classroom.Courses.list({
      courseStates: ["ACTIVE"],
      pageSize: 100,
      pageToken: pageToken
    });
    allCourses.push.apply(allCourses, response.courses || []);
    pageToken = response.nextPageToken;
  } while (pageToken);
  return allCourses;
}

function getActiveCourseKeySet_() {
  const keySet = new Set();
  const courses = getAllActiveCourses_();
  courses.forEach(course => {
    keySet.add(buildCourseKey_(course.name || "", course.section || ""));
  });
  return keySet;
}

function buildCourseKey_(name, section) {
  return `${normalizeCourseKeyPart_(name)}::${normalizeCourseKeyPart_(section)}`;
}

function normalizeCourseKeyPart_(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function ensureCourseSheet_() {
  const ss = getDBSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_COURSES);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_COURSES);
    sheet.appendRow(["Course ID", "Name", "Section", "Owner", "Assigned Teacher", "Created At"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendCourseRecordsToSheet_(records) {
  if (!records || records.length === 0) return;
  const sheet = ensureCourseSheet_();
  const values = records.map(record => ([
    record.courseId,
    record.name,
    record.section || "",
    record.ownerId || "me",
    record.teacherEmail || "",
    record.createdAt || new Date()
  ]));
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
}

function normalizeHeader_(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getRowValue_(row, index) {
  if (index === undefined || index === null) return "";
  return String((row && row[index]) || "").trim();
}

function isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function escapeDelimitedValue_(value, delimiter) {
  const text = String(value || "");
  if (text.indexOf('"') !== -1 || text.indexOf("\n") !== -1 || text.indexOf("\r") !== -1 || text.indexOf(delimiter) !== -1) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function safeJsonParse_(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

function extractOuterContentId_(headerText) {
  const match = /Content-ID:\s*<?([^>\n]+)>?/i.exec(String(headerText || ""));
  return match ? match[1].trim() : "";
}

function normalizeBatchContentId_(value) {
  if (!value) return "";
  return String(value).replace(/^response-/, "").trim();
}

function getHeaderValueIgnoreCase_(headers, key) {
  const target = String(key || "").toLowerCase();
  for (const headerName in headers) {
    if (headerName.toLowerCase() === target) {
      const headerValue = headers[headerName];
      if (Array.isArray(headerValue)) return headerValue.join("; ");
      return String(headerValue);
    }
  }
  return "";
}

function extractApiErrorMessage_(body, fallback) {
  if (body && body.error) {
    if (typeof body.error === "string") return body.error;
    if (body.error.message) return body.error.message;
  }
  if (body && body.message) return body.message;
  if (fallback) return String(fallback).substring(0, 500);
  return "Unknown error.";
}

function buildBatchCreateLogDetail_(result) {
  const summary = result && result.summary ? result.summary : {};
  const base = `Rows: ${summary.totalRows || 0}, Created: ${summary.created || 0}, Partial: ${summary.partial || 0}, Skipped: ${summary.skipped || 0}, Errors: ${summary.errors || 0}`;
  const partialRows = (result && result.created ? result.created : []).filter(item => item.teacherStatus === "FAILED");
  if (partialRows.length === 0) {
    return base;
  }

  const details = partialRows.slice(0, 10).map(item => {
    const reason = item.teacherError || "Unknown teacher assignment error";
    return `row ${item.rowNumber} (courseId=${item.courseId}, teacher=${item.teacherEmail}): ${reason}`;
  }).join(" | ");

  const extraCount = partialRows.length > 10 ? ` (+${partialRows.length - 10} more)` : "";
  return truncateLogDetail_(`${base}; Partial details: ${details}${extraCount}`, 3500);
}

function truncateLogDetail_(text, maxLength) {
  const value = String(text || "");
  const limit = Number(maxLength) || 3500;
  if (value.length <= limit) return value;
  return value.substring(0, limit - 3) + "...";
}

/* =========================================
   FEATURE 2: GROUP & MEMBER MANAGEMENT (Admin SDK Directory API)
   ========================================= */

/**
 * Lists all Google Workspace groups in the current customer.
 * Directory API requires either customer or domain in list requests.
 */
function getWorkspaceGroups() {
  try {
    const groups = [];
    let pageToken = null;

    do {
      const response = AdminDirectory.Groups.list({
        customer: "my_customer",
        maxResults: 200,
        pageToken: pageToken
      });

      (response.groups || []).forEach(group => {
        groups.push({
          id: group.id || "",
          email: normalizeGroupEmail_(group.email),
          name: group.name || "",
          description: group.description || "",
          directMembersCount: Number(group.directMembersCount || 0)
        });
      });

      pageToken = response.nextPageToken;
    } while (pageToken);

    groups.sort(function(a, b) {
      return a.email.localeCompare(b.email);
    });

    return groups;
  } catch (e) {
    logSystemAction_("LIST_GROUPS", "my_customer", "FAILED", extractErrorReasonFromException_(e));
    throw new Error("Failed to list groups: " + extractErrorReasonFromException_(e));
  }
}

/**
 * Returns a sample CSV/TSV template for bulk Google Group creation.
 */
function getGroupBatchTemplate(format) {
  const normalizedFormat = String(format || "csv").toLowerCase() === "tsv" ? "tsv" : "csv";
  const delimiter = normalizedFormat === "tsv" ? "\t" : ",";
  const mimeType = normalizedFormat === "tsv" ? "text/tab-separated-values" : "text/csv";

  const templateRows = [
    GROUP_BATCH_CONFIG.TEMPLATE_HEADERS,
    ["teachers-math@example.edu", "Math Teachers", "Teachers for Math Department"],
    ["grade6-homeroom@example.edu", "Grade 6 Homeroom", "Homeroom communication group for grade 6"]
  ];

  const content = templateRows
    .map(row => row.map(cell => escapeDelimitedValue_(cell, delimiter)).join(delimiter))
    .join("\n");

  return {
    filename: "workspace-group-batch-template." + normalizedFormat,
    mimeType: mimeType,
    content: content
  };
}

/**
 * Creates Google Workspace groups in bulk from CSV/TSV uploads.
 */
function processBatchGroupUpload(fileName, fileContent) {
  const jobId = Utilities.getUuid();
  const auditLogs = [];

  try {
    if (!fileContent || !String(fileContent).trim()) {
      throw new Error("Upload file is empty.");
    }

    const delimiter = detectBatchDelimiter_(fileName, fileContent);
    const rows = parseDelimitedRows_(fileContent, delimiter);
    if (rows.length < 2) {
      throw new Error("File must include headers and at least one data row.");
    }

    const headerMap = mapGroupBatchHeaderIndexes_(rows[0]);
    const existingGroupEmails = getExistingGroupEmailSet_();
    const seenUploadEmails = new Set();
    const skipped = [];
    const candidates = [];
    const errors = [];
    const created = [];
    let nonEmptyRowCount = 0;

    for (let i = 1; i < rows.length; i++) {
      const rowNumber = i + 1;
      const rowObj = normalizeBatchGroupRow_(rows[i], headerMap);
      if (isBatchGroupRowEmpty_(rowObj)) continue;

      nonEmptyRowCount++;
      const validation = validateBatchGroupRow_(rowObj);
      if (!validation.valid) {
        const reason = validation.errors.join(" ");
        skipped.push({ rowNumber: rowNumber, reason: reason });
        auditLogs.push({
          jobId: jobId,
          action: "BATCH_CREATE_GROUPS",
          stage: "VALIDATE_ROW",
          rowNumber: rowNumber,
          groupEmail: rowObj.email,
          memberEmail: "",
          role: "",
          status: "SKIPPED",
          statusCode: 0,
          message: reason,
          meta: { sourceFile: fileName || "upload" }
        });
        continue;
      }

      const normalizedEmail = normalizeGroupEmail_(rowObj.email);
      if (existingGroupEmails.has(normalizedEmail)) {
        const reason = "Skipped duplicate existing group email.";
        skipped.push({ rowNumber: rowNumber, reason: reason });
        auditLogs.push({
          jobId: jobId,
          action: "BATCH_CREATE_GROUPS",
          stage: "DEDUPE_EXISTING",
          rowNumber: rowNumber,
          groupEmail: normalizedEmail,
          memberEmail: "",
          role: "",
          status: "SKIPPED",
          statusCode: 0,
          message: reason,
          meta: { sourceFile: fileName || "upload" }
        });
        continue;
      }

      if (seenUploadEmails.has(normalizedEmail)) {
        const reason = "Skipped duplicate group email in upload file.";
        skipped.push({ rowNumber: rowNumber, reason: reason });
        auditLogs.push({
          jobId: jobId,
          action: "BATCH_CREATE_GROUPS",
          stage: "DEDUPE_UPLOAD",
          rowNumber: rowNumber,
          groupEmail: normalizedEmail,
          memberEmail: "",
          role: "",
          status: "SKIPPED",
          statusCode: 0,
          message: reason,
          meta: { sourceFile: fileName || "upload" }
        });
        continue;
      }

      seenUploadEmails.add(normalizedEmail);
      candidates.push({
        rowNumber: rowNumber,
        email: normalizedEmail,
        name: rowObj.name,
        description: rowObj.description
      });
    }

    assertGroupBatchRowLimit_(nonEmptyRowCount);
    if (nonEmptyRowCount === 0) {
      throw new Error("No non-empty rows found in upload file.");
    }

    candidates.forEach(candidate => {
      const payload = { email: candidate.email };
      if (candidate.name) payload.name = candidate.name;
      if (candidate.description) payload.description = candidate.description;

      try {
        const response = AdminDirectory.Groups.insert(payload);
        created.push({
          rowNumber: candidate.rowNumber,
          groupId: response.id || "",
          email: normalizeGroupEmail_(response.email || candidate.email),
          name: response.name || candidate.name || "",
          description: response.description || candidate.description || ""
        });
        existingGroupEmails.add(candidate.email);

        auditLogs.push({
          jobId: jobId,
          action: "BATCH_CREATE_GROUPS",
          stage: "CREATE_GROUP",
          rowNumber: candidate.rowNumber,
          groupEmail: candidate.email,
          memberEmail: "",
          role: "",
          status: "SUCCESS",
          statusCode: 200,
          message: "Group created.",
          meta: {
            sourceFile: fileName || "upload",
            groupId: response.id || "",
            groupName: response.name || candidate.name || ""
          }
        });
      } catch (e) {
        const message = extractErrorReasonFromException_(e);
        const statusCode = parseStatusCodeFromError_(e);
        errors.push({
          rowNumber: candidate.rowNumber,
          stage: "CREATE_GROUP",
          statusCode: statusCode,
          message: message
        });

        auditLogs.push({
          jobId: jobId,
          action: "BATCH_CREATE_GROUPS",
          stage: "CREATE_GROUP",
          rowNumber: candidate.rowNumber,
          groupEmail: candidate.email,
          memberEmail: "",
          role: "",
          status: "FAILED",
          statusCode: statusCode,
          message: message,
          meta: { sourceFile: fileName || "upload", payload: payload }
        });
      }
    });

    appendGroupAuditLogs_(auditLogs);

    const result = {
      jobId: jobId,
      fileName: fileName || "upload",
      delimiter: delimiter === "\t" ? "TSV" : "CSV",
      rowLimit: GROUP_BATCH_CONFIG.MAX_ROWS,
      summary: {
        totalRows: nonEmptyRowCount,
        attemptedRows: candidates.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length
      },
      created: created,
      skipped: skipped,
      errors: errors
    };

    const status = errors.length === 0 ? "SUCCESS" : (created.length > 0 ? "PARTIAL" : "FAILED");
    logSystemAction_("BATCH_CREATE_GROUPS", result.fileName, status, buildGroupBatchCreateLogDetail_(result));

    return result;
  } catch (e) {
    logSystemAction_(
      "BATCH_CREATE_GROUPS",
      fileName || "upload",
      "FAILED",
      truncateLogDetail_("Job " + jobId + ": " + extractErrorReasonFromException_(e), 3500)
    );
    throw e;
  }
}

/**
 * Adds selected users to one or many groups with role control.
 * Role values follow Directory API docs: MEMBER, MANAGER, OWNER.
 */
function assignMembersToGroups(payload) {
  const request = payload || {};
  const jobId = Utilities.getUuid();
  const auditLogs = [];

  try {
    const groupEmails = Array.from(new Set((request.groupEmails || [])
      .map(normalizeGroupEmail_)
      .filter(Boolean)));
    const memberEmails = Array.from(new Set((request.memberEmails || [])
      .map(email => String(email || "").trim().toLowerCase())
      .filter(Boolean)));
    const sourceOu = String(request.sourceOu || "");
    const role = normalizeGroupMemberRole_(request.role || "MEMBER");

    if (groupEmails.length === 0) {
      throw new Error("At least one target group must be selected.");
    }
    if (memberEmails.length === 0) {
      throw new Error("At least one user account must be selected.");
    }

    const added = [];
    const skipped = [];
    const errors = [];

    groupEmails.forEach(groupEmail => {
      memberEmails.forEach(memberEmail => {
        const outcome = runGroupMemberInsertWithRetry_(groupEmail, memberEmail, role);
        const baseMeta = {
          sourceOu: sourceOu || "",
          retryAttempts: outcome.attempts
        };

        if (outcome.status === "ADDED") {
          added.push({
            groupEmail: groupEmail,
            memberEmail: memberEmail,
            role: role
          });
        } else if (outcome.status === "SKIPPED") {
          skipped.push({
            groupEmail: groupEmail,
            memberEmail: memberEmail,
            role: role,
            reason: outcome.message
          });
        } else {
          errors.push({
            groupEmail: groupEmail,
            memberEmail: memberEmail,
            role: role,
            statusCode: outcome.statusCode,
            message: outcome.message
          });
        }

        auditLogs.push({
          jobId: jobId,
          action: "ASSIGN_GROUP_MEMBERS",
          stage: "ADD_MEMBER",
          rowNumber: "",
          groupEmail: groupEmail,
          memberEmail: memberEmail,
          role: role,
          status: outcome.status === "ADDED" ? "SUCCESS" : outcome.status,
          statusCode: outcome.statusCode,
          message: outcome.message,
          meta: baseMeta
        });
      });
    });

    appendGroupAuditLogs_(auditLogs);

    const result = {
      jobId: jobId,
      sourceOu: sourceOu || "",
      role: role,
      summary: {
        totalAssignments: groupEmails.length * memberEmails.length,
        targetGroups: groupEmails.length,
        selectedMembers: memberEmails.length,
        added: added.length,
        skipped: skipped.length,
        errors: errors.length
      },
      added: added,
      skipped: skipped,
      errors: errors
    };

    const status = errors.length === 0 ? "SUCCESS" : (added.length > 0 || skipped.length > 0 ? "PARTIAL" : "FAILED");
    const logTarget = sourceOu ? sourceOu : "manual-selection";
    logSystemAction_("ASSIGN_GROUP_MEMBERS", logTarget, status, buildGroupMemberAssignLogDetail_(result));
    return result;
  } catch (e) {
    logSystemAction_(
      "ASSIGN_GROUP_MEMBERS",
      String(request.sourceOu || "manual-selection"),
      "FAILED",
      truncateLogDetail_("Job " + jobId + ": " + extractErrorReasonFromException_(e), 3500)
    );
    throw e;
  }
}

function runGroupMemberInsertWithRetry_(groupEmail, memberEmail, role) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      AdminDirectory.Members.insert({ email: memberEmail, role: role }, groupEmail);
      return {
        status: "ADDED",
        statusCode: 200,
        message: "Member added.",
        attempts: attempt
      };
    } catch (e) {
      const message = extractErrorReasonFromException_(e);
      const statusCode = parseStatusCodeFromError_(e);

      if (isMemberAlreadyExistsError_(message)) {
        return {
          status: "SKIPPED",
          statusCode: statusCode || 409,
          message: "Member already exists in group.",
          attempts: attempt
        };
      }

      if (isTransientGroupPropagationError_(message) && attempt < maxAttempts) {
        Utilities.sleep(3000 * attempt);
        continue;
      }

      const finalMessage = isTransientGroupPropagationError_(message)
        ? truncateLogDetail_(message + " Group may still be propagating. Wait at least 1 minute and retry.", 500)
        : message;

      return {
        status: "FAILED",
        statusCode: statusCode,
        message: finalMessage,
        attempts: attempt
      };
    }
  }

  return {
    status: "FAILED",
    statusCode: 0,
    message: "Unexpected member insert retry termination.",
    attempts: maxAttempts
  };
}

function mapGroupBatchHeaderIndexes_(headerRow) {
  const map = {};
  (headerRow || []).forEach((header, index) => {
    const normalized = normalizeHeader_(header);
    const canonicalField = GROUP_BATCH_HEADER_ALIAS_LOOKUP[normalized];
    if (canonicalField && map[canonicalField] === undefined) {
      map[canonicalField] = index;
    }
  });

  const missing = GROUP_BATCH_REQUIRED_FIELDS.filter(field => map[field] === undefined);
  if (missing.length > 0) {
    throw new Error("Missing required headers: " + missing.join(", ") + ".");
  }
  return map;
}

function normalizeBatchGroupRow_(rawRow, headerMap) {
  return {
    email: normalizeGroupEmail_(getRowValue_(rawRow, headerMap.email)),
    name: getRowValue_(rawRow, headerMap.name),
    description: getRowValue_(rawRow, headerMap.description)
  };
}

function isBatchGroupRowEmpty_(rowObj) {
  return !rowObj.email && !rowObj.name && !rowObj.description;
}

function validateBatchGroupRow_(rowObj) {
  const errors = [];
  if (!rowObj.email) {
    errors.push("Group email is required.");
  } else if (!isValidEmail_(rowObj.email)) {
    errors.push("Group email is invalid (" + rowObj.email + ").");
  }
  return { valid: errors.length === 0, errors: errors };
}

function assertGroupBatchRowLimit_(nonEmptyRowCount) {
  if (nonEmptyRowCount > GROUP_BATCH_CONFIG.MAX_ROWS) {
    throw new Error("Upload exceeds row limit (" + GROUP_BATCH_CONFIG.MAX_ROWS + ").");
  }
}

function getExistingGroupEmailSet_() {
  const set = new Set();
  getWorkspaceGroups().forEach(group => {
    const email = normalizeGroupEmail_(group.email);
    if (email) set.add(email);
  });
  return set;
}

function normalizeGroupEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeGroupMemberRole_(role) {
  const normalized = String(role || "MEMBER").trim().toUpperCase();
  if (GROUP_MEMBER_ALLOWED_ROLES.indexOf(normalized) === -1) {
    throw new Error("Invalid group member role: " + normalized + ". Allowed: " + GROUP_MEMBER_ALLOWED_ROLES.join(", "));
  }
  return normalized;
}

function isMemberAlreadyExistsError_(message) {
  const text = String(message || "").toLowerCase();
  return text.indexOf("member already exists") !== -1 ||
    text.indexOf("duplicate") !== -1 ||
    text.indexOf("already a member") !== -1 ||
    text.indexOf("conflict") !== -1;
}

function isTransientGroupPropagationError_(message) {
  const text = String(message || "").toLowerCase();
  return text.indexOf("resource not found") !== -1 ||
    text.indexOf("not found") !== -1 ||
    text.indexOf("group does not exist") !== -1;
}

function parseStatusCodeFromError_(error) {
  const text = getExceptionMessage_(error);
  const match = /\b([45]\d{2})\b/.exec(text);
  return match ? Number(match[1]) : 0;
}

function extractErrorReasonFromException_(error) {
  const text = getExceptionMessage_(error);
  const parsed = safeJsonParse_(text);
  const parsedMessage = extractApiErrorMessage_(parsed, "");
  if (parsedMessage) return parsedMessage;

  const marker = "with error:";
  const markerIndex = text.toLowerCase().indexOf(marker);
  if (markerIndex !== -1) {
    return text.substring(markerIndex + marker.length).trim();
  }
  return text;
}

function buildGroupBatchCreateLogDetail_(result) {
  const summary = result && result.summary ? result.summary : {};
  const jobId = result && result.jobId ? result.jobId : "N/A";
  const base = "Job " + jobId +
    " | Rows: " + (summary.totalRows || 0) +
    ", Attempted: " + (summary.attemptedRows || 0) +
    ", Created: " + (summary.created || 0) +
    ", Skipped: " + (summary.skipped || 0) +
    ", Errors: " + (summary.errors || 0);

  if (!result || !result.errors || result.errors.length === 0) return base;

  const preview = result.errors.slice(0, 5).map(item => {
    return "row " + item.rowNumber + ": " + item.message;
  }).join(" | ");
  const extra = result.errors.length > 5 ? " (+" + (result.errors.length - 5) + " more)" : "";
  return truncateLogDetail_(base + "; Error preview: " + preview + extra, 3500);
}

function buildGroupMemberAssignLogDetail_(result) {
  const summary = result && result.summary ? result.summary : {};
  const jobId = result && result.jobId ? result.jobId : "N/A";
  const base = "Job " + jobId +
    " | Groups: " + (summary.targetGroups || 0) +
    ", Members: " + (summary.selectedMembers || 0) +
    ", Total assignments: " + (summary.totalAssignments || 0) +
    ", Added: " + (summary.added || 0) +
    ", Skipped: " + (summary.skipped || 0) +
    ", Errors: " + (summary.errors || 0);

  if (!result || !result.errors || result.errors.length === 0) return base;

  const preview = result.errors.slice(0, 5).map(item => {
    return item.groupEmail + " <- " + item.memberEmail + ": " + item.message;
  }).join(" | ");
  const extra = result.errors.length > 5 ? " (+" + (result.errors.length - 5) + " more)" : "";
  return truncateLogDetail_(base + "; Error preview: " + preview + extra, 3500);
}

function ensureGroupAuditSheet_() {
  const ss = getDBSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_GROUP_AUDIT);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_GROUP_AUDIT);
    sheet.appendRow([
      "Timestamp (UTC+8)",
      "Job ID",
      "Action",
      "Stage",
      "Row Number",
      "Group Email",
      "Member Email",
      "Role",
      "Status",
      "Status Code",
      "Message",
      "Meta",
      "Version"
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendGroupAuditLogs_(logs) {
  if (!logs || logs.length === 0) return;

  const sheet = ensureGroupAuditSheet_();
  const values = logs.map(log => {
    return [
      log.timestamp || Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, "yyyy-MM-dd HH:mm:ss"),
      log.jobId || "",
      log.action || "",
      log.stage || "",
      log.rowNumber || "",
      log.groupEmail || "",
      log.memberEmail || "",
      log.role || "",
      log.status || "",
      log.statusCode || "",
      truncateLogDetail_(log.message || "", 1000),
      truncateLogDetail_(safeStringify_(log.meta), 1000),
      APP_VERSION
    ];
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);

  if (sheet.getLastRow() > 5000) {
    sheet.deleteRows(2, sheet.getLastRow() - 5000);
  }
}

function safeStringify_(value) {
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

/* =========================================
   FEATURE 3: USER MANAGEMENT (Admin SDK)
   ========================================= */

function getDomainOUs() {
  try {
    const response = AdminDirectory.Orgunits.list('my_customer', { type: 'all' });
    return (response.organizationUnits || []).map(ou => ou.orgUnitPath).sort();
  } catch (e) { 
    throw new Error("Failed to fetch OUs: " + e.message); 
  }
}

/**
 * Filter users by OU and Login Date condition.
 */
/**
 * Converts a Traditional-Chinese numeral string (e.g. "三", "十", "十二", "二十")
 * to an integer. Returns NaN when any character is not a recognized numeral.
 * Handles values up to 99, which covers class/grade numbering.
 */
function chineseNumeralToInt_(s) {
  const DIGITS = { "零": 0, "〇": 0, "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  if (!s) return NaN;
  if (s.indexOf("十") !== -1) {
    const parts = s.split("十");
    const tensChar = parts[0];
    const onesChar = parts[1];
    const tens = tensChar === "" ? 1 : DIGITS[tensChar];
    const ones = onesChar === "" || onesChar === undefined ? 0 : DIGITS[onesChar];
    if (tens === undefined || ones === undefined) return NaN;
    return tens * 10 + ones;
  }
  let result = 0;
  for (const ch of s) {
    if (DIGITS[ch] === undefined) return NaN;
    result = result * 10 + DIGITS[ch];
  }
  return result;
}

/**
 * Builds a natural-sort key for a user display name so that lists ordered by
 * account/class name (e.g. "2年一班01號…", "2年二班01號…") sort in human order.
 * Numeric runs — both Arabic ("11") and Chinese-numeral ("二", "十二") — are
 * normalized to zero-padded width so lexical comparison matches numeric order.
 */
function buildUserSortKey_(name) {
  if (!name) return "";
  const CN_NUMERALS = "零〇一二兩三四五六七八九十";
  const PAD_WIDTH = 6;
  const padNum_ = function (n) { return ("000000" + n).slice(-PAD_WIDTH); };
  const s = String(name);
  let key = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch >= "0" && ch <= "9") {
      let j = i;
      while (j < s.length && s[j] >= "0" && s[j] <= "9") j++;
      key += padNum_(parseInt(s.substring(i, j), 10));
      i = j;
    } else if (CN_NUMERALS.indexOf(ch) !== -1) {
      let j = i;
      while (j < s.length && CN_NUMERALS.indexOf(s[j]) !== -1) j++;
      const segment = s.substring(i, j);
      const num = chineseNumeralToInt_(segment);
      key += isNaN(num) ? segment : padNum_(num);
      i = j;
    } else {
      key += ch;
      i++;
    }
  }
  return key;
}

function getFilteredUsers(ouPath, dateCondition, specificDate) {
  let allUsers = [];
  let pageToken = null;
  const cutoffDate = (dateCondition === "BEFORE_DATE" && specificDate) ? new Date(specificDate) : null;

  try {
    do {
      let queryParts = [];
      if (ouPath && ouPath !== "ALL") queryParts.push("orgUnitPath='" + ouPath + "'");
      const queryString = queryParts.join(" ");

      const options = {
        customer: 'my_customer',
        maxResults: 500,
        pageToken: pageToken,
        viewType: 'admin_view'
      };
      if (queryString) options.query = queryString;

      const response = AdminDirectory.Users.list(options);
      const users = response.users || [];

      users.forEach(user => {
        const lastLogin = user.lastLoginTime ? new Date(user.lastLoginTime) : null;
        let match = false;

        if (dateCondition === "NEVER_LOGIN") {
          if (!lastLogin || user.lastLoginTime === "0") match = true;
        } else if (dateCondition === "BEFORE_DATE" && cutoffDate) {
          if (lastLogin && lastLogin < cutoffDate) match = true;
        } else {
          match = true;
        }

        if (match) {
          allUsers.push({
            name: (user.name && user.name.fullName) || user.primaryEmail,
            email: user.primaryEmail,
            lastLogin: lastLogin ? Utilities.formatDate(lastLogin, CONFIG.TIME_ZONE, "yyyy-MM-dd HH:mm") : "Never Logged In",
            suspended: user.suspended,
            org: user.orgUnitPath
          });
        }
      });
      pageToken = response.nextPageToken;
    } while (pageToken);

    // Sort by account/class name in human (natural) order so the UI list reads
    // "…一班01號", "…一班02號", … "…二班01號" rather than API/email order.
    allUsers.sort(function (a, b) {
      return buildUserSortKey_(a.name).localeCompare(buildUserSortKey_(b.name), "zh-Hant");
    });

    return allUsers;
  } catch (e) { 
    throw new Error("User API Error: " + e.message); 
  }
}

function moveUsersToOU(emails, targetOU) {
  let count = 0;
  let errors = [];
  emails.forEach(email => {
    try { 
      AdminDirectory.Users.update({ orgUnitPath: targetOU }, email); 
      count++;
    } catch (err) { errors.push(email); }
  });
  logSystemAction_("MOVE_USERS", targetOU, "COMPLETE", `Moved: ${count}`);
  return { message: `Moved ${count} users.`, errors: errors };
}

/* =========================================
   FEATURE 4: LIFECYCLE AUTOMATION
   ========================================= */

function installTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => { if (t.getHandlerFunction() === 'checkDeletionQueue') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('checkDeletionQueue').timeBased().atHour(1).everyDays(1).create();
    return "Daily deletion trigger installed.";
  } catch (e) { throw new Error("Auth failed: " + e.message); }
}

function processUserSuspension(emails) {
  if (!emails || emails.length === 0) return "No users selected.";
  const ss = getDBSpreadsheet_();
  let logSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ACTIONS);
  if (!logSheet) {
    logSheet = ss.insertSheet(CONFIG.SHEET_NAME_ACTIONS);
    logSheet.appendRow(["Action Timestamp", "User Email", "Status", "Scheduled Deletion Date", "Version"]);
  }
  const deletionDate = new Date();
  deletionDate.setMonth(deletionDate.getMonth() + 3);
  const formattedDeletionDate = Utilities.formatDate(deletionDate, CONFIG.TIME_ZONE, "yyyy-MM-dd");
  let count = 0;
  emails.forEach(email => {
    try {
      AdminDirectory.Users.update({ suspended: true }, email);
      logSheet.appendRow([new Date(), email, "Suspended", formattedDeletionDate, APP_VERSION]);
      count++;
    } catch (err) {}
  });
  logSystemAction_("SUSPEND_BATCH", "Batch", "SUCCESS", `Suspended ${count} users.`);
  return `Suspended ${count} users. Deletion scheduled: ${formattedDeletionDate}.`;
}

function syncSuspendedToQueue() {
  const ss = getDBSpreadsheet_();
  let logSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ACTIONS);
  if (!logSheet) {
    logSheet = ss.insertSheet(CONFIG.SHEET_NAME_ACTIONS);
    logSheet.appendRow(["Action Timestamp", "User Email", "Status", "Scheduled Deletion Date", "Version"]);
  }
  const existingEmails = logSheet.getDataRange().getValues().slice(1).map(row => row[1]);
  const deletionDate = new Date(); deletionDate.setMonth(deletionDate.getMonth() + 3);
  const formattedDeletionDate = Utilities.formatDate(deletionDate, CONFIG.TIME_ZONE, "yyyy-MM-dd");
  let syncedCount = 0;
  let pageToken = null;
  do {
    const response = AdminDirectory.Users.list({ customer: 'my_customer', query: "isSuspended=true", maxResults: 500, pageToken: pageToken });
    (response.users || []).forEach(user => {
      if (!existingEmails.includes(user.primaryEmail)) {
        logSheet.appendRow([new Date(), user.primaryEmail, "Suspended", formattedDeletionDate, "Sync-" + APP_VERSION]);
        syncedCount++;
      }
    });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return `Added ${syncedCount} suspended accounts to queue.`;
}

function checkDeletionQueue() {
  const ss = getDBSpreadsheet_();
  const logSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ACTIONS);
  if (!logSheet) return "No logs.";
  const data = logSheet.getDataRange().getValues();
  if (data.length <= 1) return "Empty.";
  const today = new Date(); today.setHours(0,0,0,0);
  let deletedCount = 0;
  let updatedRows = [data[0]];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = row[1];
    const status = row[2];
    const scheduledDate = new Date(row[3]);
    if (status === "Suspended" && scheduledDate <= today) {
      try {
        AdminDirectory.Users.remove(email);
        row[2] = "Deleted (Auto)"; row[0] = new Date(); deletedCount++;
      } catch (e) {
        if (e.message.includes("notFound")) row[2] = "Deleted (Already Gone)";
      }
    }
    updatedRows.push(row);
  }
  logSheet.getRange(1, 1, updatedRows.length, updatedRows[0].length).setValues(updatedRows);
  return `Deleted ${deletedCount} accounts.`;
}

/* =========================================
   FEATURE 5: DRIVE AUDIT (Drive API v3)
   ========================================= */

/**
 * Finds files older than a specific date. Supports All Drives.
 * Paginates past the 100-item limit and recursively scans inside every
 * discovered folder (BFS) so nested files are never missed.
 * Results are persisted to Drive_Audit_Logs sheet.
 * @param {string} dateString - YYYY-MM-DD cutoff
 */
function findOutdatedFiles(dateString) {
  try {
    if (!dateString) throw new Error("Date string is required (YYYY-MM-DD).");
    const cutoff = `${dateString}T00:00:00Z`;
    const FOLDER_MIME = "application/vnd.google-apps.folder";
    const MAX_TOTAL = 500;       // items returned to UI and written to log
    const MAX_BFS_ITEMS = 2000;  // internal ceiling during BFS expansion
    const BFS_PAGE_SIZE = 100;   // children fetched per folder per API call

    // 1. Global paginated search across all drives
    const allItems = fetchDriveFilesWithPagination_(
      `modifiedTime < '${cutoff}' and trashed = false`,
      MAX_TOTAL
    );

    // 1b. Domain-wide shared drive sweep (Option A). corpora='allDrives' only
    //     covers shared drives the admin is a MEMBER of; useDomainAdminAccess
    //     exposes every shared drive in the domain. Time-budgeted because a
    //     domain with many shared drives would otherwise blow the 6-min limit.
    const sharedDriveScan = { scanned: 0, total: 0, truncated: false };
    const knownIds = new Set(allItems.map(f => f.id));
    const domainDrives = listDomainSharedDrives_();
    sharedDriveScan.total = domainDrives.length;
    const scanDeadline = new Date().getTime() + DRIVE_ESCALATION_CONFIG.SHARED_DRIVE_SCAN_BUDGET_MS;

    for (const drive of domainDrives) {
      if (new Date().getTime() > scanDeadline) {
        sharedDriveScan.truncated = true;
        break;
      }
      sharedDriveScan.scanned++;
      let driveItems = [];
      try {
        driveItems = fetchDriveFilesWithPagination_(
          `modifiedTime < '${cutoff}' and trashed = false`,
          BFS_PAGE_SIZE,
          drive.id
        );
      } catch (e) {
        console.error(`Shared drive scan failed for ${drive.id}`, e);
        continue;
      }
      driveItems.forEach(item => {
        if (!knownIds.has(item.id)) {
          knownIds.add(item.id);
          allItems.push(item);
        }
      });
    }

    // 2. BFS — always runs on every discovered folder regardless of how many items
    //    the initial search already found. BFS expands up to MAX_BFS_ITEMS total
    //    so it cannot be starved when the initial search fills MAX_TOTAL.
    //    No date filter on children: an old folder may contain recently added files.
    const seenIds = new Set(allItems.map(f => f.id));
    const folderQueue = allItems.filter(f => f.mimeType === FOLDER_MIME);

    while (folderQueue.length > 0 && allItems.length < MAX_BFS_ITEMS) {
      const folder = folderQueue.shift();
      const children = fetchDriveFilesWithPagination_(
        `'${folder.id}' in parents and trashed = false`,
        BFS_PAGE_SIZE,
        folder.driveId || null
      );
      for (const child of children) {
        if (!seenIds.has(child.id)) {
          seenIds.add(child.id);
          allItems.push(child);
          if (child.mimeType === FOLDER_MIME) {
            folderQueue.push(child);
          }
        }
      }
    }

    // 3. Sort: largest first, then oldest
    allItems.sort((a, b) => {
      const sizeDiff = Number(b.quotaBytesUsed || 0) - Number(a.quotaBytesUsed || 0);
      if (sizeDiff !== 0) return sizeDiff;
      return new Date(a.modifiedTime) - new Date(b.modifiedTime);
    });

    // 4. Take top MAX_TOTAL after sort so log and UI always receive the largest files
    const resultItems = allItems.slice(0, MAX_TOTAL);

    // 5. Persist audit snapshot to spreadsheet
    appendDriveAuditLog_(resultItems, dateString);

    // Cap visibility: never let a truncated sweep look like full coverage.
    const scanNote = sharedDriveScan.total > 0
      ? ` Domain shared drives scanned: ${sharedDriveScan.scanned}/${sharedDriveScan.total}${sharedDriveScan.truncated ? " (TRUNCATED — time budget reached)" : ""}.`
      : "";
    logSystemAction_("AUDIT_DRIVE", "Drive", sharedDriveScan.truncated ? "PARTIAL" : "SUCCESS",
      `Found ${allItems.length} items (showing top ${resultItems.length}, cutoff: ${dateString}). Saved to ${CONFIG.SHEET_NAME_DRIVE_AUDIT}.${scanNote}`);

    // 6. Map to UI format (shape unchanged — no frontend changes required)
    return resultItems.map(f => ({
      id: f.id,
      name: f.name,
      link: f.webViewLink,
      owner: (f.owners && f.owners.length > 0) ? f.owners[0].emailAddress : "Shared Drive",
      modified: Utilities.formatDate(new Date(f.modifiedTime), CONFIG.TIME_ZONE, "yyyy-MM-dd"),
      size: (Number(f.size || f.quotaBytesUsed || 0) / 1024 / 1024).toFixed(2) + " MB",
      isFolder: f.mimeType === FOLDER_MIME
    }));
  } catch (e) {
    logSystemAction_("AUDIT_DRIVE", "Drive", "ERROR", e.message);
    throw e;
  }
}

/**
 * Paginated Drive.Files.list wrapper. Follows nextPageToken until maxItems reached.
 * orderBy omitted — not supported with corpora='allDrives'.
 */
function fetchDriveFilesWithPagination_(query, maxItems, sharedDriveId) {
  const results = [];
  let pageToken = null;
  do {
    const params = {
      q: query,
      pageSize: 100,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: "nextPageToken,files(id,name,webViewLink,owners(emailAddress),modifiedTime,size,quotaBytesUsed,mimeType,driveId)"
    };
    if (sharedDriveId) {
      params.corpora = 'drive';
      params.driveId = sharedDriveId;
    } else {
      params.corpora = 'allDrives';
    }
    if (pageToken) params.pageToken = pageToken;
    const response = Drive.Files.list(params);
    results.push(...(response.files || []));
    pageToken = response.nextPageToken || null;
  } while (pageToken && results.length < maxItems);
  return results.slice(0, maxItems);
}

/**
 * Appends one row per file to Drive_Audit_Logs sheet.
 * Owner column stores the full Gmail address (e.g. abc@workspace.domain).
 */
function appendDriveAuditLog_(items, cutoffDate) {
  try {
    const ss = getDBSpreadsheet_();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_DRIVE_AUDIT);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAME_DRIVE_AUDIT);
      sheet.appendRow([
        "Timestamp (UTC+8)", "Cutoff Date", "File Name", "File ID",
        "Owner (Gmail)", "Modified Date", "Size (MB)", "Type", "Link"
      ]);
      sheet.setFrozenRows(1);
    }
    const timestamp = Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, "yyyy-MM-dd HH:mm:ss");
    const FOLDER_MIME = "application/vnd.google-apps.folder";
    const rows = items.map(f => [
      timestamp,
      cutoffDate,
      f.name,
      f.id,
      (f.owners && f.owners.length > 0) ? f.owners[0].emailAddress : "Shared Drive",
      Utilities.formatDate(new Date(f.modifiedTime), CONFIG.TIME_ZONE, "yyyy-MM-dd"),
      (Number(f.size || f.quotaBytesUsed || 0) / 1024 / 1024).toFixed(2),
      f.mimeType === FOLDER_MIME ? "Folder" : "File",
      f.webViewLink || ""
    ]);
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
  } catch (e) {
    console.error("Drive audit log write failed", e);
  }
}

/**
 * Batch deletes or archives (renames) files.
 * * Uses Drive API v3 (update)
 */
function manageFiles(fileIds, action) {
  const ids = Array.isArray(fileIds) ? fileIds.filter(id => id) : [];
  if (ids.length === 0) throw new Error("未選取任何檔案。");
  if (action !== 'delete' && action !== 'archive') {
    throw new Error(`不支援的操作：${action}`);
  }

  const tally = { deleted: 0, driveAdmin: 0, asOwner: 0, trashed: 0, alreadyGone: 0, noAccess: 0, archived: 0 };
  const errors = [];
  const notes = [];
  const escalation = action === 'delete' ? createDriveEscalationContext_() : null;

  try {
    ids.forEach(id => {
      try {
        if (action === 'delete') {
          let outcome = removeDriveFileWithCompatibility_(id);
          // Only a reader-only denial is worth escalating; every other mode is final.
          if (outcome.mode === "NO_ACCESS") {
            try {
              outcome = escalateDriveFileRemoval_(id, escalation);
            } catch (escalationError) {
              outcome = { mode: "NO_ACCESS", message: `提權刪除失敗：${getExceptionMessage_(escalationError)}` };
            }
          }

          if (outcome.mode === "DELETED_AS_DRIVE_ADMIN") {
            tally.driveAdmin++;
          } else if (outcome.mode === "DELETED_AS_OWNER") {
            tally.asOwner++;
          } else if (outcome.mode === "TRASHED") {
            tally.trashed++;
          } else if (outcome.mode === "ALREADY_GONE") {
            tally.alreadyGone++;
          } else if (outcome.mode === "NO_ACCESS") {
            tally.noAccess++;
          } else {
            tally.deleted++;
          }
          if (outcome.message && notes.indexOf(outcome.message) === -1) notes.push(outcome.message);
        } else {
          archiveDriveFileWithCompatibility_(id);
          tally.archived++;
        }
      } catch (e) {
        errors.push(`${id}: ${getExceptionMessage_(e)}`);
        console.error(`Error processing ${id}:`, e);
      }
    });
  } finally {
    // Always give back temporary shared-drive elevation, even if the loop threw.
    if (escalation) {
      releaseDriveEscalationContext_(escalation);
      escalation.notes.forEach(note => {
        if (notes.indexOf(note) === -1) notes.push(note);
      });
    }
  }

  const succeeded = action === 'delete'
    ? tally.deleted + tally.driveAdmin + tally.asOwner + tally.trashed + tally.alreadyGone
    : tally.archived;
  const blocked = errors.length + tally.noAccess;
  const status = blocked === 0 ? "SUCCESS" : (succeeded > 0 ? "PARTIAL" : "FAILED");

  const parts = action === 'delete'
    ? [
        `永久刪除 ${tally.deleted}`,
        `以雲端硬碟管理員刪除 ${tally.driveAdmin}`,
        `以擁有者身分刪除 ${tally.asOwner}`,
        `改移垃圾桶 ${tally.trashed}`,
        `已不存在 ${tally.alreadyGone}`,
        `權限不足略過 ${tally.noAccess}`,
        `失敗 ${errors.length}`
      ]
    : [`已封存 ${tally.archived}`, `失敗 ${errors.length}`];

  const headline = `${action === 'delete' ? '刪除' : '封存'} ${succeeded}/${ids.length} 個項目（${parts.join('、')}）。`;
  const noteText = notes.length > 0 ? ` 說明：${notes.join(' ')}` : "";
  const errorPreview = errors.length > 0 ? ` 錯誤：${errors.slice(0, 5).join(" | ")}` : "";

  logSystemAction_(
    "MANAGE_FILES",
    "Batch",
    status,
    truncateLogDetail_(`${headline}${noteText}${errorPreview}`, 3500)
  );

  const uiErrors = errors.length > 0 ? `\n失敗明細（前 3 筆）：\n${errors.slice(0, 3).join("\n")}` : "";
  return `${headline}${noteText ? `\n${noteText.trim()}` : ""}${uiErrors}`;
}

/**
 * Renames a file with the [ARCHIVED]_ prefix.
 * Advanced Drive v3 signature is update(resource, fileId, mediaData, optionalArgs) —
 * passing optionalArgs in the 3rd slot silently binds it to mediaData and drops
 * supportsAllDrives, which breaks Shared Drive items. Both signatures are probed.
 */
function archiveDriveFileWithCompatibility_(fileId, filesApi) {
  const api = filesApi || (Drive && Drive.Files ? Drive.Files : null);
  if (!api) throw new Error("Drive.Files API is unavailable.");

  const file = api.get(fileId, { supportsAllDrives: true, fields: "id,name" });
  const currentName = String((file && file.name) || "");
  if (currentName.indexOf("[ARCHIVED]_") === 0) return { mode: "ALREADY_ARCHIVED" };
  const resource = { name: `[ARCHIVED]_${currentName}` };

  try {
    api.update(resource, fileId, null, { supportsAllDrives: true, fields: "id,name" });
  } catch (e) {
    if (!isMethodSignatureError_(e)) throw e;
    api.update(resource, fileId, { supportsAllDrives: true, fields: "id,name" });
  }
  return { mode: "ARCHIVED" };
}

function removeDriveFileWithCompatibility_(fileId, filesApi) {
  const api = filesApi || (Drive && Drive.Files ? Drive.Files : null);
  if (!api) throw new Error("Drive.Files API is unavailable.");

  try {
    deleteDriveFilePermanently_(api, fileId);
    return { mode: "DELETED", message: "" };
  } catch (deleteError) {
    if (isDriveNotFoundError_(deleteError)) {
      return { mode: "ALREADY_GONE", message: "檔案已不存在（可能已被刪除）。" };
    }
    if (!isDeletePermissionError_(deleteError)) {
      throw deleteError;
    }

    try {
      trashDriveFileWithCompatibility_(api, fileId);
      return { mode: "TRASHED", message: buildDeletePermissionNote_(deleteError) };
    } catch (trashError) {
      if (isDriveNotFoundError_(trashError)) {
        return { mode: "ALREADY_GONE", message: "檔案已不存在（可能已被刪除）。" };
      }
      // Both permanent delete AND trash were denied: the executing admin only has
      // read access to this file. This is a Drive ACL fact, not a transient bug —
      // report it as a skip with an actionable remedy instead of a hard error.
      if (isDeletePermissionError_(trashError)) {
        return { mode: "NO_ACCESS", message: buildNoAccessNote_() };
      }
      throw new Error(`${buildDeletePermissionNote_(deleteError)} 移至垃圾桶亦失敗：${getExceptionMessage_(trashError)}`);
    }
  }
}

function deleteDriveFilePermanently_(api, fileId) {
  if (typeof api.delete === "function") {
    try {
      api.delete(fileId, { supportsAllDrives: true });
      return;
    } catch (e) {
      if (isMethodSignatureError_(e)) {
        api.delete(fileId);
        return;
      }
      throw e;
    }
  }

  if (typeof api.remove === "function") {
    try {
      api.remove(fileId, { supportsAllDrives: true });
      return;
    } catch (e) {
      if (isMethodSignatureError_(e)) {
        api.remove(fileId);
        return;
      }
      throw e;
    }
  }

  throw new Error("Drive.Files.delete/remove is not available in this runtime.");
}

function trashDriveFileWithCompatibility_(api, fileId) {
  if (typeof api.update === "function") {
    try {
      api.update({ trashed: true }, fileId, null, { supportsAllDrives: true, fields: "id,trashed" });
      return;
    } catch (e) {
      if (isMethodSignatureError_(e)) {
        try {
          api.update({ trashed: true }, fileId, { supportsAllDrives: true, fields: "id,trashed" });
          return;
        } catch (legacyE) {
          if (isMethodSignatureError_(legacyE)) {
            api.update({ trashed: true }, fileId);
            return;
          }
          throw legacyE;
        }
      }
      throw e;
    }
  }

  if (typeof api.trash === "function") {
    api.trash(fileId);
    return;
  }

  throw new Error("Drive.Files.update/trash is not available in this runtime.");
}

/**
 * Normalizes any Drive/Google API exception into { code, reasons[], message }.
 *
 * Why this exists: the Advanced Drive Service throws a GoogleJsonResponseException
 * whose `.message` is LOCALIZED by the executing user's Google account language,
 * e.g. "drive.files.delete API 呼叫失敗 (錯誤訊息：The user does not have sufficient
 * permissions for this file.)". The HTTP status (403) and the machine-readable
 * reason ("insufficientFilePermissions") live on `.details`, never in `.message`.
 * Classifying on message text alone is therefore locale-dependent and unreliable.
 */
function getDriveErrorSignature_(err) {
  const signature = { code: 0, reasons: [], message: getExceptionMessage_(err) };
  if (!err || typeof err !== "object") {
    signature.code = parseStatusCodeFromError_(err);
    return signature;
  }

  const sources = [];
  if (err.details && typeof err.details === "object") sources.push(err.details);
  const parsed = safeJsonParse_(signature.message);
  if (parsed && typeof parsed === "object") {
    sources.push(parsed.error && typeof parsed.error === "object" ? parsed.error : parsed);
  }

  sources.forEach(source => {
    const code = Number(source.code);
    if (!signature.code && code >= 400 && code < 600) signature.code = code;
    if (typeof source.status === "string" && source.status) {
      signature.reasons.push(source.status.toLowerCase());
    }
    const items = Array.isArray(source.errors) ? source.errors : [];
    items.forEach(item => {
      if (!item || typeof item !== "object") return;
      if (item.reason) signature.reasons.push(String(item.reason).toLowerCase());
      if (item.message && signature.message.indexOf(item.message) === -1) {
        signature.message += ` | ${item.message}`;
      }
    });
    if (source.message && signature.message.indexOf(source.message) === -1) {
      signature.message += ` | ${source.message}`;
    }
  });

  if (!signature.code) signature.code = parseStatusCodeFromError_(signature.message);
  return signature;
}

const DRIVE_PERMISSION_REASONS = [
  "insufficientfilepermissions",
  "insufficientparentpermissions",
  "forbidden",
  "cannotdelete",
  "cannotdeletefile",
  "cannottrashfile",
  "cannotmodifyrestrictedfile",
  "cannotremoveowner",
  "domainpolicy",
  "permission_denied"
];

// Locale-tolerant text fallbacks. "sufficient permissions" intentionally covers
// BOTH "insufficient permissions" and "does not have sufficient permissions".
const DRIVE_PERMISSION_TEXT_PATTERNS = [
  "insufficientfilepermissions",
  "sufficient permission",
  "permission denied",
  "permission_denied",
  "forbidden",
  "cannotdelete",
  "organizer",
  "not have permission",
  "沒有足夠的權限",
  "權限不足",
  "沒有權限"
];

function isDeletePermissionError_(err) {
  const signature = getDriveErrorSignature_(err);
  if (signature.code === 403) return true;
  if (signature.reasons.some(reason => DRIVE_PERMISSION_REASONS.indexOf(reason) !== -1)) return true;
  const text = signature.message.toLowerCase();
  return DRIVE_PERMISSION_TEXT_PATTERNS.some(pattern => text.indexOf(pattern) !== -1);
}

/**
 * 404 / already-deleted. Treated as an idempotent success so re-running a batch
 * over a stale audit list does not report phantom failures.
 */
function isDriveNotFoundError_(err) {
  const signature = getDriveErrorSignature_(err);
  if (signature.code === 404) return true;
  if (signature.reasons.indexOf("notfound") !== -1) return true;
  const text = signature.message.toLowerCase();
  return text.indexOf("file not found") !== -1 ||
    text.indexOf("notfound") !== -1 ||
    text.indexOf("找不到檔案") !== -1;
}

function isMethodSignatureError_(err) {
  const text = getExceptionMessage_(err).toLowerCase();
  return text.indexOf("typeerror") !== -1 ||
    text.indexOf("invalid argument") !== -1 ||
    text.indexOf("invalid number of arguments") !== -1 ||
    text.indexOf("unexpected argument") !== -1 ||
    text.indexOf("too many arguments") !== -1;
}

function buildDeletePermissionNote_(deleteError) {
  const errorText = getExceptionMessage_(deleteError);
  return `永久刪除遭拒（${errorText}）；共用雲端硬碟項目需要上層資料夾的「管理員 (organizer)」角色，個人雲端硬碟檔案則需為擁有者。`;
}

function buildNoAccessNote_() {
  return "永久刪除與移至垃圾桶皆遭拒：目前帳號對此檔案只有「檢視者」權限。" +
    "Google Workspace 超級管理員預設不會取得他人檔案的寫入權；" +
    "請先於管理控制台使用「雲端硬碟擁有權轉移」把檔案轉給管理帳號，或請原擁有者自行刪除。";
}

/* =========================================
   FEATURE 5b: DRIVE DELETE ESCALATION
   Two independent escalation paths, tried only after the normal
   delete -> trash chain has returned NO_ACCESS:

   Option A — Shared Drive items. `useDomainAdminAccess: true` lets a super
     admin manage permissions on ANY shared drive in the domain, including
     ones they are not a member of. We temporarily take the `organizer` role,
     delete, then restore the previous state (see releaseDriveEscalationContext_).
     Requires nothing beyond the existing auth/drive scope.

   Option B1 — My Drive items owned by another domain user. Ownership CANNOT
     be transferred by an admin token (the API requires the current owner to
     authorize it), so instead we mint a service-account access token that
     impersonates the owner via domain-wide delegation and delete as them.
     Deleting as the owner is deliberately preferred over transferring
     ownership first: a transfer would move the file's storage quota onto the
     admin account before deletion, which can exhaust the admin's quota on a
     large cleanup, and costs twice the API calls for no benefit.
   ========================================= */

const DRIVE_ESCALATION_CONFIG = {
  PROP_SA_EMAIL: "DWD_SERVICE_ACCOUNT_EMAIL",
  PROP_SA_KEY: "DWD_PRIVATE_KEY",
  TOKEN_SCOPE: "https://www.googleapis.com/auth/drive",
  TOKEN_ENDPOINT: "https://oauth2.googleapis.com/token",
  TOKEN_LIFETIME_SECONDS: 3600,
  TOKEN_CACHE_PREFIX: "dwdtok_",
  TOKEN_CACHE_TTL_SECONDS: 3000,
  FILES_ENDPOINT: "https://www.googleapis.com/drive/v3/files",
  SHARED_DRIVE_SCAN_BUDGET_MS: 90000,
  MAX_SHARED_DRIVES_SCANNED: 200
};

/**
 * Editor-only setup. Stores the service account credentials used for Option B1.
 * Accepts EITHER (clientEmail, privateKey) OR the full service account JSON key
 * file contents as a single argument.
 *
 * SECURITY: the stored key can delete any Drive file in the domain on behalf of
 * any domain user. Script Properties are readable by anyone with edit access to
 * this Apps Script project — keep project sharing restricted to the admin.
 */
function setDriveDelegationCredentials(clientEmailOrJson, privateKey) {
  let email = String(clientEmailOrJson || "").trim();
  let key = String(privateKey || "");

  const parsed = safeJsonParse_(clientEmailOrJson);
  if (parsed && parsed.client_email && parsed.private_key) {
    email = String(parsed.client_email).trim();
    key = String(parsed.private_key);
  }

  if (!email || email.indexOf("@") === -1) {
    throw new Error("需要服務帳戶的 client_email，或直接把整份 JSON 金鑰檔內容當作單一參數傳入。");
  }
  key = normalizePrivateKey_(key);
  if (key.indexOf("-----BEGIN") !== 0) {
    throw new Error("private_key 必須是以 -----BEGIN PRIVATE KEY----- 開頭的 PEM 區塊。");
  }

  const props = {};
  props[DRIVE_ESCALATION_CONFIG.PROP_SA_EMAIL] = email;
  props[DRIVE_ESCALATION_CONFIG.PROP_SA_KEY] = key;
  PropertiesService.getScriptProperties().setProperties(props);

  logSystemAction_("DWD_CONFIG", email, "SUCCESS", "Drive delegation credentials stored.");
  return `已設定 Drive 委派服務帳戶：${email}。請至管理控制台 > 安全性 > API 控制 > 全網域委派，` +
    `以該服務帳戶的用戶端 ID 授權範圍 ${DRIVE_ESCALATION_CONFIG.TOKEN_SCOPE}，然後執行 testDriveDelegation("某位使用者@你的網域") 驗證。`;
}

function clearDriveDelegationCredentials() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(DRIVE_ESCALATION_CONFIG.PROP_SA_EMAIL);
  props.deleteProperty(DRIVE_ESCALATION_CONFIG.PROP_SA_KEY);
  logSystemAction_("DWD_CONFIG", "-", "SUCCESS", "Drive delegation credentials cleared.");
  return "已清除 Drive 委派服務帳戶設定。My Drive 檔案將回到僅回報「權限不足略過」。";
}

/** Safe status probe — never returns key material. */
function getDriveDelegationStatus() {
  const creds = getDriveDelegationCredentials_();
  return {
    configured: !!creds,
    serviceAccountEmail: creds ? creds.email : "",
    scope: DRIVE_ESCALATION_CONFIG.TOKEN_SCOPE
  };
}

/** Editor-only smoke test: proves the DWD grant works before relying on it. */
function testDriveDelegation(impersonatedEmail) {
  const subject = String(impersonatedEmail || "").trim();
  if (!subject || subject.indexOf("@") === -1) {
    throw new Error('請提供要模擬的網域使用者信箱，例如 testDriveDelegation("user@your-domain.edu")。');
  }
  const token = fetchImpersonatedAccessToken_(subject);
  const response = UrlFetchApp.fetch(
    `${DRIVE_ESCALATION_CONFIG.FILES_ENDPOINT}?pageSize=1&fields=files(id)&supportsAllDrives=true`,
    { method: "get", headers: { Authorization: `Bearer ${token}` }, muteHttpExceptions: true }
  );
  const code = response.getResponseCode();
  if (code !== 200) {
    const detail = extractApiErrorMessage_(safeJsonParse_(response.getContentText()), response.getContentText());
    throw new Error(`委派驗證失敗（HTTP ${code}）：${detail}`);
  }
  return `委派驗證成功：已能以 ${subject} 的身分呼叫 Drive API。`;
}

function getDriveDelegationCredentials_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const email = props.getProperty(DRIVE_ESCALATION_CONFIG.PROP_SA_EMAIL);
    const key = props.getProperty(DRIVE_ESCALATION_CONFIG.PROP_SA_KEY);
    if (!email || !key) return null;
    return { email: email, key: key };
  } catch (e) {
    return null;
  }
}

function isDriveDelegationConfigured_() {
  return !!getDriveDelegationCredentials_();
}

function normalizePrivateKey_(key) {
  return String(key || "").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
}

function base64UrlEncode_(text) {
  return Utilities.base64EncodeWebSafe(text, Utilities.Charset.UTF_8).replace(/=+$/, "");
}

function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

/** RS256-signed JWT bearer assertion (RFC 7523) with `sub` = impersonated user. */
function buildServiceAccountJwt_(creds, subject, nowSeconds) {
  const issuedAt = Math.floor(nowSeconds);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: creds.email,
    sub: subject,
    scope: DRIVE_ESCALATION_CONFIG.TOKEN_SCOPE,
    aud: DRIVE_ESCALATION_CONFIG.TOKEN_ENDPOINT,
    iat: issuedAt,
    exp: issuedAt + DRIVE_ESCALATION_CONFIG.TOKEN_LIFETIME_SECONDS
  };
  const signingInput = `${base64UrlEncode_(JSON.stringify(header))}.${base64UrlEncode_(JSON.stringify(claim))}`;
  const signature = Utilities.computeRsaSha256Signature(signingInput, creds.key);
  return `${signingInput}.${base64UrlEncodeBytes_(signature)}`;
}

function getScriptCacheSafe_() {
  try {
    return CacheService.getScriptCache();
  } catch (e) {
    return null;
  }
}

/**
 * Mints (and caches) an impersonated access token. Caching is per-subject and
 * matters: a cleanup batch usually targets many files owned by the same few
 * users, and an uncached token exchange per file would burn the 6-minute limit.
 */
function fetchImpersonatedAccessToken_(subject, fetchFn) {
  const creds = getDriveDelegationCredentials_();
  if (!creds) throw new Error("尚未設定 Drive 委派服務帳戶（請先執行 setDriveDelegationCredentials）。");

  const cache = getScriptCacheSafe_();
  const cacheKey = DRIVE_ESCALATION_CONFIG.TOKEN_CACHE_PREFIX +
    Utilities.base64EncodeWebSafe(String(subject)).replace(/=+$/, "");
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  const assertion = buildServiceAccountJwt_(creds, subject, new Date().getTime() / 1000);
  const doFetch = fetchFn || function(url, params) { return UrlFetchApp.fetch(url, params); };
  const response = doFetch(DRIVE_ESCALATION_CONFIG.TOKEN_ENDPOINT, {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion
    },
    muteHttpExceptions: true
  });

  const body = response.getContentText();
  const parsed = safeJsonParse_(body);
  if (response.getResponseCode() !== 200 || !parsed || !parsed.access_token) {
    const detail = (parsed && (parsed.error_description || parsed.error)) || String(body).substring(0, 300);
    throw new Error(`無法取得 ${subject} 的委派存取權杖：${detail}（請確認全網域委派已授權 ${DRIVE_ESCALATION_CONFIG.TOKEN_SCOPE}）。`);
  }
  if (cache) {
    cache.put(cacheKey, parsed.access_token, DRIVE_ESCALATION_CONFIG.TOKEN_CACHE_TTL_SECONDS);
  }
  return parsed.access_token;
}

/** Option B1 executor: permanent delete performed as the file's own owner. */
function deleteDriveFileAsOwner_(fileId, ownerEmail, fetchFn) {
  const token = fetchImpersonatedAccessToken_(ownerEmail, fetchFn);
  const doFetch = fetchFn || function(url, params) { return UrlFetchApp.fetch(url, params); };
  const response = doFetch(
    `${DRIVE_ESCALATION_CONFIG.FILES_ENDPOINT}/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    { method: "delete", headers: { Authorization: `Bearer ${token}` }, muteHttpExceptions: true }
  );

  const code = response.getResponseCode();
  if (code === 204 || code === 200) return { mode: "DELETED_AS_OWNER", message: "" };
  if (code === 404) return { mode: "ALREADY_GONE", message: "檔案已不存在（可能已被刪除）。" };

  const body = response.getContentText();
  const detail = extractApiErrorMessage_(safeJsonParse_(body), body);
  if (code === 403) {
    return { mode: "NO_ACCESS", message: `已模擬擁有者 ${ownerEmail} 但仍遭拒（403）：${detail}` };
  }
  throw new Error(`以擁有者 ${ownerEmail} 身分刪除失敗（HTTP ${code}）：${detail}`);
}

function getEffectiveAdminEmail_() {
  try {
    return Session.getEffectiveUser().getEmail() || "";
  } catch (e) {
    return "";
  }
}

function isSameDomainEmail_(a, b) {
  const domainA = String(a || "").split("@")[1];
  const domainB = String(b || "").split("@")[1];
  return !!domainA && !!domainB && domainA.toLowerCase() === domainB.toLowerCase();
}

function createDriveEscalationContext_() {
  return {
    adminEmail: getEffectiveAdminEmail_(),
    delegationAvailable: isDriveDelegationConfigured_(),
    grantedDrives: [],
    driveAdminDeletes: 0,
    ownerDeletes: 0,
    notes: []
  };
}

/**
 * Option A: take `organizer` on a shared drive via domain admin access.
 * The pre-existing permission is inspected first so that
 * releaseDriveEscalationContext_ can restore — never widen — the admin's
 * standing access once the batch finishes.
 */
function grantSelfSharedDriveOrganizer_(driveId, ctx, deps) {
  if (ctx.grantedDrives.some(grant => grant.driveId === driveId)) return;

  const permissionsApi = (deps && deps.permissionsApi) || (Drive && Drive.Permissions ? Drive.Permissions : null);
  if (!permissionsApi) throw new Error("Drive.Permissions API is unavailable.");
  if (!ctx.adminEmail) throw new Error("無法取得目前執行帳號的信箱，無法進行共用雲端硬碟提權。");

  const adminKey = ctx.adminEmail.toLowerCase();
  let mine = null;
  try {
    const listed = permissionsApi.list(driveId, {
      useDomainAdminAccess: true,
      supportsAllDrives: true,
      fields: "permissions(id,role,type,emailAddress)"
    });
    mine = (listed.permissions || []).filter(p => p.emailAddress &&
      String(p.emailAddress).toLowerCase() === adminKey)[0] || null;
  } catch (e) {
    mine = null; // fall through to create; a duplicate create is safer than skipping
  }

  if (mine && mine.role === "organizer") {
    ctx.grantedDrives.push({ driveId: driveId, permissionId: mine.id, preExisting: true });
    return;
  }

  if (mine) {
    permissionsApi.update({ role: "organizer" }, driveId, mine.id, {
      useDomainAdminAccess: true,
      supportsAllDrives: true,
      fields: "id"
    });
    ctx.grantedDrives.push({ driveId: driveId, permissionId: mine.id, previousRole: mine.role });
    return;
  }

  const created = permissionsApi.create(
    { role: "organizer", type: "user", emailAddress: ctx.adminEmail },
    driveId,
    {
      useDomainAdminAccess: true,
      supportsAllDrives: true,
      sendNotificationEmail: false,
      fields: "id"
    }
  );
  ctx.grantedDrives.push({ driveId: driveId, permissionId: created && created.id ? created.id : "", created: true });
}

/** Restores every temporary shared-drive elevation taken during the batch. */
function releaseDriveEscalationContext_(ctx, deps) {
  const permissionsApi = (deps && deps.permissionsApi) || (Drive && Drive.Permissions ? Drive.Permissions : null);
  if (!permissionsApi || !ctx || !ctx.grantedDrives.length) return;

  ctx.grantedDrives.forEach(grant => {
    if (grant.preExisting || !grant.permissionId) return;
    try {
      if (grant.created) {
        permissionsApi.remove(grant.driveId, grant.permissionId, {
          useDomainAdminAccess: true,
          supportsAllDrives: true
        });
      } else if (grant.previousRole) {
        permissionsApi.update({ role: grant.previousRole }, grant.driveId, grant.permissionId, {
          useDomainAdminAccess: true,
          supportsAllDrives: true,
          fields: "id"
        });
      }
    } catch (e) {
      ctx.notes.push(`共用雲端硬碟 ${grant.driveId} 的臨時管理員權限未能自動還原：${getExceptionMessage_(e)}`);
    }
  });
}

/**
 * Escalation entry point. Called only when the normal chain returned NO_ACCESS.
 * Returns the same outcome shape as removeDriveFileWithCompatibility_.
 */
function escalateDriveFileRemoval_(fileId, ctx, deps) {
  const filesApi = (deps && deps.filesApi) || (Drive && Drive.Files ? Drive.Files : null);
  if (!filesApi) return { mode: "NO_ACCESS", message: buildNoAccessNote_() };

  let meta;
  try {
    meta = filesApi.get(fileId, {
      supportsAllDrives: true,
      fields: "id,name,driveId,owners(emailAddress)"
    });
  } catch (e) {
    return { mode: "NO_ACCESS", message: `無法讀取檔案中繼資料，略過提權：${getExceptionMessage_(e)}` };
  }

  // --- Option A: shared drive item ---
  if (meta && meta.driveId) {
    try {
      grantSelfSharedDriveOrganizer_(meta.driveId, ctx, deps);
    } catch (grantError) {
      return { mode: "NO_ACCESS", message: `共用雲端硬碟提權失敗：${getExceptionMessage_(grantError)}` };
    }
    const retry = removeDriveFileWithCompatibility_(fileId, filesApi);
    if (retry.mode === "DELETED") {
      ctx.driveAdminDeletes++;
      return { mode: "DELETED_AS_DRIVE_ADMIN", message: "" };
    }
    return retry;
  }

  // --- Option B1: My Drive item owned by another domain user ---
  const ownerEmail = (meta && meta.owners && meta.owners.length > 0) ? meta.owners[0].emailAddress : "";
  if (!ownerEmail) {
    return { mode: "NO_ACCESS", message: buildNoAccessNote_() };
  }
  if (!ctx.delegationAvailable) {
    return {
      mode: "NO_ACCESS",
      message: `${buildNoAccessNote_()} 或設定全網域委派服務帳戶（setDriveDelegationCredentials），即可直接以擁有者身分刪除。`
    };
  }
  if (!isSameDomainEmail_(ownerEmail, ctx.adminEmail)) {
    return { mode: "NO_ACCESS", message: `檔案擁有者 ${ownerEmail} 不屬於本網域，全網域委派無法模擬外部帳號。` };
  }

  const result = deleteDriveFileAsOwner_(fileId, ownerEmail, deps && deps.fetchFn);
  if (result.mode === "DELETED_AS_OWNER") ctx.ownerDeletes++;
  return result;
}

/**
 * Option A, audit side: enumerates every shared drive in the domain — including
 * ones the admin is not a member of — so the audit is not limited to the
 * admin's own memberships.
 */
function listDomainSharedDrives_(deps) {
  const drivesApi = (deps && deps.drivesApi) || (Drive && Drive.Drives ? Drive.Drives : null);
  if (!drivesApi || typeof drivesApi.list !== "function") return [];

  const drives = [];
  let pageToken = null;
  do {
    const params = { useDomainAdminAccess: true, pageSize: 100, fields: "nextPageToken,drives(id,name)" };
    if (pageToken) params.pageToken = pageToken;
    let response;
    try {
      response = drivesApi.list(params);
    } catch (e) {
      console.error("Domain shared drive enumeration failed", e);
      break;
    }
    drives.push(...(response.drives || []));
    pageToken = response.nextPageToken || null;
  } while (pageToken && drives.length < DRIVE_ESCALATION_CONFIG.MAX_SHARED_DRIVES_SCANNED);

  return drives.slice(0, DRIVE_ESCALATION_CONFIG.MAX_SHARED_DRIVES_SCANNED);
}

function getExceptionMessage_(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return String(err.message);
  return String(err);
}

/* =========================================
   FEATURE 6: EMAIL NOTIFICATION (Gmail API)
   ========================================= */

/**
 * Sends a custom email to a list of users.
 * Supports simple template variables: {name} and {email}
 */
function sendCustomEmailBatch(recipientEmails, subject, bodyTemplate) {
  if (!recipientEmails || recipientEmails.length === 0) throw new Error("No recipients defined.");
  if (!subject || !bodyTemplate) throw new Error("Subject and Body are required.");

  // Init Logs
  const ss = getDBSpreadsheet_();
  let logSheet = ss.getSheetByName(CONFIG.SHEET_NAME_EMAILS);
  if (!logSheet) {
    logSheet = ss.insertSheet(CONFIG.SHEET_NAME_EMAILS);
    logSheet.appendRow(["Timestamp", "Recipient", "Subject", "Status", "Sender"]);
  }

  let successCount = 0;
  let failCount = 0;

  // We need names for replacement, so we might need to fetch user details.
  // Efficiency: Fetching user details one by one is slow. 
  // Optimization: We assume recipientEmails is just emails. 
  // If customization {name} is used, we must fetch user info.
  const needsName = bodyTemplate.includes("{name}");

  recipientEmails.forEach(email => {
    try {
      let finalBody = bodyTemplate;
      let userName = "";

      if (needsName) {
        try {
          // Fetch user name via AdminDirectory
          const user = AdminDirectory.Users.get(email, { fields: 'name(fullName)' });
          userName = user.name.fullName;
        } catch (e) {
          userName = email.split('@')[0]; // Fallback if user not found or external
        }
        // Replace All {name} occurrences
        finalBody = finalBody.replace(/{name}/g, userName);
      }
      
      // Replace {email}
      finalBody = finalBody.replace(/{email}/g, email);

      // Send using GmailApp (Standard GAS implementation of Gmail API)
      GmailApp.sendEmail(email, subject, "", {
        htmlBody: finalBody,
        name: "Domain Admin System"
      });

      // Log success
      logSheet.appendRow([new Date(), email, subject, "SENT", Session.getActiveUser().getEmail()]);
      successCount++;

    } catch (e) {
      console.error(`Failed to send to ${email}: ${e.message}`);
      logSheet.appendRow([new Date(), email, subject, "ERROR: " + e.message, Session.getActiveUser().getEmail()]);
      failCount++;
    }
  });

  logSystemAction_("SEND_EMAIL", "Batch", "COMPLETE", `Sent: ${successCount}, Failed: ${failCount}`);
  return { message: `Email sending complete.\nSuccess: ${successCount}\nFailed: ${failCount}`, successCount, failCount };
}

/* =========================================
   UTILITIES
   ========================================= */

function testApiConnection() {
  const user = Session.getActiveUser().getEmail();
  return `Connected as ${user}`;
}
