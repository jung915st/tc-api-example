/**
 * Project: Domain Admin Suite
 * Version: 1.9.0
 * Updated: 2026-02-18 (Timezone UTC+8)
 * Description: Comprehensive Admin System (Classroom, Directory, Drive, Email).
 * * CORE FEATURES:
 * 1. Classroom: Create/Delete Courses, Add Teachers, Roster Students via OU, Batch Create (CSV/TSV)
 * 2. Directory: Inactive User Detection, Suspend, Move OU
 * 3. Lifecycle: Automated deletion of suspended accounts after 3 months
 * 4. Drive: Outdated File Auditing (Fixed Sort: Largest then Oldest), Batch Delete/Archive with Trash fallback
 * 5. Email: Custom HTML notification sending with variable support ({name}, {email})
 * 6. Logging: Centralized logging to Spreadsheet (UTC+8)
 * * * REQUIRED SCOPES:
 * @include https://www.googleapis.com/auth/script.scriptapp
 * @include https://www.googleapis.com/auth/script.external_request
 * @include https://www.googleapis.com/auth/spreadsheets
 * @include https://www.googleapis.com/auth/classroom.courses
 * @include https://www.googleapis.com/auth/classroom.rosters
 * @include https://www.googleapis.com/auth/classroom.profile.emails
 * @include https://www.googleapis.com/auth/admin.directory.user
 * @include https://www.googleapis.com/auth/admin.directory.orgunit
 * @include https://www.googleapis.com/auth/drive
 * @include https://www.googleapis.com/auth/gmail.send
 */

const APP_VERSION = "1.9.0";
const CONFIG = {
  TIME_ZONE: "GMT+8",
  SHEET_NAME_COURSES: "Classroom_Courses",
  SHEET_NAME_LOGS: "Classroom_Logs",
  SHEET_NAME_ACTIONS: "Action_Logs",
  SHEET_NAME_EMAILS: "Email_Logs", // New Log Sheet for Feature 5
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

/**
 * Serves the Web App UI.
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');
  template.appVersion = APP_VERSION;
  
  return template.evaluate()
    .setTitle('Domain Admin Suite v${APP_VERSION}')
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
    
    let teacherStatus = "Owner only (Admin)";
    if (payload.teacherEmail && payload.teacherEmail !== "me") {
      try {
        Classroom.Courses.Teachers.create({ userId: payload.teacherEmail }, created.id);
        teacherStatus = 'Teacher added: ${payload.teacherEmail}';
      } catch (e) {
        teacherStatus = 'Created, but failed to add teacher: ${e.message}';
      }
    }

    appendCourseRecordsToSheet_([{
      courseId: created.id,
      name: created.name || payload.name,
      section: created.section || payload.section || "",
      ownerId: created.ownerId || "me",
      teacherEmail: payload.teacherEmail || "",
      createdAt: new Date()
    }]);
    
    logSystemAction_("CREATE_COURSE", created.id, "SUCCESS", 'Name: ${created.name}, ${teacherStatus}');
    
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
    
    logSystemAction_("LIST_COURSES", "N/A", "SUCCESS", 'Retrieved ${courses.length} courses');
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
    return 'Course ${courseId} deleted successfully.';
  } catch (e) {
    logSystemAction_("DELETE_COURSE", courseId, "FAILED", e.message);
    throw new Error("Delete Failed: " + e.message);
  }
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
      results.errors.push('${email}: ${msg}');
    }
  });
  logSystemAction_("ADD_STUDENTS", courseId, "COMPLETE", 'Success: ${results.success.length}, Errors: ${results.errors.length}');
  return { message: 'Processed ${studentEmails.length} students.', details: results };
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
    filename: 'classroom-course-batch-template.${normalizedFormat}',
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
    contentId: 'create-row-${row.rowNumber}',
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
    contentId: 'teacher-row-${item.rowNumber}',
    method: "POST",
    path: '/v1/courses/${encodeURIComponent(item.course.id)}/teachers',
    body: { userId: item.teacherEmail },
    meta: item
  }));

  const teacherResultMap = teacherOps.length > 0
    ? mapBatchResultsByContentId_(batchExecutor(teacherOps))
    : {};

  createdForTeacherPhase.forEach(item => {
    const teacherResult = teacherResultMap['teacher-row-${item.rowNumber}'];
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
  const boundary = 'batch_${Utilities.getUuid().replace(/-/g, "")}';
  const payload = buildBatchMultipartRequest_(operations, boundary);
  const fetcher = fetchFn || UrlFetchApp.fetch;

  const response = fetcher(COURSE_BATCH_CONFIG.ENDPOINT, {
    method: "post",
    contentType: 'multipart/mixed; boundary=${boundary}',
    payload: payload,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ${ScriptApp.getOAuthToken()}',
      Accept: "multipart/mixed"
    }
  });

  const statusCode = response.getResponseCode ? response.getResponseCode() : 0;
  const headers = response.getAllHeaders ? response.getAllHeaders() : {};
  const contentType = getHeaderValueIgnoreCase_(headers, "Content-Type");
  const responseText = response.getContentText ? response.getContentText() : "";

  if (statusCode >= 400 && String(contentType || "").indexOf("multipart/mixed") === -1) {
    const parsed = safeJsonParse_(responseText);
    const message = extractApiErrorMessage_(parsed, responseText || 'HTTP ${statusCode}');
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
      message: 'Failed to parse batch response: ${e.message}',
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
    lines.push('--${boundary}');
    lines.push("Content-Type: application/http");
    lines.push('Content-ID: <${op.contentId}>');
    lines.push("");
    lines.push('${op.method} ${op.path} HTTP/1.1');
    lines.push("Host: classroom.googleapis.com");
    lines.push("Content-Type: application/json; charset=UTF-8");
    lines.push("Accept: application/json");
    lines.push("");
    lines.push(JSON.stringify(op.body || {}));
    lines.push("");
  });
  lines.push('--${boundary}--');
  return lines.join("\r\n");
}

function parseBatchMultipartResponse_(responseText, contentType) {
  const boundaryMatch = /boundary="?([^";]+)"?/i.exec(String(contentType || ""));
  if (!boundaryMatch) {
    throw new Error("Batch response is missing multipart boundary.");
  }

  const boundary = boundaryMatch[1];
  const pieces = String(responseText || "").split('--${boundary}');
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
    throw new Error('Missing required headers: ${missing.join(", ")}.');
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
    errors.push('Teacher email is invalid (${rowObj.teacherEmail}).');
  }
  return { valid: errors.length === 0, errors: errors };
}

function assertBatchRowLimit_(nonEmptyRowCount) {
  if (nonEmptyRowCount > COURSE_BATCH_CONFIG.MAX_ROWS) {
    throw new Error('Upload exceeds row limit (${COURSE_BATCH_CONFIG.MAX_ROWS}).');
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
  return '${normalizeCourseKeyPart_(name)}::${normalizeCourseKeyPart_(section)}';
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
    return '"${text.replace(/"/g, '""')}"';
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
  const base = 'Rows: ${summary.totalRows || 0}, Created: ${summary.created || 0}, Partial: ${summary.partial || 0}, Skipped: ${summary.skipped || 0}, Errors: ${summary.errors || 0}';
  const partialRows = (result && result.created ? result.created : []).filter(item => item.teacherStatus === "FAILED");
  if (partialRows.length === 0) {
    return base;
  }

  const details = partialRows.slice(0, 10).map(item => {
    const reason = item.teacherError || "Unknown teacher assignment error";
    return 'row ${item.rowNumber} (courseId=${item.courseId}, teacher=${item.teacherEmail}): ${reason}';
  }).join(" | ");

  const extraCount = partialRows.length > 10 ? ' (+${partialRows.length - 10} more)' : "";
  return truncateLogDetail_('${base}; Partial details: ${details}${extraCount}', 3500);
}

function truncateLogDetail_(text, maxLength) {
  const value = String(text || "");
  const limit = Number(maxLength) || 3500;
  if (value.length <= limit) return value;
  return value.substring(0, limit - 3) + "...";
}

/* =========================================
   FEATURE 2: USER MANAGEMENT (Admin SDK)
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
function getFilteredUsers(ouPath, dateCondition, specificDate) {
  let allUsers = [];
  let pageToken = null;
  const cutoffDate = (dateCondition === "BEFORE_DATE" && specificDate) ? new Date(specificDate) : null;

  try {
    do {
      let queryParts = [];
      if (ouPath && ouPath !== "ALL") queryParts.push('orgUnitPath='${ouPath}'');
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
            name: user.name.fullName,
            email: user.primaryEmail,
            lastLogin: lastLogin ? Utilities.formatDate(lastLogin, CONFIG.TIME_ZONE, "yyyy-MM-dd HH:mm") : "Never Logged In",
            suspended: user.suspended,
            org: user.orgUnitPath
          });
        }
      });
      pageToken = response.nextPageToken;
    } while (pageToken);
    
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
  logSystemAction_("MOVE_USERS", targetOU, "COMPLETE", 'Moved: ${count}');
  return { message: 'Moved ${count} users.', errors: errors };
}

/* =========================================
   FEATURE 3: LIFECYCLE AUTOMATION
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
  logSystemAction_("SUSPEND_BATCH", "Batch", "SUCCESS", 'Suspended ${count} users.');
  return 'Suspended ${count} users. Deletion scheduled: ${formattedDeletionDate}.';
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
  return 'Added ${syncedCount} suspended accounts to queue.';
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
  return 'Deleted ${deletedCount} accounts.';
}

/* =========================================
   FEATURE 4: DRIVE AUDIT (Drive API v3)
   ========================================= */

/**
 * Finds files older than a specific date. Supports All Drives.
 * Fixed Sort: Largest files first (quotaBytesUsed desc), then Oldest (modifiedTime asc)
 * * @param {string} dateString - YYYY-MM-DD (Filter Condition)
 */
function findOutdatedFiles(dateString) {
  try {
    // 1. Filter Condition: Date Cutoff (One condition)
    if (!dateString) throw new Error("Date string is required (YYYY-MM-DD).");
    const cutoff = '${dateString}T00:00:00Z';
    const query = 'modifiedTime < '${cutoff}' and trashed = false';
    
    // 2. Fixed Sort Logic: Largest First, then Oldest
    const orderBy = "quotaBytesUsed desc, modifiedTime"; 

    // 3. Call Drive API (v3)
    const response = Drive.Files.list({
      q: query,
      pageSize: 100,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: 'allDrives',
      orderBy: orderBy,
      fields: "files(id,name,webViewLink,owners(emailAddress),modifiedTime,size,quotaBytesUsed,mimeType)"
    });

    // 4. Parse Response
    const items = response.files || [];
    
    logSystemAction_("AUDIT_DRIVE", "Drive", "SUCCESS", 'Found ${items.length} files. Sort: ${orderBy}');

    // 5. Map to UI format
    return items.map(f => ({
      id: f.id,
      name: f.name,
      link: f.webViewLink,
      owner: (f.owners && f.owners.length > 0) ? f.owners[0].emailAddress : "Shared Drive",
      modified: Utilities.formatDate(new Date(f.modifiedTime), CONFIG.TIME_ZONE, "yyyy-MM-dd"),
      size: (Number(f.size || f.quotaBytesUsed || 0) / 1024 / 1024).toFixed(2) + " MB",
      isFolder: f.mimeType === "application/vnd.google-apps.folder"
    }));
  } catch (e) {
    logSystemAction_("AUDIT_DRIVE", "Drive", "ERROR", e.message);
    throw e;
  }
}

/**
 * Batch deletes or archives (renames) files.
 * * Uses Drive API v3 (update)
 */
function manageFiles(fileIds, action) {
  let count = 0;
  let deleteCount = 0;
  let trashedFallbackCount = 0;
  const errors = [];
  fileIds.forEach(id => {
    try {
      if (action === 'delete') {
        const outcome = removeDriveFileWithCompatibility_(id);
        if (outcome.mode === "TRASHED") {
          trashedFallbackCount++;
        } else {
          deleteCount++;
        }
      } else if (action === 'archive') {
        // v3 uses 'update' for partial updates and 'name' for renaming
        const file = Drive.Files.get(id, { supportsAllDrives: true, fields: "id,name" });
        Drive.Files.update({ name: '[ARCHIVED]_' + file.name }, id, { supportsAllDrives: true });
      }
      count++;
    } catch (e) {
      errors.push('${id}: ${e.message}');
      console.error('Error processing ${id}:', e);
    }
  });
  
  const verb = action === 'delete' ? 'Deleted' : 'Archived';
  const hasFallbackTrash = action === 'delete' && trashedFallbackCount > 0;
  const status = errors.length === 0
    ? (hasFallbackTrash ? "PARTIAL" : "SUCCESS")
    : (count > 0 ? "PARTIAL" : "FAILED");
  const fallbackText = hasFallbackTrash
    ? '; Trashed fallback: ${trashedFallbackCount} (shared drive permanent delete requires organizer role on a parent folder)'
    : "";
  const errorPreview = errors.length > 0 ? '; Errors: ${errors.slice(0, 5).join(" | ")}' : "";
  if (action === 'delete') {
    logSystemAction_(
      "MANAGE_FILES",
      "Batch",
      status,
      truncateLogDetail_('Deleted ${deleteCount}/${fileIds.length} files${fallbackText}${errorPreview}', 3500)
    );
  } else {
    logSystemAction_(
      "MANAGE_FILES",
      "Batch",
      status,
      truncateLogDetail_('${verb} ${count}/${fileIds.length} files${errorPreview}', 3500)
    );
  }

  if (errors.length === 0 && !hasFallbackTrash) {
    return 'Successfully ${verb.toLowerCase()} ${count} items.';
  }
  if (action === 'delete') {
    const base = 'Deleted ${deleteCount} item(s).';
    const fallbackNote = hasFallbackTrash ? ' Moved ${trashedFallbackCount} item(s) to trash due to delete permission limits (shared drive organizer required for permanent delete).' : "";
    const errorNote = errors.length > 0 ? ' Failed ${errors.length} item(s). ${errors.slice(0, 3).join(" | ")}' : "";
    return '${base}${fallbackNote}${errorNote}'.trim();
  }
  return '${verb} ${count} items. Failed ${errors.length} item(s). ${errors.slice(0, 3).join(" | ")}';
}

function removeDriveFileWithCompatibility_(fileId, filesApi) {
  const api = filesApi || (Drive && Drive.Files ? Drive.Files : null);
  if (!api) throw new Error("Drive.Files API is unavailable.");

  try {
    deleteDriveFilePermanently_(api, fileId);
    return { mode: "DELETED" };
  } catch (deleteError) {
    if (!isDeletePermissionError_(deleteError)) {
      throw deleteError;
    }

    try {
      trashDriveFileWithCompatibility_(api, fileId);
      return {
        mode: "TRASHED",
        message: buildDeletePermissionNote_(deleteError)
      };
    } catch (trashError) {
      throw new Error('${buildDeletePermissionNote_(deleteError)} Trash fallback failed: ${getExceptionMessage_(trashError)}');
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

function isDeletePermissionError_(err) {
  const text = getExceptionMessage_(err).toLowerCase();
  return text.indexOf("insufficientfilepermissions") !== -1 ||
    text.indexOf("insufficient permissions") !== -1 ||
    text.indexOf("forbidden") !== -1 ||
    text.indexOf("cannotdelete") !== -1 ||
    text.indexOf("organizer") !== -1 ||
    text.indexOf("403") !== -1;
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
  return 'Permanent delete denied (${errorText}). For shared drive items, organizer role on a parent folder is required.';
}

function getExceptionMessage_(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return String(err.message);
  return String(err);
}

/* =========================================
   FEATURE 5: EMAIL NOTIFICATION (Gmail API)
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
      console.error('Failed to send to ${email}: ${e.message}');
      logSheet.appendRow([new Date(), email, subject, "ERROR: " + e.message, Session.getActiveUser().getEmail()]);
      failCount++;
    }
  });

  logSystemAction_("SEND_EMAIL", "Batch", "COMPLETE", 'Sent: ${successCount}, Failed: ${failCount}');
  return { message: 'Email sending complete.\nSuccess: ${successCount}\nFailed: ${failCount}', successCount, failCount };
}

/* =========================================
   UTILITIES
   ========================================= */

function testApiConnection() {
  const user = Session.getActiveUser().getEmail();
  return 'Connected as ${user}';
}