/**
 * WebApp_v1.0.0.gs - Web App 主程式
 * 
 * 版本：v1.0.0
 * 更新日期：2025-11-18
 * 更新內容：初始版本，完整的 Web App 介面
 * 
 * 包含所有 Web App 的路由、認證、頁面渲染
 */

const TC_API_CACHE_KEY = 'tc_semester_data';

// ==================== Web App 進入點 ====================

/**
 * Web App GET 請求處理
 */
function doGet(e) {
  try {
    // 取得當前使用者
    const user = getCurrentUser();
    
    // 驗證權限
    if (!user.hasPermission && CONFIG.SECURITY.ENABLE_AUTH) {
      return renderUnauthorized();
    }
    
    // 路由處理
    const page = e.parameter.page || 'dashboard';
    
    switch (page) {
      case 'dashboard':
        return renderDashboard(user);
      case 'attendance':
        return renderAttendance(user);
      case 'homework':
        return renderHomework(user);
      case 'students':
        return renderStudents(user);
      case 'leave':
        return renderLeave(user);
      default:
        return renderDashboard(user);
    }
  } catch (error) {
    Logger.log(`doGet 錯誤: ${error}`);
    return renderError(error.toString());
  }
}

/**
 * Web App POST 請求處理
 */
function doPost(e) {
  try {
    const user = getCurrentUser();
    
    if (!user.hasPermission && CONFIG.SECURITY.ENABLE_AUTH) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: '無權限'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 解析請求
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;
    
    let result;
    
    switch (action) {
      case 'addAttendance':
        result = handleAddAttendance(postData.data);
        break;
      case 'updateHomeworkStatus':
        result = handleUpdateHomeworkStatus(postData.data);
        break;
      case 'approveLeave':
        result = handleApproveLeave(postData.data);
        break;
      case 'syncSemesterData':
        result = syncSemesterDataFromTcApi();
        break;
      default:
        result = { success: false, error: '未知的操作' };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log(`doPost 錯誤: ${error}`);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==================== 頁面渲染函數 ====================

/**
 * 渲染儀表板頁面
 */
function renderDashboard(user) {
  const template = HtmlService.createTemplateFromFile('Dashboard_v1.0.0');
  template.userEmail = user.email;
  template.version = getVersion();
  template.teacherInfo = getTeacherInfo();
  
  return template.evaluate()
    .setTitle(CONFIG.WEB_APP.TITLE + ' - 儀表板')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 渲染點名頁面
 */
function renderAttendance(user) {
  const template = HtmlService.createTemplateFromFile('Attendance_v1.0.0');
  template.userEmail = user.email;
  template.version = getVersion();
  template.teacherInfo = getTeacherInfo();
  
  return template.evaluate()
    .setTitle(CONFIG.WEB_APP.TITLE + ' - 點名')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 渲染作業管理頁面
 */
function renderHomework(user) {
  const template = HtmlService.createTemplateFromFile('Homework_v1.0.0');
  template.userEmail = user.email;
  template.version = getVersion();
  template.teacherInfo = getTeacherInfo();
  
  return template.evaluate()
    .setTitle(CONFIG.WEB_APP.TITLE + ' - 作業管理')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 渲染學生管理頁面
 */
function renderStudents(user) {
  const template = HtmlService.createTemplateFromFile('Students_v1.0.0');
  template.userEmail = user.email;
  template.version = getVersion();
  template.teacherInfo = getTeacherInfo();
  
  return template.evaluate()
    .setTitle(CONFIG.WEB_APP.TITLE + ' - 學生管理')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 渲染請假管理頁面
 */
function renderLeave(user) {
  const template = HtmlService.createTemplateFromFile('Leave_v1.0.0');
  template.userEmail = user.email;
  template.version = getVersion();
  template.teacherInfo = getTeacherInfo();
  
  return template.evaluate()
    .setTitle(CONFIG.WEB_APP.TITLE + ' - 請假管理')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 渲染無權限頁面
 */
function renderUnauthorized() {
  const template = HtmlService.createTemplateFromFile('Unauthorized_v1.0.0');
  
  return template.evaluate()
    .setTitle('無權限')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 渲染錯誤頁面
 */
function renderError(errorMessage) {
  const template = HtmlService.createTemplateFromFile('Error_v1.0.0');
  template.errorMessage = errorMessage;
  
  return template.evaluate()
    .setTitle('錯誤')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ==================== API 函數（供前端呼叫）====================

/**
 * 取得儀表板資料
 */
function getDashboardData() {
  try {
    // 檢查快取
    const cached = getCache('dashboard_summary');
    if (cached) {
      return cached;
    }
    
    const today = getCurrentTime();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const absenceData = getAbsenceData(yesterday);
    const overdueHomework = getOverdueHomework();
    const pendingLeaves = getPendingLeaves();
    const totalStudents = getTotalStudentsCount();
    const weeklyStats = getWeeklyStats();
    
    let classAttendance = null;
    try {
      classAttendance = getClassAttendanceOverview();
    } catch (overviewError) {
      Logger.log(`取得班級出席統計錯誤: ${overviewError}`);
    }
    
    const data = {
      summary: {
        totalStudents: totalStudents,
        todayAbsence: getTodayAbsenceCount(),
        overdueHomework: overdueHomework.length,
        pendingLeaves: pendingLeaves.length
      },
      absenceList: absenceData,
      homeworkList: overdueHomework,
      leaveList: pendingLeaves,
      weeklyStats: weeklyStats,
      classAttendance: classAttendance,
      teacherInfo: getTeacherInfo(),
      lastUpdate: formatDateTimeUTC8(today)
    };
    
    // 設定快取（5 分鐘）
    setCache('dashboard_summary', data, CACHE_CONFIG.DURATION.SHORT);
    
    return data;
  } catch (error) {
    Logger.log(`取得儀表板資料錯誤: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * 取得學生清單
 */
function getStudentList() {
  try {
    const cached = getCache('student_list');
    if (cached) {
      return cached;
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const studentSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
    
    if (!studentSheet) {
      return { error: '找不到學生資料表' };
    }
    
    const data = studentSheet.getDataRange().getValues();
    const students = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][STUDENT_COLS.SEAT_NUMBER]) {
        students.push({
          seatNumber: data[i][STUDENT_COLS.SEAT_NUMBER],
          name: data[i][STUDENT_COLS.NAME],
          parentName: data[i][STUDENT_COLS.PARENT_NAME],
          parentEmail: data[i][STUDENT_COLS.PARENT_EMAIL],
          parentPhone: data[i][STUDENT_COLS.PARENT_PHONE],
          notes: data[i][STUDENT_COLS.NOTES]
        });
      }
    }
    
    setCache('student_list', students, CACHE_CONFIG.DURATION.MEDIUM);
    
    return students;
  } catch (error) {
    Logger.log(`取得學生清單錯誤: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * 取得學期班級與教師資料（來自 TC-API）
 */
function getSemesterDirectory(options) {
  try {
    return buildSemesterDirectory(options || {});
  } catch (error) {
    Logger.log(`取得學期資料錯誤: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * 取得今日點名資料
 * @param {number} grade - 年級（選填，如果提供則從 tc-api 取得）
 * @param {number} classSeq - 班序（選填，如果提供則從 tc-api 取得）
 */
<<<<<<< Current (Your changes)
function getTodayAttendanceData(grade, classSeq) {
=======
function getTodayAttendanceData(options) {
  const params = options || {};
  const grade = Number(params.grade || 0);
  const classSeq = Number(params.classSeq || 0);
  
  if (grade && classSeq) {
    try {
      return buildClassAttendanceRoster({
        grade: grade,
        classSeq: classSeq,
        className: params.className || '',
        forceRefresh: Boolean(params.forceRefresh)
      });
    } catch (error) {
      Logger.log(`取得班級點名資料錯誤: ${error}`);
      return { error: error.toString() };
    }
  }
  
  return getLegacyAttendanceRoster();
}

/**
 * 舊版：從試算表取得當日點名資料
 */
function getLegacyAttendanceRoster() {
>>>>>>> Incoming (Background Agent changes)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const attendanceSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    
    const today = formatDateTimeUTC8(getCurrentTime(), 'date');
    
    // 如果提供了年級和班序，從 tc-api 取得學生列表
    let students = [];
    if (grade && classSeq && CONFIG.TC_API.ENABLED) {
      const tcStudents = getStudentsByClassFromTcApi(grade, classSeq);
      if (!tcStudents.error) {
        students = tcStudents;
      } else {
        // 如果 tc-api 失敗，回退到本地資料
        students = getStudentList();
      }
    } else {
      // 使用本地學生列表
      students = getStudentList();
    }
    
    if (students.error) {
      return students;
    }
    
    if (!attendanceSheet) {
      return students.map(s => ({
        ...s,
        status: '',
        hasRecord: false
      }));
    }
    
    const data = attendanceSheet.getDataRange().getValues();
    const attendanceMap = {};
    
    for (let i = 1; i < data.length; i++) {
      if (!data[i][ATTENDANCE_COLS.DATE]) continue;
      const recordDate = formatDateTimeUTC8(new Date(data[i][ATTENDANCE_COLS.DATE]), 'date');
      if (recordDate === today) {
        const seatNumber = data[i][ATTENDANCE_COLS.SEAT_NUMBER];
        attendanceMap[seatNumber] = {
          status: data[i][ATTENDANCE_COLS.STATUS],
          notes: data[i][ATTENDANCE_COLS.NOTES]
        };
      }
    }
    
    return students.map(s => ({
      ...s,
      status: attendanceMap[s.seatNumber]?.status || '',
      notes: attendanceMap[s.seatNumber]?.notes || '',
      hasRecord: !!attendanceMap[s.seatNumber]
    }));
  } catch (error) {
    Logger.log(`Legacy 取得點名資料錯誤: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * 取得作業清單
 */
function getHomeworkList() {
  try {
    const cached = getCache('homework_list');
    if (cached) {
      return cached;
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const homeworkSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOMEWORK);
    
    if (!homeworkSheet) {
      return { error: '找不到作業項目表' };
    }
    
    const data = homeworkSheet.getDataRange().getValues();
    const homeworkList = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][HOMEWORK_COLS.HOMEWORK_ID]) {
        homeworkList.push({
          homeworkId: data[i][HOMEWORK_COLS.HOMEWORK_ID],
          announceDate: formatDateTimeUTC8(new Date(data[i][HOMEWORK_COLS.ANNOUNCE_DATE]), 'date'),
          homeworkName: data[i][HOMEWORK_COLS.HOMEWORK_NAME],
          description: data[i][HOMEWORK_COLS.DESCRIPTION],
          dueDate: formatDateTimeUTC8(new Date(data[i][HOMEWORK_COLS.DUE_DATE]), 'date'),
          subject: data[i][HOMEWORK_COLS.SUBJECT],
          creator: data[i][HOMEWORK_COLS.CREATOR]
        });
      }
    }
    
    homeworkList.sort((a, b) => new Date(b.announceDate) - new Date(a.announceDate));
    
    setCache('homework_list', homeworkList, CACHE_CONFIG.DURATION.MEDIUM);
    
    return homeworkList;
  } catch (error) {
    Logger.log(`取得作業清單錯誤: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * 取得作業繳交狀況
 */
function getHomeworkSubmissionStatus(homeworkId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const statusSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOMEWORK_STATUS);
    
    if (!statusSheet) {
      return { error: '找不到作業繳交狀態表' };
    }
    
    const data = statusSheet.getDataRange().getValues();
    const statusList = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][HOMEWORK_STATUS_COLS.HOMEWORK_ID] === homeworkId) {
        statusList.push({
          seatNumber: data[i][HOMEWORK_STATUS_COLS.SEAT_NUMBER],
          name: data[i][HOMEWORK_STATUS_COLS.NAME],
          status: data[i][HOMEWORK_STATUS_COLS.STATUS],
          submitTime: data[i][HOMEWORK_STATUS_COLS.SUBMIT_TIME] ? 
            formatDateTimeUTC8(new Date(data[i][HOMEWORK_STATUS_COLS.SUBMIT_TIME])) : '',
          reminded: data[i][HOMEWORK_STATUS_COLS.REMINDED],
          parentContacted: data[i][HOMEWORK_STATUS_COLS.PARENT_CONTACTED],
          notes: data[i][HOMEWORK_STATUS_COLS.NOTES]
        });
      }
    }
    
    statusList.sort((a, b) => a.seatNumber - b.seatNumber);
    
    return statusList;
  } catch (error) {
    Logger.log(`取得作業繳交狀況錯誤: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * 取得請假清單
 */
function getLeaveList() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const leaveSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE);
    
    if (!leaveSheet) {
      return { error: '找不到請假總表' };
    }
    
    const data = leaveSheet.getDataRange().getValues();
    const leaveList = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][LEAVE_COLS.STUDENT_NAME]) {
        leaveList.push({
          rowIndex: i + 1,
          timestamp: formatDateTimeUTC8(new Date(data[i][LEAVE_COLS.TIMESTAMP])),
          studentName: data[i][LEAVE_COLS.STUDENT_NAME],
          seatNumber: data[i][LEAVE_COLS.SEAT_NUMBER],
          leaveDate: formatDateTimeUTC8(new Date(data[i][LEAVE_COLS.LEAVE_DATE]), 'date'),
          leaveType: data[i][LEAVE_COLS.LEAVE_TYPE],
          reason: data[i][LEAVE_COLS.REASON],
          parentEmail: data[i][LEAVE_COLS.PARENT_EMAIL],
          approvalStatus: data[i][LEAVE_COLS.APPROVAL_STATUS],
          approvalTime: data[i][LEAVE_COLS.APPROVAL_TIME] ? 
            formatDateTimeUTC8(new Date(data[i][LEAVE_COLS.APPROVAL_TIME])) : ''
        });
      }
    }
    
    leaveList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return leaveList;
  } catch (error) {
    Logger.log(`取得請假清單錯誤: ${error}`);
    return { error: error.toString() };
  }
}

// ==================== tc-api 整合函數 ====================

/**
 * 同步學期資料從 tc-api
 * 根據 Swagger API: POST /semester-data
 */
function syncSemesterDataFromTcApi() {
  try {
    if (!CONFIG.TC_API.ENABLED) {
      return { success: false, error: 'tc-api 整合未啟用' };
    }
    
    const url = CONFIG.TC_API.BASE_URL + CONFIG.TC_API.ENDPOINTS.SEMESTER_DATA;
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      timeout: CONFIG.TC_API.TIMEOUT
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    
    if (statusCode !== 200) {
      const errorText = response.getContentText();
      Logger.log(`tc-api 同步失敗 (${statusCode}): ${errorText}`);
      return { 
        success: false, 
        error: `API 請求失敗 (狀態碼: ${statusCode})`,
        details: errorText
      };
    }
    
    const result = JSON.parse(response.getContentText());
    
    // 清除相關快取
    clearCache('student_list');
    clearCache('teacher_list');
    clearCache('class_list');
    clearCache('dashboard_summary');
    
    logAction('同步學期資料', '從 tc-api 同步成功');
    
    return {
      success: true,
      message: '同步完成',
      data: result
    };
  } catch (error) {
    Logger.log(`同步學期資料錯誤: ${error}`);
    return { success: false, error: error.toString() };
  }
}

/**
 * 從 tc-api 取得教師列表
 * 根據 Swagger API: GET /teachers
 */
function getTeachersFromTcApi() {
  try {
    if (!CONFIG.TC_API.ENABLED) {
      return { error: 'tc-api 整合未啟用' };
    }
    
    // 檢查快取
    const cached = getCache('teacher_list_tc');
    if (cached) {
      return cached;
    }
    
    const url = CONFIG.TC_API.BASE_URL + CONFIG.TC_API.ENDPOINTS.TEACHERS;
    
    const options = {
      method: 'get',
      muteHttpExceptions: true,
      timeout: CONFIG.TC_API.TIMEOUT
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    
    if (statusCode !== 200) {
      const errorText = response.getContentText();
      Logger.log(`取得教師列表失敗 (${statusCode}): ${errorText}`);
      return { error: `API 請求失敗 (狀態碼: ${statusCode})` };
    }
    
    const teachers = JSON.parse(response.getContentText());
    
    // 設定快取（30 分鐘）
    setCache('teacher_list_tc', teachers, CACHE_CONFIG.DURATION.MEDIUM);
    
    return teachers;
  } catch (error) {
    Logger.log(`取得教師列表錯誤: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * 從 tc-api 取得班級列表
 * 根據 Swagger API: GET /classes
 */
function getClassesFromTcApi() {
  try {
    if (!CONFIG.TC_API.ENABLED) {
      return { error: 'tc-api 整合未啟用' };
    }
    
    // 檢查快取
    const cached = getCache('class_list_tc');
    if (cached) {
      return cached;
    }
    
    const url = CONFIG.TC_API.BASE_URL + CONFIG.TC_API.ENDPOINTS.CLASSES;
    
    const options = {
      method: 'get',
      muteHttpExceptions: true,
      timeout: CONFIG.TC_API.TIMEOUT
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    
    if (statusCode !== 200) {
      const errorText = response.getContentText();
      Logger.log(`取得班級列表失敗 (${statusCode}): ${errorText}`);
      return { error: `API 請求失敗 (狀態碼: ${statusCode})` };
    }
    
    const classes = JSON.parse(response.getContentText());
    
    // 設定快取（30 分鐘）
    setCache('class_list_tc', classes, CACHE_CONFIG.DURATION.MEDIUM);
    
    return classes;
  } catch (error) {
    Logger.log(`取得班級列表錯誤: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * 從 tc-api 取得指定班級的學生列表
 * 根據 Swagger API: GET /students?grade=X&class_seq=Y
 * @param {number} grade - 年級
 * @param {number} classSeq - 班序
 */
function getStudentsByClassFromTcApi(grade, classSeq) {
  try {
    if (!CONFIG.TC_API.ENABLED) {
      return { error: 'tc-api 整合未啟用' };
    }
    
    if (!grade || !classSeq) {
      return { error: '請提供年級和班序' };
    }
    
    const cacheKey = `students_tc_${grade}_${classSeq}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return cached;
    }
    
    const url = CONFIG.TC_API.BASE_URL + CONFIG.TC_API.ENDPOINTS.STUDENTS + 
                `?grade=${grade}&class_seq=${classSeq}`;
    
    const options = {
      method: 'get',
      muteHttpExceptions: true,
      timeout: CONFIG.TC_API.TIMEOUT
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    
    if (statusCode !== 200) {
      const errorText = response.getContentText();
      Logger.log(`取得學生列表失敗 (${statusCode}): ${errorText}`);
      return { error: `API 請求失敗 (狀態碼: ${statusCode})` };
    }
    
    const students = JSON.parse(response.getContentText());
    
    // 轉換為系統格式
    const formattedStudents = students.map(s => ({
      seatNumber: s.seat_no || s.seatNo,
      name: s.name,
      studentNo: s.student_no || s.studentNo,
      gender: s.gender,
      grade: s.grade,
      className: s.class_name || s.className,
      classSeq: s.class_seq || s.classSeq
    }));
    
    // 設定快取（30 分鐘）
    setCache(cacheKey, formattedStudents, CACHE_CONFIG.DURATION.MEDIUM);
    
    return formattedStudents;
  } catch (error) {
    Logger.log(`取得學生列表錯誤: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * 取得所有班級的出席統計（用於儀表板圖表）
 */
function getAllClassesAttendanceStats() {
  try {
    // 如果 tc-api 未啟用，返回空陣列
    if (!CONFIG.TC_API.ENABLED) {
      return [];
    }
    
    const today = formatDateTimeUTC8(getCurrentTime(), 'date');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const attendanceSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    
    if (!attendanceSheet) {
      return { error: '找不到缺曠記錄表' };
    }
    
    // 先取得所有班級
    const classesData = getClassesFromTcApi();
    if (classesData.error) {
      return { error: classesData.error };
    }
    
    if (!classesData.grades || classesData.grades.length === 0) {
      return [];
    }
    
    const stats = [];
    
    // 取得今日出席記錄
    const data = attendanceSheet.getDataRange().getValues();
    const todayAttendanceMap = {};
    
    for (let i = 1; i < data.length; i++) {
      try {
        const recordDate = formatDateTimeUTC8(new Date(data[i][ATTENDANCE_COLS.DATE]), 'date');
        if (recordDate === today) {
          const seatNumber = data[i][ATTENDANCE_COLS.SEAT_NUMBER];
          const status = data[i][ATTENDANCE_COLS.STATUS];
          if (seatNumber && !todayAttendanceMap[seatNumber]) {
            todayAttendanceMap[seatNumber] = status;
          }
        }
      } catch (e) {
        // 跳過無效的記錄
        continue;
      }
    }
    
    // 統計每個班級
    for (const grade of classesData.grades || []) {
      const classes = classesData.classes[grade] || [];
      
      for (const klass of classes) {
        try {
          const students = getStudentsByClassFromTcApi(grade, klass.班序);
          if (students.error || !Array.isArray(students)) {
            continue;
          }
          
          let present = 0;
          let absent = 0;
          let sick = 0;
          let personal = 0;
          let late = 0;
          let total = students.length;
          
          students.forEach(student => {
            const status = todayAttendanceMap[student.seatNumber];
            if (status === '出席') present++;
            else if (status === '曠課') absent++;
            else if (status === '病假') sick++;
            else if (status === '事假') personal++;
            else if (status === '遲到') late++;
          });
          
          stats.push({
            grade: grade,
            classSeq: klass.班序,
            className: klass.班名,
            total: total,
            present: present,
            absent: absent,
            sick: sick,
            personal: personal,
            late: late,
            attendanceRate: total > 0 ? ((present / total) * 100).toFixed(1) : '0.0'
          });
        } catch (e) {
          Logger.log(`處理班級 ${grade}-${klass.班序} 統計錯誤: ${e}`);
          continue;
        }
      }
    }
    
    return stats;
  } catch (error) {
    Logger.log(`取得班級出席統計錯誤: ${error}`);
    return { error: error.toString() };
  }
}

// ==================== 資料處理函數 ====================

/**
 * 處理新增點名記錄
 */
function handleAddAttendance(attendanceData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const attendanceSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    
    if (!attendanceSheet) {
      return { success: false, error: '找不到缺曠記錄表' };
    }
    
    const classInfo = attendanceData.classInfo || {};
    const grade = Number(classInfo.grade || 0);
    const classSeq = Number(classInfo.classSeq || 0);
    
    if (!grade || !classSeq) {
      return { success: false, error: '缺少班級資訊，請重新選擇班級後再試' };
    }
    
    const user = getCurrentUser();
    const now = getCurrentTime();
    
    // 批次新增點名記錄
    const records = attendanceData.records;
    const rows = [];
    
    for (const record of records) {
      if (record.status && record.status !== '') {
        rows.push([
          now,                    // 日期
          record.seatNumber,      // 座號
          record.name,            // 姓名
          record.status,          // 出席狀態
          now,                    // 記錄時間
          user.email,             // 記錄者
          record.notes || '',     // 備註
          grade,                  // 年級
          classSeq,               // 班序
          classInfo.className || '',    // 班名
          classInfo.teacherName || ''   // 導師
        ]);
      }
    }
    
    if (rows.length > 0) {
      attendanceSheet.getRange(attendanceSheet.getLastRow() + 1, 1, rows.length, 11)
        .setValues(rows);
    }
    
    // 清除快取
    clearCache('dashboard_summary');
    
    logAction('新增點名記錄', `新增 ${rows.length} 筆記錄`);
    
    return {
      success: true,
      message: `成功記錄 ${rows.length} 位學生的出席狀況`,
      count: rows.length
    };
  } catch (error) {
    Logger.log(`新增點名記錄錯誤: ${error}`);
    return { success: false, error: error.toString() };
  }
}

/**
 * 處理更新作業繳交狀態
 */
function handleUpdateHomeworkStatus(statusData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const statusSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOMEWORK_STATUS);
    
    if (!statusSheet) {
      return { success: false, error: '找不到作業繳交狀態表' };
    }
    
    const data = statusSheet.getDataRange().getValues();
    const now = getCurrentTime();
    
    // 找到對應的記錄並更新
    for (let i = 1; i < data.length; i++) {
      if (data[i][HOMEWORK_STATUS_COLS.HOMEWORK_ID] === statusData.homeworkId &&
          data[i][HOMEWORK_STATUS_COLS.SEAT_NUMBER] == statusData.seatNumber) {
        
        statusSheet.getRange(i + 1, HOMEWORK_STATUS_COLS.STATUS + 1)
          .setValue(statusData.status);
        
        if (statusData.status === CONFIG.HOMEWORK_STATUS.SUBMITTED ||
            statusData.status === CONFIG.HOMEWORK_STATUS.LATE_SUBMITTED) {
          statusSheet.getRange(i + 1, HOMEWORK_STATUS_COLS.SUBMIT_TIME + 1)
            .setValue(now);
        }
        
        // 清除快取
        clearCache('dashboard_summary');
        clearCache('homework_list');
        
        logAction('更新作業狀態', `作業ID: ${statusData.homeworkId}, 座號: ${statusData.seatNumber}`);
        
        return { success: true, message: '更新成功' };
      }
    }
    
    return { success: false, error: '找不到對應的記錄' };
  } catch (error) {
    Logger.log(`更新作業狀態錯誤: ${error}`);
    return { success: false, error: error.toString() };
  }
}

/**
 * 處理請假審核
 */
function handleApproveLeave(leaveData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const leaveSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE);
    
    if (!leaveSheet) {
      return { success: false, error: '找不到請假總表' };
    }
    
    const now = getCurrentTime();
    const rowIndex = leaveData.rowIndex;
    
    // 更新審核狀態
    leaveSheet.getRange(rowIndex, LEAVE_COLS.APPROVAL_STATUS + 1)
      .setValue(leaveData.approvalStatus);
    
    leaveSheet.getRange(rowIndex, LEAVE_COLS.APPROVAL_TIME + 1)
      .setValue(now);
    
    // 發送通知郵件（如果啟用）
    if (CONFIG.EMAIL.ENABLED) {
      const row = leaveSheet.getRange(rowIndex, 1, 1, leaveSheet.getLastColumn()).getValues()[0];
      sendApprovalNotification(rowIndex, leaveData.approvalStatus, leaveData.notes || '');
    }
    
    // 清除快取
    clearCache('dashboard_summary');
    
    logAction('審核請假', `列 ${rowIndex}, 狀態: ${leaveData.approvalStatus}`);
    
    return { success: true, message: '審核完成' };
  } catch (error) {
    Logger.log(`審核請假錯誤: ${error}`);
    return { success: false, error: error.toString() };
  }
}

// ==================== TC-API 班級資料與統計 ====================

function buildClassAttendanceRoster(options) {
  const grade = Number(options.grade);
  const classSeq = Number(options.classSeq);
  
  if (!grade || !classSeq) {
    throw new Error('請選擇年級與班級');
  }
  
  const semesterData = fetchSemesterData(Boolean(options.forceRefresh));
  const targetClass = findClassFromSemesterData(semesterData, grade, classSeq);
  
  if (!targetClass) {
    throw new Error('在學期資料中找不到對應班級');
  }
  
  const rawStudents = targetClass['學期編班'] || [];
  const attendanceMap = getTodayAttendanceMapForClass(grade, classSeq);
  
  const students = rawStudents
    .map(stu => {
      const seatNumber = Number(stu['座號']);
      const recorded = attendanceMap[seatNumber] || {};
      return {
        seatNumber: seatNumber,
        name: stu['姓名'],
        studentNo: stu['學號'],
        gender: stu['性別'],
        uid: stu['UID'],
        status: recorded.status || '',
        notes: recorded.notes || '',
        hasRecord: Boolean(attendanceMap[seatNumber])
      };
    })
    .sort((a, b) => a.seatNumber - b.seatNumber);
  
  const teacherName = (targetClass['導師'] && targetClass['導師'][0] && targetClass['導師'][0]['姓名']) || '';
  const metadata = {
    schoolYear: semesterData['學年'] || '',
    semester: semesterData['學期'] || '',
    updatedAt: semesterData['更新時間'] || ''
  };
  
  return {
    students: students,
    classInfo: {
      grade: grade,
      classSeq: classSeq,
      className: targetClass['班名'] || '',
      displayName: formatClassDisplayName(grade, targetClass['班名'], classSeq),
      teacherName: teacherName,
      studentCount: students.length
    },
    metadata: metadata
  };
}

function getClassAttendanceOverview() {
  try {
    const directory = buildSemesterDirectory({});
    if (!directory || !directory.classes) {
      return null;
    }
    
    const today = formatDateTimeUTC8(getCurrentTime(), 'date');
    const records = getAttendanceRecordsByDate(today);
    const grouped = {};
    
    records.forEach(record => {
      if (!record.grade || !record.classSeq) {
        return;
      }
      const key = buildClassKey(record.grade, record.classSeq);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(record);
    });
    
    const classes = directory.classes.map(cls => {
      const key = buildClassKey(cls.grade, cls.classSeq);
      const classRecords = grouped[key] || [];
      const presentCount = classRecords.filter(r => r.status === CONFIG.ATTENDANCE_STATUS.PRESENT).length;
      const absentCount = classRecords.filter(r => r.status && r.status !== CONFIG.ATTENDANCE_STATUS.PRESENT).length;
      const unmarkedCount = Math.max(cls.studentCount - classRecords.length, 0);
      
      return {
        ...cls,
        presentCount: presentCount,
        absentCount: absentCount,
        unmarkedCount: unmarkedCount
      };
    });
    
    return {
      metadata: {
        ...directory.metadata,
        targetDate: today
      },
      classes: classes
    };
  } catch (error) {
    Logger.log(`取得班級出席總覽錯誤: ${error}`);
    return { error: error.toString() };
  }
}

function buildSemesterDirectory(options) {
  const semesterData = fetchSemesterData(Boolean(options.forceRefresh));
  const classesRaw = semesterData['學期編班'] || [];
  const teachersRaw = semesterData['學期教職員'] || [];
  
  const classes = classesRaw
    .map(item => {
      const grade = Number(item['年級']);
      const classSeq = Number(item['班序']);
      const className = item['班名'] || '';
      const studentCount = (item['學期編班'] || []).length;
      const teacherName = (item['導師'] && item['導師'][0] && item['導師'][0]['姓名']) || '';
      
      return {
        grade: grade,
        classSeq: classSeq,
        className: className,
        displayName: formatClassDisplayName(grade, className, classSeq),
        studentCount: studentCount,
        teacherName: teacherName
      };
    })
    .sort((a, b) => (a.grade - b.grade) || (a.classSeq - b.classSeq));
  
  const homeroomMap = {};
  classes.forEach(cls => {
    if (!cls.teacherName) return;
    if (!homeroomMap[cls.teacherName]) {
      homeroomMap[cls.teacherName] = [];
    }
    homeroomMap[cls.teacherName].push(cls.displayName);
  });
  
  const teachers = teachersRaw
    .map(t => ({
      name: t['姓名'],
      uid: t['UID'],
      uid2: t['UID2'],
      office: t['處室'] || '',
      title: t['職稱'] || '',
      subjects: (t['任教科目'] || []).map(sub => ({
        grade: sub['年級'],
        classSeq: sub['班序'],
        subject: sub['科目'],
        hours: sub['時數']
      })),
      homeroomClasses: homeroomMap[t['姓名']] || []
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant-u-co-phonebk'));
  
  return {
    metadata: {
      schoolYear: semesterData['學年'] || '',
      semester: semesterData['學期'] || '',
      updatedAt: semesterData['更新時間'] || ''
    },
    classes: classes,
    teachers: teachers
  };
}

function fetchSemesterData(forceRefresh) {
  if (!CONFIG.TC_API.BASE_URL) {
    throw new Error('尚未設定 TC-API 伺服器網址');
  }
  
  const cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    const cached = cache.get(TC_API_CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (error) {
        cache.remove(TC_API_CACHE_KEY);
      }
    }
  }
  
  const baseUrl = CONFIG.TC_API.BASE_URL.replace(/\/$/, '');
  const endpoint = CONFIG.TC_API.SEMESTER_ENDPOINT || '/semester-data';
  const url = `${baseUrl}${endpoint}`;
  
  const headers = {};
  if (CONFIG.TC_API.API_KEY) {
    headers['x-api-key'] = CONFIG.TC_API.API_KEY;
  }
  
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: headers,
    followRedirects: true,
    validateHttpsCertificates: true
  });
  
  const status = response.getResponseCode();
  if (status >= 300) {
    throw new Error(`TC-API 回傳錯誤 (HTTP ${status})`);
  }
  
  const text = response.getContentText();
  const data = JSON.parse(text);
  
  try {
    if (text && text.length < 90000) {
      cache.put(TC_API_CACHE_KEY, text, CONFIG.TC_API.CACHE_SECONDS);
    }
  } catch (cacheError) {
    Logger.log(`快取 TC-API 資料失敗: ${cacheError}`);
  }
  
  return data;
}

function findClassFromSemesterData(semesterData, grade, classSeq) {
  return (semesterData['學期編班'] || []).find(item => 
    Number(item['年級']) === Number(grade) &&
    Number(item['班序']) === Number(classSeq)
  );
}

function getTodayAttendanceMapForClass(grade, classSeq) {
  const today = formatDateTimeUTC8(getCurrentTime(), 'date');
  const records = getAttendanceRecordsByDate(today);
  const map = {};
  
  records.forEach(record => {
    if (Number(record.grade) === Number(grade) && Number(record.classSeq) === Number(classSeq)) {
      map[record.seatNumber] = {
        status: record.status,
        notes: record.notes
      };
    }
  });
  
  return map;
}

function getAttendanceRecordsByDate(targetDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const attendanceSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
  if (!attendanceSheet) {
    return [];
  }
  
  const data = attendanceSheet.getDataRange().getValues();
  const result = [];
  const dateString = targetDate || formatDateTimeUTC8(getCurrentTime(), 'date');
  
  for (let i = 1; i < data.length; i++) {
    if (!data[i][ATTENDANCE_COLS.DATE]) continue;
    const recordDate = formatDateTimeUTC8(new Date(data[i][ATTENDANCE_COLS.DATE]), 'date');
    if (recordDate !== dateString) continue;
    
    result.push({
      seatNumber: Number(data[i][ATTENDANCE_COLS.SEAT_NUMBER]),
      name: data[i][ATTENDANCE_COLS.NAME],
      status: data[i][ATTENDANCE_COLS.STATUS],
      notes: data[i][ATTENDANCE_COLS.NOTES] || '',
      grade: Number(data[i][ATTENDANCE_COLS.CLASS_GRADE]) || null,
      classSeq: Number(data[i][ATTENDANCE_COLS.CLASS_SEQ]) || null,
      className: data[i][ATTENDANCE_COLS.CLASS_NAME] || '',
      teacherName: data[i][ATTENDANCE_COLS.CLASS_TEACHER] || '',
      recordedAt: data[i][ATTENDANCE_COLS.RECORD_TIME]
    });
  }
  
  return result;
}

function buildClassKey(grade, classSeq) {
  return `${Number(grade)}-${Number(classSeq)}`;
}

function formatClassDisplayName(grade, className, classSeq) {
  const name = className ? `${className}班` : `${classSeq}班`;
  return `${grade}年${name}`;
}

// ==================== 輔助函數 ====================

/**
 * 載入 HTML 檔案內容（用於模組化）
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 取得系統狀態
 */
function getSystemStatus() {
  return {
    version: getVersion(),
    buildDate: VERSION.BUILD_DATE,
    timezone: TIMEZONE_CONFIG.TIMEZONE,
    currentTime: formatDateTimeUTC8(getCurrentTime(), 'full'),
    userEmail: Session.getActiveUser().getEmail()
  };
}
