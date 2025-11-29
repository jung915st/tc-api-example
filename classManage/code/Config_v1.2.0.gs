/**
 * Config_v1.2.0.gs - Consolidated System Configuration
 * 
 * Version: v1.2.0
 * Release Date: 2025-11-29
 * Changes: Consolidated v1.0.0 and v1.1.0, removed redundancies, optimized performance
 * 
 * Includes all system settings, tc-api integration, security, and caching
 */

// ==================== Version Information ====================
const VERSION = {
  MAJOR: 1,
  MINOR: 2,
  PATCH: 0,
  BUILD_DATE: '2025-11-29',
  DESCRIPTION: 'Consolidated version with tc-api integration and enhanced features'
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
 * @param {string} format - Format type ('date', 'time', 'datetime', 'full', 'short')
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
    TEACHERS: '教師資料',
    CLASSES: '班級資料',
    CLASS_STUDENTS: '班級學生對照'
  },
  
  // Teacher information (read from system settings)
  TEACHER: {
    NAME: '導師姓名',
    EMAIL: 'teacher@example.com',
    CLASS: '一年一班'
  },
  
  // OAuth 2.0 Client Credentials Settings (for school API access)
  OAUTH: {
    TOKEN_URL: 'https://api.cloudschool.tw/oauth?authorize',
    CLIENT_ID: 'e881581f5810f8b0efd6607339b72dac',
    CLIENT_SECRET: '3be8e42e0074a40397ad08abfd3b4016',
    SCHOOL_API_URL: 'https://api.cloudschool.tw',
    TOKEN_CACHE_KEY: 'oauth_access_token',
    TOKEN_CACHE_DURATION: 3500  // ~58 minutes, token typically expires in 1 hour
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
    ALLOWED_DOMAINS: ['example.com'],  // Modify this to your school domain
    MAX_LOGIN_ATTEMPTS: 5,
    SESSION_COOKIE_NAME: 'class_mgmt_session',
    DEFAULT_PASSCODE: '8888',  // Default passcode for testing
    SESSION_DURATION: 3600000  // 1 hour in milliseconds
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
  GRADE: 7,
  CLASS_SEQ: 8
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

const TEACHER_COLS = {
  UID: 0,
  UID2: 1,
  NAME: 2,
  OFFICE: 3,
  TITLE: 4,
  ACCOUNT: 5,
  GENDER: 6,
  TEACHING_SUBJECTS: 7,
  EMAIL: 8
};

const CLASS_COLS = {
  GRADE: 0,
  CLASS_SEQ: 1,
  CLASS_NAME: 2
};

const CLASS_STUDENT_COLS = {
  STUDENT_NO: 0,
  NAME: 1,
  GENDER: 2,
  GRADE: 3,
  CLASS_NAME: 4,
  CLASS_SEQ: 5,
  SEAT_NO: 6
};

// ==================== OAuth 2.0 Client Credentials Functions ====================

/**
 * Get OAuth 2.0 access token using client credentials flow
 * @return {string} Access token or null if failed
 */
function getOAuthAccessToken() {
  try {
    // Check cache first
    const cached = getCache(CONFIG.OAUTH.TOKEN_CACHE_KEY);
    if (cached && cached.token && cached.expires_at > Date.now()) {
      Logger.log('Using cached OAuth token');
      return cached.token;
    }
    
    Logger.log('Fetching new OAuth token');
    
    // Prepare OAuth 2.0 client credentials request
    const payload = {
      grant_type: 'client_credentials',
      client_id: CONFIG.OAUTH.CLIENT_ID,
      client_secret: CONFIG.OAUTH.CLIENT_SECRET
    };
    
    const options = {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: payload,
      muteHttpExceptions: true,
      timeout: 15000
    };
    
    const response = UrlFetchApp.fetch(CONFIG.OAUTH.TOKEN_URL, options);
    const code = response.getResponseCode();
    
    if (code === 200) {
      const result = JSON.parse(response.getContentText());
      const accessToken = result.access_token;
      const expiresIn = result.expires_in || 3600; // Default 1 hour
      
      // Cache the token with expiration time (subtract 60s for safety margin)
      const cacheData = {
        token: accessToken,
        expires_at: Date.now() + (expiresIn - 60) * 1000
      };
      
      setCache(CONFIG.OAUTH.TOKEN_CACHE_KEY, cacheData, CONFIG.OAUTH.TOKEN_CACHE_DURATION);
      
      Logger.log('OAuth token obtained successfully');
      return accessToken;
    } else {
      Logger.log(`OAuth token request failed: ${code} - ${response.getContentText()}`);
      return null;
    }
  } catch (error) {
    Logger.log(`Get OAuth token error: ${error}`);
    return null;
  }
}

/**
 * Call school API directly with OAuth 2.0 authentication
 * @param {string} endpoint - API endpoint (e.g., '/semester-data')
 * @param {string} method - HTTP method (GET, POST)
 * @return {object} API response
 */
function callSchoolApi(endpoint, method = 'GET') {
  try {
    const accessToken = getOAuthAccessToken();
    
    if (!accessToken) {
      return { error: 'Failed to obtain OAuth access token' };
    }
    
    const url = CONFIG.OAUTH.SCHOOL_API_URL + endpoint;
    const options = {
      method: method,
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      contentType: 'application/json',
      muteHttpExceptions: true,
      timeout: 30000
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    
    if (code >= 200 && code < 300) {
      return JSON.parse(response.getContentText());
    } else {
      Logger.log(`School API error: ${code} - ${response.getContentText()}`);
      return { error: `API錯誤: ${code}`, details: response.getContentText() };
    }
  } catch (error) {
    Logger.log(`Call school API failed: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * Sync data directly from school API using OAuth 2.0
 * @return {object} Sync result
 */
function syncFromSchoolApi() {
  try {
    logAction('開始同步校務系統資料 (OAuth 2.0)', '', 'INFO');
    
    // Fetch semester data directly from school API
    const semesterData = callSchoolApi('/semester-data', 'GET');
    
    if (semesterData.error) {
      return { success: false, message: '同步失敗: ' + semesterData.error };
    }
    
    // Process the semester data structure (based on actual API response)
    const teachers = semesterData['學期教職員'] || [];
    const classRosters = semesterData['學期編班'] || [];
    
    // Extract students from nested class structure
    const students = [];
    const classes = [];
    
    classRosters.forEach(classData => {
      // Add class info
      classes.push({
        年級: classData['年級'],
        班序: classData['班序'],
        班名: classData['班名'],
        導師: classData['導師'] || []
      });
      
      // Extract students from this class
      const classStudents = classData['學期編班'] || [];
      classStudents.forEach(student => {
        students.push({
          ...student,
          年級: classData['年級'],
          班序: classData['班序'],
          班名: classData['班名']
        });
      });
    });
    
    // Save data to sheets
    if (teachers.length > 0) {
      saveTeachersFromSemesterData(teachers);
    }
    
    if (classes.length > 0) {
      saveClassesFromSemesterData(classes);
    }
    
    if (students.length > 0) {
      saveStudentsFromSemesterData(students);
    }
    
    // Update last sync time with metadata
    const syncInfo = {
      time: getCurrentTime().toString(),
      學年: semesterData['學年'],
      學期: semesterData['學期'],
      更新時間: semesterData['更新時間']
    };
    updateSettingValue('last_school_api_sync', JSON.stringify(syncInfo));
    
    // Clear cache
    clearAllCache();
    
    logAction('校務系統資料同步完成', `教師: ${teachers.length}, 班級: ${classes.length}, 學生: ${students.length}`, 'INFO');
    
    return { 
      success: true, 
      message: '同步完成',
      teachers: teachers.length,
      students: students.length,
      classes: classes.length,
      學年: semesterData['學年'],
      學期: semesterData['學期']
    };
  } catch (error) {
    Logger.log(`同步失敗: ${error}`);
    return { success: false, message: error.toString() };
  }
}

/**
 * Save teachers data from semester data (school API)
 * @param {Array} teachers - Teachers array from school API (學期教職員)
 */
function saveTeachersFromSemesterData(teachers) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.TEACHERS);
    
    // Store existing emails before clearing (to preserve them across syncs)
    const existingEmails = {};
    if (sheet && sheet.getLastRow() > 1) {
      const existingData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
      existingData.forEach(row => {
        const uid = row[TEACHER_COLS.UID];
        const email = row[TEACHER_COLS.EMAIL];
        if (uid && email) {
          existingEmails[uid] = email;
        }
      });
    }
    
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAMES.TEACHERS);
      sheet.appendRow(['UID', 'UID2', '姓名', '處室', '職稱', '帳號', '性別', '任教科目', 'Email']);
      sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#667eea').setFontColor('white');
    } else {
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
      }
    }
    
    const rows = [];
    teachers.forEach(t => {
      // Format teaching subjects as string
      let subjectsStr = '';
      if (t['任教科目'] && Array.isArray(t['任教科目'])) {
        subjectsStr = t['任教科目'].map(s => 
          `${s['年級']}-${s['班序']}:${s['科目']}(${s['時數']})`
        ).join(', ');
      }
      
      const uid = t['UID'] || '';
      const preservedEmail = existingEmails[uid] || '';
      
      rows.push([
        uid,
        t['UID2'] || '',
        t['姓名'] || '',
        t['處室'] || '',
        t['職稱'] || '',
        t['帳號'] || '',
        t['性別'] || '',
        subjectsStr,
        preservedEmail  // Preserve existing email or empty
      ]);
    });
    
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 9).setValues(rows);
    }
    
    logAction('儲存教師資料', `${rows.length} 筆`, 'INFO');
  } catch (error) {
    Logger.log(`儲存教師資料失敗: ${error}`);
  }
}

/**
 * Save classes data from semester data (school API)
 * @param {Array} classes - Classes array processed from 學期編班
 */
function saveClassesFromSemesterData(classes) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.CLASSES);
    
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAMES.CLASSES);
      sheet.appendRow(['年級', '班序', '班名', '導師']);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#667eea').setFontColor('white');
    } else {
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
      }
    }
    
    const rows = [];
    classes.forEach(c => {
      // Format homeroom teachers
      let teachersStr = '';
      if (c['導師'] && Array.isArray(c['導師'])) {
        teachersStr = c['導師'].map(t => t['姓名']).join(', ');
      }
      
      rows.push([
        c['年級'] || '',
        c['班序'] || '',
        c['班名'] || '',
        teachersStr
      ]);
    });
    
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 4).setValues(rows);
    }
    
    logAction('儲存班級資料', `${rows.length} 筆`, 'INFO');
  } catch (error) {
    Logger.log(`儲存班級資料失敗: ${error}`);
  }
}

/**
 * Save students data from semester data (direct school API)
 * @param {Array} students - Students array from school API
 */
function saveStudentsFromSemesterData(students) {
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
        s['學號'] || '',
        s['姓名'] || '',
        s['性別'] || '',
        s['年級'] || '',
        s['班名'] || '',
        s['班序'] || '',
        s['座號'] || ''
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
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    const teachers = data.map(row => ({
      uid: row[TEACHER_COLS.UID],
      uid2: row[TEACHER_COLS.UID2],
      name: row[TEACHER_COLS.NAME],
      office: row[TEACHER_COLS.OFFICE],
      title: row[TEACHER_COLS.TITLE],
      account: row[TEACHER_COLS.ACCOUNT],
      gender: row[TEACHER_COLS.GENDER],
      teachingSubjects: row[TEACHER_COLS.TEACHING_SUBJECTS],
      email: row[TEACHER_COLS.EMAIL]
    })).filter(t => t.name);
    
    setCache('teachers_list', teachers, CACHE_CONFIG.DURATION.MEDIUM);
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
    
    setCache(cacheKey, classes, CACHE_CONFIG.DURATION.MEDIUM);
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
    
    setCache(cacheKey, students, CACHE_CONFIG.DURATION.MEDIUM);
    return students;
  } catch (error) {
    Logger.log(`取得班級學生失敗: ${error}`);
    return [];
  }
}

// ==================== Settings Management ====================

/**
 * Read setting value from system settings sheet
 */
function getSettingValue(key) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let settingsSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SETTINGS);
    
    if (!settingsSheet) {
      // Create settings sheet if it doesn't exist
      settingsSheet = ss.insertSheet(CONFIG.SHEET_NAMES.SETTINGS);
      settingsSheet.appendRow(['設定項目', '設定值', '說明']);
      settingsSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#667eea').setFontColor('white');
      return null;
    }
    
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

// ==================== Security Functions ====================

/**
 * Get all teachers for login selection
 * @return {Array} Array of teacher objects with name, uid, email, and teaching info
 */
function getTeachersForLogin() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.TEACHERS);
    
    if (!sheet || sheet.getLastRow() < 2) {
      return [];
    }
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    const teachers = data.map(row => {
      // Parse teaching subjects to extract classes
      const teachingSubjects = row[TEACHER_COLS.TEACHING_SUBJECTS]; // 任教科目 column
      let teachingClasses = [];
      let subjects = [];
      
      if (teachingSubjects) {
        // Parse format like "2-5:本土語文(1), 2-6:本土語文(1)"
        const parts = teachingSubjects.split(',').map(p => p.trim());
        parts.forEach(part => {
          const match = part.match(/(\d+)-(\d+):(.+)\((\d+)\)/);
          if (match) {
            const grade = match[1];
            const classSeq = match[2];
            const subject = match[3];
            const hours = match[4];
            
            teachingClasses.push({
              grade: parseInt(grade),
              classSeq: parseInt(classSeq),
              className: `${grade}年${classSeq}班`
            });
            
            if (!subjects.includes(subject)) {
              subjects.push(subject);
            }
          }
        });
      }
      
      // Remove duplicate classes
      const uniqueClasses = [];
      const classKeys = new Set();
      teachingClasses.forEach(c => {
        const key = `${c.grade}-${c.classSeq}`;
        if (!classKeys.has(key)) {
          classKeys.add(key);
          uniqueClasses.push(c);
        }
      });
      
      return {
        uid: row[TEACHER_COLS.UID],
        uid2: row[TEACHER_COLS.UID2],
        name: row[TEACHER_COLS.NAME],
        office: row[TEACHER_COLS.OFFICE],
        title: row[TEACHER_COLS.TITLE],
        account: row[TEACHER_COLS.ACCOUNT],
        gender: row[TEACHER_COLS.GENDER],
        email: row[TEACHER_COLS.EMAIL],
        teachingClasses: uniqueClasses,
        subjects: subjects,
        displayInfo: uniqueClasses.length > 0 ? 
          `${row[TEACHER_COLS.NAME]} (${uniqueClasses.map(c => c.className).join(', ')})` : 
          `${row[TEACHER_COLS.NAME]} (${row[TEACHER_COLS.OFFICE]} - ${row[TEACHER_COLS.TITLE]})`
      };
    }).filter(t => t.name);
    
    return teachers;
  } catch (error) {
    Logger.log(`取得教師登入清單失敗: ${error}`);
    return [];
  }
}

/**
 * Validate teacher login
 * @param {string} teacherUid - Teacher UID
 * @param {string} email - Email input
 * @param {string} passcode - Passcode input
 * @return {object} Login result with teacher info or error
 */
function validateTeacherLogin(teacherUid, email, passcode) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.TEACHERS);
    
    if (!sheet) {
      return { success: false, error: '找不到教師資料表' };
    }
    
    // Find teacher by UID
    const data = sheet.getDataRange().getValues();
    let teacherRow = null;
    let rowIndex = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][TEACHER_COLS.UID] == teacherUid || data[i][TEACHER_COLS.UID2] == teacherUid) {
        teacherRow = data[i];
        rowIndex = i;
        break;
      }
    }
    
    if (!teacherRow) {
      return { success: false, error: '找不到教師資料' };
    }
    
    // Check passcode
    if (passcode !== CONFIG.SECURITY.DEFAULT_PASSCODE) {
      return { success: false, error: '密碼錯誤' };
    }
    
    // Get stored email from the EMAIL column (index 8)
    const storedEmail = teacherRow[TEACHER_COLS.EMAIL];
    
    // If no stored email, this is first login - store the email
    if (!storedEmail || storedEmail === '') {
      // Update email in spreadsheet
      sheet.getRange(rowIndex + 1, TEACHER_COLS.EMAIL + 1).setValue(email);
      logAction('教師首次登入', `UID: ${teacherUid}, Email: ${email}`, 'INFO');
    } else {
      // Verify email matches
      if (storedEmail !== email) {
        return { success: false, error: 'Email 不正確' };
      }
    }
    
    // Parse teaching info
    const teachingSubjects = teacherRow[TEACHER_COLS.TEACHING_SUBJECTS];
    let teachingClasses = [];
    let subjects = [];
    
    if (teachingSubjects) {
      const parts = teachingSubjects.split(',').map(p => p.trim());
      parts.forEach(part => {
        const match = part.match(/(\d+)-(\d+):(.+)\((\d+)\)/);
        if (match) {
          const grade = match[1];
          const classSeq = match[2];
          const subject = match[3];
          
          teachingClasses.push({
            grade: parseInt(grade),
            classSeq: parseInt(classSeq),
            className: `${grade}年${classSeq}班`
          });
          
          if (!subjects.includes(subject)) {
            subjects.push(subject);
          }
        }
      });
    }
    
    // Remove duplicate classes
    const uniqueClasses = [];
    const classKeys = new Set();
    teachingClasses.forEach(c => {
      const key = `${c.grade}-${c.classSeq}`;
      if (!classKeys.has(key)) {
        classKeys.add(key);
        uniqueClasses.push(c);
      }
    });
    
    // Create session
    const sessionId = Utilities.getUuid();
    const sessionData = {
      sessionId: sessionId,
      uid: teacherRow[TEACHER_COLS.UID],
      uid2: teacherRow[TEACHER_COLS.UID2],
      name: teacherRow[TEACHER_COLS.NAME],
      office: teacherRow[TEACHER_COLS.OFFICE],
      title: teacherRow[TEACHER_COLS.TITLE],
      email: email,
      gender: teacherRow[TEACHER_COLS.GENDER],
      teachingClasses: uniqueClasses,
      subjects: subjects,
      loginTime: getCurrentTime().toString(),
      expiresAt: Date.now() + CONFIG.SECURITY.SESSION_DURATION
    };
    
    // Store session in cache
    setCache(`session_${sessionId}`, sessionData, CONFIG.SECURITY.SESSION_DURATION / 1000);
    
    // Store session in user properties for persistence
    const userProps = PropertiesService.getUserProperties();
    userProps.setProperty('current_session', sessionId);
    userProps.setProperty('session_data', JSON.stringify(sessionData));
    
    logAction('教師登入成功', `${teacherRow[TEACHER_COLS.NAME]} (${teacherRow[TEACHER_COLS.UID]})`, 'INFO');
    
    return {
      success: true,
      session: sessionData
    };
  } catch (error) {
    Logger.log(`教師登入驗證失敗: ${error}`);
    return { success: false, error: error.toString() };
  }
}

/**
 * Get current logged-in teacher session
 * @return {object} Session data or null
 */
function getCurrentTeacherSession() {
  try {
    const userProps = PropertiesService.getUserProperties();
    const sessionId = userProps.getProperty('current_session');
    
    if (!sessionId) {
      return null;
    }
    
    // Try cache first
    let sessionData = getCache(`session_${sessionId}`);
    
    // If not in cache, get from user properties
    if (!sessionData) {
      const storedData = userProps.getProperty('session_data');
      if (storedData) {
        sessionData = JSON.parse(storedData);
      }
    }
    
    if (!sessionData) {
      return null;
    }
    
    // Check if session expired
    if (sessionData.expiresAt && sessionData.expiresAt < Date.now()) {
      logoutTeacher();
      return null;
    }
    
    return sessionData;
  } catch (error) {
    Logger.log(`取得教師 session 失敗: ${error}`);
    return null;
  }
}

/**
 * Logout teacher
 */
function logoutTeacher() {
  try {
    const userProps = PropertiesService.getUserProperties();
    const sessionId = userProps.getProperty('current_session');
    
    if (sessionId) {
      // Clear cache
      clearCache(`session_${sessionId}`);
    }
    
    // Clear user properties
    userProps.deleteProperty('current_session');
    userProps.deleteProperty('session_data');
    
    logAction('教師登出', '', 'INFO');
    
    return { success: true };
  } catch (error) {
    Logger.log(`教師登出失敗: ${error}`);
    return { success: false, error: error.toString() };
  }
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
  
  // Check if teacher is logged in via session
  const session = getCurrentTeacherSession();
  if (session && session.email) {
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
  // Check if teacher is logged in
  const session = getCurrentTeacherSession();
  
  if (session) {
    return {
      email: session.email,
      name: session.name,
      uid: session.uid,
      office: session.office,
      title: session.title,
      teachingClasses: session.teachingClasses,
      subjects: session.subjects,
      hasPermission: true,
      isLoggedIn: true,
      timestamp: getCurrentTime()
    };
  }
  
  // Fallback to old method
  const userEmail = Session.getActiveUser().getEmail();
  const hasPermission = verifyUserPermission(userEmail);
  
  return {
    email: userEmail,
    hasPermission: hasPermission,
    isLoggedIn: false,
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

