/**
 * Config_v1.0.0.gs - 系統配置檔案
 * 
 * 版本：v1.0.0
 * 更新日期：2025-11-18
 * 更新內容：初始版本，改用純 Apps Script Web App，移除 AppSheet 依賴
 * 
 * 包含所有系統設定、常數定義、安全性設定
 */

// ==================== 版本資訊 ====================
const VERSION = {
  MAJOR: 1,
  MINOR: 0,
  PATCH: 0,
  BUILD_DATE: '2025-11-18',
  DESCRIPTION: 'Web App 初始版本'
};

function getVersion() {
  return `${VERSION.MAJOR}.${VERSION.MINOR}.${VERSION.PATCH}`;
}

// ==================== 時區設定 ====================
const TIMEZONE_CONFIG = {
  TIMEZONE: 'Asia/Taipei',
  UTC_OFFSET: 8,
  LOCALE: 'zh-TW'
};

/**
 * 取得當前時間（UTC+8）
 * @return {Date} 當前時間
 */
function getCurrentTime() {
  return new Date();
}

/**
 * 格式化日期時間為 UTC+8
 * @param {Date} date - 日期物件
 * @param {string} format - 格式（'date', 'time', 'datetime', 'full'）
 * @return {string} 格式化後的字串
 */
function formatDateTimeUTC8(date, format = 'datetime') {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  
  // 使用 Utilities.formatDate 確保 UTC+8
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

// ==================== 系統設定 ====================
const CONFIG = {
  // 試算表設定
  SHEET_NAMES: {
    STUDENTS: '學生基本資料',
    LEAVE: '請假總表',
    ATTENDANCE: '缺曠記錄',
    HOMEWORK: '作業項目',
    HOMEWORK_STATUS: '作業繳交狀態',
    SETTINGS: '系統設定'
  },
  
  // 教師資訊（從系統設定讀取，這裡是預設值）
  TEACHER: {
    NAME: '導師姓名',
    EMAIL: 'teacher@example.com',
    CLASS: '一年一班'
  },
  
  // 郵件設定
  EMAIL: {
    ENABLED: true,
    DAILY_REPORT_TIME: 7,
    FROM_NAME: '班級管理系統'
  },
  
  // 出席狀態選項
  ATTENDANCE_STATUS: {
    PRESENT: '出席',
    SICK: '病假',
    PERSONAL: '事假',
    ABSENT: '曠課',
    LATE: '遲到'
  },
  
  // 請假類型
  LEAVE_TYPES: {
    SICK: '病假',
    PERSONAL: '事假',
    OTHER: '其他'
  },
  
  // 作業繳交狀態
  HOMEWORK_STATUS: {
    SUBMITTED: '已交',
    NOT_SUBMITTED: '未交',
    LATE_SUBMITTED: '補交'
  },
  
  // 審核狀態
  APPROVAL_STATUS: {
    PENDING: '待審核',
    APPROVED: '已核准',
    REJECTED: '已拒絕'
  },
  
  // 科目列表
  SUBJECTS: [
    '國文', '數學', '英文', '自然', '社會',
    '體育', '音樂', '美術', '電腦'
  ],
  
  // Web App 設定
  WEB_APP: {
    TITLE: '班級管理系統',
    VERSION: getVersion(),
    SESSION_TIMEOUT: 3600000 // 1 小時（毫秒）
  },
  
  // TC-API 設定（請依實際部署修改）
  TC_API: {
    BASE_URL: '',                 // 例如：https://tc-api.example.com/api
    SEMESTER_ENDPOINT: '/semester-data',
    API_KEY: '',                  // 若 API 需要權杖，可在此設定
    CACHE_SECONDS: 900,           // 快取 15 分鐘
    REQUEST_TIMEOUT_MS: 10000     // 10 秒逾時
  },
  
  // 安全性設定
  SECURITY: {
    ENABLE_AUTH: true,
    ALLOWED_DOMAINS: ['example.com'], // 允許的 Email 網域
    MAX_LOGIN_ATTEMPTS: 5,
    SESSION_COOKIE_NAME: 'class_mgmt_session'
  },
  
  // tc-api 整合設定
  TC_API: {
    BASE_URL: 'http://localhost:3001/api', // tc-api 後端 URL，部署時需修改為實際網址
    ENDPOINTS: {
      SEMESTER_DATA: '/sync-school', // POST 同步學期資料
      STUDENTS: '/students',         // GET 取得學生列表
      TEACHERS: '/teachers',          // GET 取得教師列表
      CLASSES: '/classes'             // GET 取得班級列表
    },
    TIMEOUT: 30000, // 30 秒超時
    ENABLED: true    // 是否啟用 tc-api 整合
  }
};

// ==================== 欄位索引定義 ====================

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
  CLASS_GRADE: 7,
  CLASS_SEQ: 8,
  CLASS_NAME: 9,
  CLASS_TEACHER: 10
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

// ==================== 安全性函數 ====================

/**
 * 從系統設定表讀取設定值
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
 * 更新系統設定值
 */
function updateSettingValue(key, value) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const settingsSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SETTINGS);
    
    if (!settingsSheet) return false;
    
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
 * 取得教師資訊
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
 * 驗證使用者權限
 * @param {string} userEmail - 使用者 Email
 * @return {boolean} 是否有權限
 */
function verifyUserPermission(userEmail) {
  if (!CONFIG.SECURITY.ENABLE_AUTH) {
    return true;
  }
  
  // 檢查是否為導師
  const teacherInfo = getTeacherInfo();
  if (userEmail === teacherInfo.email) {
    return true;
  }
  
  // 檢查網域
  const domain = userEmail.split('@')[1];
  if (CONFIG.SECURITY.ALLOWED_DOMAINS.includes(domain)) {
    return true;
  }
  
  return false;
}

/**
 * 取得當前使用者資訊
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

// ==================== 工具函數 ====================

/**
 * 產生唯一ID
 */
function generateUniqueId() {
  return Utilities.getUuid();
}

/**
 * 檢查是否為有效的 Email
 */
function isValidEmail(email) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

/**
 * 記錄系統日誌
 */
function logAction(action, detail = '', level = 'INFO') {
  const timestamp = formatDateTimeUTC8(getCurrentTime());
  const userEmail = Session.getActiveUser().getEmail();
  const logMessage = `[${timestamp}] [${level}] [${userEmail}] ${action}: ${detail}`;
  Logger.log(logMessage);
}

/**
 * 產生 API Token（用於安全驗證）
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
 * 驗證 API Token
 */
function verifyApiToken(token, userEmail, maxAge = 3600000) {
  try {
    // 簡化版驗證，實際應用應加強
    return token && token.length > 0;
  } catch (error) {
    Logger.log(`Token 驗證失敗: ${error}`);
    return false;
  }
}

// ==================== 快取管理 ====================

const CACHE_CONFIG = {
  DURATION: {
    SHORT: 300,      // 5 分鐘
    MEDIUM: 1800,    // 30 分鐘
    LONG: 3600       // 1 小時
  }
};

/**
 * 取得快取
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
 * 設定快取
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
 * 清除快取
 */
function clearCache(key) {
  const cache = CacheService.getScriptCache();
  cache.remove(key);
}

/**
 * 清除所有快取
 */
function clearAllCache() {
  const cache = CacheService.getScriptCache();
  cache.removeAll([
    'dashboard_summary',
    'student_list',
    'homework_list'
  ]);
}
