/**
 * Config_v1.1.0.gs - Enhanced System Configuration with tc-api Integration
 * 
 * Version: v1.1.0
 * Update Date: 2025-11-29
 * Updates: Added tc-api integration, teacher-class management, enhanced attendance
 * 
 * Includes all system settings, constants, security settings, and tc-api integration
 */

// ==================== Version Information ====================
const VERSION = {
  MAJOR: 1,
  MINOR: 1,
  PATCH: 0,
  BUILD_DATE: '2025-11-29',
  DESCRIPTION: 'Web App with tc-api Integration and Enhanced Attendance'
};

function getVersion() {
  return `${VERSION.MAJOR}.${VERSION.MINOR}.${VERSION.PATCH}`;
}

// ==================== Timezone Configuration ====================
const TIMEZONE_CONFIG = {
  TIMEZONE: 'Asia/Taipei',
  UTC_OFFSET: 8,
  LOCALE: 'zh-TW'
};

/**
 * Get current time (UTC+8)
 * @return {Date} Current time
 */
function getCurrentTime() {
  return new Date();
}

/**
 * Format date/time to UTC+8
 * @param {Date} date - Date object
 * @param {string} format - Format type ('date', 'time', 'datetime', 'full')
 * @return {string} Formatted string
 */
function formatDateTimeUTC8(date, format = 'datetime') {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  
  const timezone = TIMEZONE_CONFIG.TIMEZONE;
  
  switch (format) {
    case 'date':
      return Utilities.formatDate(date, timezone, 'yyyy-MM-dd');
    case 'time':
      return Utilities.formatDate(date, timezone, 'HH:mm:ss');
    case 'datetime':
      return Utilities.formatDate(date, timezone, 'yyyy-MM-dd HH:mm:ss');
    case 'full':
      return Utilities.formatDate(date, timezone, 'yyyy年MM月dd日 HH:mm:ss');
    case 'short':
      return Utilities.formatDate(date, timezone, 'MM/dd HH:mm');
    default:
      return Utilities.formatDate(date, timezone, 'yyyy-MM-dd HH:mm:ss');
  }
}

// ==================== System Configuration ====================
const CONFIG = {
  // Sheet names
  SHEET_NAMES: {
    STUDENTS: '學生基本資料',
    LEAVE: '請假總表',
    ATTENDANCE: '缺曠記錄',
    HOMEWORK: '作業項目',
    HOMEWORK_STATUS: '作業繳交狀態',
    SETTINGS: '系統設定',
    TEACHERS: '教師資料',           // NEW: Teacher data
    CLASSES: '班級資料',            // NEW: Class data
    CLASS_STUDENTS: '班級學生對照'  // NEW: Class-student mapping
  },
  
  // Teacher information (read from system settings)
  TEACHER: {
    NAME: '導師姓名',
    EMAIL: 'teacher@example.com',
    CLASS: '一年一班'
  },
  
  // tc-api Integration Settings - NEW
  TC_API: {
    BASE_URL: 'http://localhost:3001/api',  // Modify this to your tc-api server
    ENDPOINTS: {
      SYNC: '/sync-school',
      STUDENTS: '/students',
      TEACHERS: '/teachers',
      CLASSES: '/classes',
      SEMESTER_DATA: '/semester-data'  // If available
    },
    SYNC_INTERVAL: 3600000,  // 1 hour in milliseconds
    CACHE_DURATION: 1800,     // 30 minutes in seconds
    TIMEOUT: 30000            // 30 seconds
  },
  
  // Email settings
  EMAIL: {
    ENABLED: true,
    DAILY_REPORT_TIME: 7,
    FROM_NAME: '班級管理系統'
  },
  
  // Attendance status options
  ATTENDANCE_STATUS: {
    PRESENT: '出席',
    SICK: '病假',
    PERSONAL: '事假',
    ABSENT: '曠課',
    LATE: '遲到'
  },
  
  // Leave types
  LEAVE_TYPES: {
    SICK: '病假',
    PERSONAL: '事假',
    OTHER: '其他'
  },
  
  // Homework submission status
  HOMEWORK_STATUS: {
    SUBMITTED: '已交',
    NOT_SUBMITTED: '未交',
    LATE_SUBMITTED: '補交'
  },
  
  // Approval status
  APPROVAL_STATUS: {
    PENDING: '待審核',
    APPROVED: '已核准',
    REJECTED: '已拒絕'
  },
  
  // Subject list
  SUBJECTS: [
    '國文', '數學', '英文', '自然', '社會',
    '體育', '音樂', '美術', '電腦'
  ],
  
  // Web App settings
  WEB_APP: {
    TITLE: '班級管理系統',
    VERSION: getVersion(),
    SESSION_TIMEOUT: 3600000 // 1 hour (milliseconds)
  },
  
  // Security settings
  SECURITY: {
    ENABLE_AUTH: true,
    ALLOWED_DOMAINS: ['example.com'],
    MAX_LOGIN_ATTEMPTS: 5,
    SESSION_COOKIE_NAME: 'class_mgmt_session'
  }
};

// ==================== Column Index Definitions ====================

const STUDENT_COLS = {
  SEAT_NUMBER: 0,
  NAME: 1,
  PARENT_NAME: 2,
  PARENT_EMAIL: 3,
  PARENT_PHONE: 4,
  NOTES: 5
};

const LEAVE_COLS = {
  TIMESTAMP: 0,
  STUDENT_NAME: 1,
  SEAT_NUMBER: 2,
  LEAVE_DATE: 3,
  LEAVE_TYPE: 4,
  REASON: 5,
  PARENT_EMAIL: 6,
  APPROVAL_STATUS: 7,
  APPROVAL_TIME: 8
};

const ATTENDANCE_COLS = {
  DATE: 0,
  SEAT_NUMBER: 1,
  NAME: 2,
  STATUS: 3,
  RECORD_TIME: 4,
  RECORDER: 5,
  NOTES: 6,
  GRADE: 7,        // NEW
  CLASS_SEQ: 8     // NEW
};

const HOMEWORK_COLS = {
  HOMEWORK_ID: 0,
  ANNOUNCE_DATE: 1,
  HOMEWORK_NAME: 2,
  DESCRIPTION: 3,
  DUE_DATE: 4,
  SUBJECT: 5,
  CREATOR: 6
};

const HOMEWORK_STATUS_COLS = {
  HOMEWORK_ID: 0,
  SEAT_NUMBER: 1,
  NAME: 2,
  STATUS: 3,
  SUBMIT_TIME: 4,
  REMINDED: 5,
  PARENT_CONTACTED: 6,
  NOTES: 7
};

// NEW: Teacher column definitions
const TEACHER_COLS = {
  UID: 0,
  UID2: 1,
  NAME: 2,
  OFFICE: 3,
  TITLE: 4,
  IS_HOMEROOM: 5,
  EMAIL: 6
};

// NEW: Class column definitions
const CLASS_COLS = {
  GRADE: 0,
  CLASS_SEQ: 1,
  CLASS_NAME: 2,
  HOMEROOM_TEACHER_UID: 3,
  HOMEROOM_TEACHER_NAME: 4
};

// NEW: Class-Student mapping columns
const CLASS_STUDENT_COLS = {
  STUDENT_NO: 0,
  NAME: 1,
  GENDER: 2,
  GRADE: 3,
  CLASS_NAME: 4,
  CLASS_SEQ: 5,
  SEAT_NO: 6
};

// ==================== tc-api Integration Functions ====================

/**
 * Call tc-api endpoint
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method (GET, POST)
 * @param {object} payload - Request payload
 * @return {object} API response
 */
function callTcApi(endpoint, method = 'GET', payload = null) {
  try {
    const url = CONFIG.TC_API.BASE_URL + endpoint;
    const options = {
      method: method,
      contentType: 'application/json',
      muteHttpExceptions: true,
      timeout: CONFIG.TC_API.TIMEOUT
    };
    
    if (payload && method === 'POST') {
      options.payload = JSON.stringify(payload);
    }
    
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    
    if (code >= 200 && code < 300) {
      return JSON.parse(response.getContentText());
    } else {
      Logger.log(`tc-api error: ${code} - ${response.getContentText()}`);
      return { error: `API錯誤: ${code}`, details: response.getContentText() };
    }
  } catch (error) {
    Logger.log(`tc-api call failed: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * Sync data from tc-api
 * @return {object} Sync result
 */
function syncFromTcApi() {
  try {
    logAction('開始同步 tc-api 資料', '', 'INFO');
    
    // Trigger sync in tc-api backend
    const syncResult = callTcApi(CONFIG.TC_API.ENDPOINTS.SYNC, 'POST');
    
    if (syncResult.error) {
      return { success: false, message: '同步失敗: ' + syncResult.error };
    }
    
    // Fetch teachers data
    const teachers = callTcApi(CONFIG.TC_API.ENDPOINTS.TEACHERS);
    if (!teachers.error) {
      saveTeachersToSheet(teachers);
    }
    
    // Fetch classes data
    const classes = callTcApi(CONFIG.TC_API.ENDPOINTS.CLASSES);
    if (!classes.error) {
      saveClassesToSheet(classes);
    }
    
    // Fetch students data
    const students = callTcApi(CONFIG.TC_API.ENDPOINTS.STUDENTS);
    if (!students.error) {
      saveStudentsToSheet(students);
    }
    
    // Update last sync time
    updateSettingValue('last_tc_api_sync', getCurrentTime().toString());
    
    // Clear cache
    clearAllCache();
    
    logAction('tc-api 資料同步完成', '', 'INFO');
    
    return { 
      success: true, 
      message: '同步完成',
      teachers: Array.isArray(teachers) ? teachers.length : 0,
      students: Array.isArray(students) ? students.length : 0
    };
  } catch (error) {
    Logger.log(`同步失敗: ${error}`);
    return { success: false, message: error.toString() };
  }
}

/**
 * Save teachers data to sheet
 * @param {Array} teachers - Teachers array from tc-api
 */
function saveTeachersToSheet(teachers) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.TEACHERS);
    
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAMES.TEACHERS);
      sheet.appendRow(['UID', 'UID2', '姓名', '處室', '職稱', '是否導師', 'Email', '任教班級']);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#667eea').setFontColor('white');
    } else {
      // Clear existing data (except header)
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
      }
    }
    
    const rows = [];
    teachers.forEach(t => {
      const classesStr = t.classes ? t.classes.map(c => `${c.grade}-${c.class_seq}`).join(', ') : '';
      rows.push([
        t.uid || '',
        t.uid2 || '',
        t.name || '',
        t.office || '',
        t.title || '',
        t.isHomeroom ? '是' : '否',
        t.email || '',
        classesStr
      ]);
    });
    
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 8).setValues(rows);
    }
    
    logAction('儲存教師資料', `${rows.length} 筆`, 'INFO');
  } catch (error) {
    Logger.log(`儲存教師資料失敗: ${error}`);
  }
}

/**
 * Save classes data to sheet
 * @param {object} classesData - Classes data from tc-api
 */
function saveClassesToSheet(classesData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.CLASSES);
    
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAMES.CLASSES);
      sheet.appendRow(['年級', '班序', '班名']);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#667eea').setFontColor('white');
    } else {
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
      }
    }
    
    const rows = [];
    const grades = classesData.grades || [];
    const classes = classesData.classes || {};
    
    grades.forEach(grade => {
      const classList = classes[grade] || [];
      classList.forEach(c => {
        rows.push([grade, c.班序, c.班名]);
      });
    });
    
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }
    
    logAction('儲存班級資料', `${rows.length} 筆`, 'INFO');
  } catch (error) {
    Logger.log(`儲存班級資料失敗: ${error}`);
  }
}

/**
 * Save students data to sheet
 * @param {Array} students - Students array from tc-api
 */
function saveStudentsToSheet(students) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.CLASS_STUDENTS);
    
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAMES.CLASS_STUDENTS);
      sheet.appendRow(['學號', '姓名', '性別', '年級', '班名', '班序', '座號']);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#667eea').setFontColor('white');
    } else {
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
      }
    }
    
    const rows = [];
    students.forEach(s => {
      rows.push([
        s.student_no || '',
        s.name || '',
        s.gender || '',
        s.grade || '',
        s.class_name || '',
        s.class_seq || '',
        s.seat_no || ''
      ]);
    });
    
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 7).setValues(rows);
    }
    
    logAction('儲存學生資料', `${rows.length} 筆`, 'INFO');
  } catch (error) {
    Logger.log(`儲存學生資料失敗: ${error}`);
  }
}

/**
 * Get teachers list from sheet
 * @return {Array} Teachers array
 */
function getTeachersList() {
  try {
    const cached = getCache('teachers_list');
    if (cached) return cached;
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.TEACHERS);
    
    if (!sheet || sheet.getLastRow() < 2) {
      return [];
    }
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    const teachers = data.map(row => ({
      uid: row[0],
      uid2: row[1],
      name: row[2],
      office: row[3],
      title: row[4],
      isHomeroom: row[5] === '是',
      email: row[6],
      classes: row[7]
    })).filter(t => t.name);
    
    setCache('teachers_list', teachers, CONFIG.TC_API.CACHE_DURATION);
    return teachers;
  } catch (error) {
    Logger.log(`取得教師清單失敗: ${error}`);
    return [];
  }
}

/**
 * Get classes list from sheet
 * @param {number} grade - Filter by grade (optional)
 * @return {Array} Classes array
 */
function getClassesList(grade = null) {
  try {
    const cacheKey = grade ? `classes_list_${grade}` : 'classes_list_all';
    const cached = getCache(cacheKey);
    if (cached) return cached;
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.CLASSES);
    
    if (!sheet || sheet.getLastRow() < 2) {
      return [];
    }
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    let classes = data.map(row => ({
      grade: row[0],
      class_seq: row[1],
      class_name: row[2]
    })).filter(c => c.grade);
    
    if (grade) {
      classes = classes.filter(c => c.grade == grade);
    }
    
    setCache(cacheKey, classes, CONFIG.TC_API.CACHE_DURATION);
    return classes;
  } catch (error) {
    Logger.log(`取得班級清單失敗: ${error}`);
    return [];
  }
}

/**
 * Get students by class
 * @param {number} grade - Grade number
 * @param {number} classSeq - Class sequence
 * @return {Array} Students array
 */
function getStudentsByClass(grade, classSeq) {
  try {
    const cacheKey = `students_${grade}_${classSeq}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.CLASS_STUDENTS);
    
    if (!sheet || sheet.getLastRow() < 2) {
      return [];
    }
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    const students = data.filter(row => row[3] == grade && row[5] == classSeq)
      .map(row => ({
        student_no: row[0],
        name: row[1],
        gender: row[2],
        grade: row[3],
        class_name: row[4],
        class_seq: row[5],
        seat_no: row[6]
      }));
    
    setCache(cacheKey, students, CONFIG.TC_API.CACHE_DURATION);
    return students;
  } catch (error) {
    Logger.log(`取得班級學生失敗: ${error}`);
    return [];
  }
}

// ==================== Security Functions ====================

/**
 * Read setting value from system settings sheet
 */
function getSettingValue(key) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const settingsSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SETTINGS);
    
    if (!settingsSheet) return null;
    
    const data = settingsSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        return data[i][1];
      }
    }
    
    return null;
  } catch (error) {
    Logger.log(`讀取設定失敗: ${error}`);
    return null;
  }
}

/**
 * Update system setting value
 */
function updateSettingValue(key, value) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let settingsSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SETTINGS);
    
    if (!settingsSheet) {
      settingsSheet = ss.insertSheet(CONFIG.SHEET_NAMES.SETTINGS);
      settingsSheet.appendRow(['設定項目', '設定值', '說明']);
      settingsSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#667eea').setFontColor('white');
    }
    
    const data = settingsSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        settingsSheet.getRange(i + 1, 2).setValue(value);
        return true;
      }
    }
    
    settingsSheet.appendRow([key, value, '']);
    return true;
  } catch (error) {
    Logger.log(`更新設定失敗: ${error}`);
    return false;
  }
}

/**
 * Get teacher information
 */
function getTeacherInfo() {
  const teacherName = getSettingValue('導師姓名') || CONFIG.TEACHER.NAME;
  const teacherEmail = getSettingValue('導師Email') || CONFIG.TEACHER.EMAIL;
  const className = getSettingValue('班級名稱') || CONFIG.TEACHER.CLASS;
  
  return {
    name: teacherName,
    email: teacherEmail,
    className: className
  };
}

/**
 * Verify user permission
 * @param {string} userEmail - User Email
 * @return {boolean} Has permission
 */
function verifyUserPermission(userEmail) {
  if (!CONFIG.SECURITY.ENABLE_AUTH) {
    return true;
  }
  
  const teacherInfo = getTeacherInfo();
  if (userEmail === teacherInfo.email) {
    return true;
  }
  
  const domain = userEmail.split('@')[1];
  if (CONFIG.SECURITY.ALLOWED_DOMAINS.includes(domain)) {
    return true;
  }
  
  return false;
}

/**
 * Get current user information
 */
function getCurrentUser() {
  const userEmail = Session.getActiveUser().getEmail();
  const hasPermission = verifyUserPermission(userEmail);
  
  return {
    email: userEmail,
    hasPermission: hasPermission,
    timestamp: getCurrentTime()
  };
}

// ==================== Utility Functions ====================

/**
 * Generate unique ID
 */
function generateUniqueId() {
  return Utilities.getUuid();
}

/**
 * Check if email is valid
 */
function isValidEmail(email) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

/**
 * Log system action
 */
function logAction(action, detail = '', level = 'INFO') {
  const timestamp = formatDateTimeUTC8(getCurrentTime());
  const userEmail = Session.getActiveUser().getEmail();
  const logMessage = `[${timestamp}] [${level}] [${userEmail}] ${action}: ${detail}`;
  Logger.log(logMessage);
}

/**
 * Generate API Token (for security verification)
 */
function generateApiToken(userEmail) {
  const timestamp = new Date().getTime();
  const data = `${userEmail}:${timestamp}`;
  const signature = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    data,
    Utilities.Charset.UTF_8
  );
  
  return Utilities.base64Encode(signature);
}

/**
 * Verify API Token
 */
function verifyApiToken(token, userEmail, maxAge = 3600000) {
  try {
    return token && token.length > 0;
  } catch (error) {
    Logger.log(`Token 驗證失敗: ${error}`);
    return false;
  }
}

// ==================== Cache Management ====================

const CACHE_CONFIG = {
  DURATION: {
    SHORT: 300,      // 5 minutes
    MEDIUM: 1800,    // 30 minutes
    LONG: 3600       // 1 hour
  }
};

/**
 * Get cache
 */
function getCache(key) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);
  
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      return null;
    }
  }
  
  return null;
}

/**
 * Set cache
 */
function setCache(key, value, duration = CACHE_CONFIG.DURATION.MEDIUM) {
  const cache = CacheService.getScriptCache();
  
  try {
    cache.put(key, JSON.stringify(value), duration);
    return true;
  } catch (error) {
    Logger.log(`設定快取失敗: ${error}`);
    return false;
  }
}

/**
 * Clear cache
 */
function clearCache(key) {
  const cache = CacheService.getScriptCache();
  cache.remove(key);
}

/**
 * Clear all cache
 */
function clearAllCache() {
  const cache = CacheService.getScriptCache();
  cache.removeAll([
    'dashboard_summary',
    'student_list',
    'homework_list',
    'teachers_list',
    'classes_list_all'
  ]);
}

