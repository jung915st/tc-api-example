/**
 * Project: Domain Admin Suite
 * Version: 1.8.3
 * Updated: 2026-02-06 (Timezone UTC+8)
 * Description: Comprehensive Admin System (Classroom, Directory, Drive).
 * * CORE FEATURES:
 * 1. Classroom: Create/Delete Courses, Add Teachers, Roster Students via OU
 * 2. Directory: Inactive User Detection, Suspend, Move OU
 * 3. Lifecycle: Automated deletion of suspended accounts after 3 months
 * 4. Drive: Outdated File Auditing (Fixed Sort: Largest then Oldest), Batch Delete/Archive
 * 5. Logging: Centralized logging to Spreadsheet (UTC+8)
 * * * REQUIRED SCOPES:
 * @include https://www.googleapis.com/auth/script.scriptapp
 * @include https://www.googleapis.com/auth/spreadsheets
 * @include https://www.googleapis.com/auth/classroom.courses
 * @include https://www.googleapis.com/auth/classroom.rosters
 * @include https://www.googleapis.com/auth/classroom.profile.emails
 * @include https://www.googleapis.com/auth/admin.directory.user
 * @include https://www.googleapis.com/auth/admin.directory.orgunit
 * @include https://www.googleapis.com/auth/drive
 */

const APP_VERSION = "1.8.3";
const CONFIG = {
  TIME_ZONE: "GMT+8",
  SHEET_NAME_COURSES: "Classroom_Courses",
  SHEET_NAME_LOGS: "Classroom_Logs",
  SHEET_NAME_ACTIONS: "Action_Logs",
  PROP_SHEET_ID: "MANAGE_SPREADSHEET_ID"
};

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
  
  // 1. Fixed Course Owner: Always "me" (The Admin executing the script)
  const coursePayload = {
    name: payload.name,
    section: payload.section || "",
    description: payload.description || "",
    ownerId: "me", 
    courseState: "ACTIVE"
  };

  try {
    // Create Course
    const created = Classroom.Courses.create(coursePayload);
    
    // 2. Add Teacher: If a specific teacher is selected (and it's not the admin 'me')
    let teacherStatus = "Owner only (Admin)";
    if (payload.teacherEmail && payload.teacherEmail !== "me") {
      try {
        // This adds the user as a *Teacher* to the course
        Classroom.Courses.Teachers.create({ userId: payload.teacherEmail }, created.id);
        teacherStatus = `Teacher added: ${payload.teacherEmail}`;
      } catch (e) {
        teacherStatus = `Created, but failed to add teacher: ${e.message}`;
      }
    }

    // 3. Log to Sheet
    const ss = getDBSpreadsheet_();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_COURSES);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAME_COURSES);
      sheet.appendRow(["Course ID", "Name", "Section", "Owner", "Assigned Teacher", "Created At"]);
    }
    // Record both the Owner (created.ownerId) and the assigned Teacher (payload.teacherEmail)
    sheet.appendRow([created.id, created.name, created.section, created.ownerId, payload.teacherEmail || "", new Date()]);
    
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
      if (ouPath && ouPath !== "ALL") queryParts.push(`orgUnitPath='${ouPath}'`);
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
  logSystemAction_("MOVE_USERS", targetOU, "COMPLETE", `Moved: ${count}`);
  return { message: `Moved ${count} users.`, errors: errors };
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
    const cutoff = `${dateString}T00:00:00Z`;
    const query = `modifiedTime < '${cutoff}' and trashed = false`;
    
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
    
    logSystemAction_("AUDIT_DRIVE", "Drive", "SUCCESS", `Found ${items.length} files. Sort: ${orderBy}`);

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
  fileIds.forEach(id => {
    try {
      if (action === 'delete') {
        Drive.Files.delete(id, { supportsAllDrives: true });
      } else if (action === 'archive') {
        // v3 uses 'update' for partial updates and 'name' for renaming
        const file = Drive.Files.get(id, { supportsAllDrives: true, fields: "id,name" });
        Drive.Files.update({ name: `[ARCHIVED]_` + file.name }, id, { supportsAllDrives: true });
      }
      count++;
    } catch (e) {
      console.error(`Error processing ${id}:`, e);
    }
  });
  
  const verb = action === 'delete' ? 'Deleted' : 'Archived';
  logSystemAction_("MANAGE_FILES", "Batch", "SUCCESS", `${verb} ${count} files`);
  return `Successfully ${verb.toLowerCase()} ${count} items.`;
}

/* =========================================
   UTILITIES
   ========================================= */

function testApiConnection() {
  const user = Session.getActiveUser().getEmail();
  return `Connected as ${user}`;
}
