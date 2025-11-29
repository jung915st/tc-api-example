/**
 * WebApp_v1.2.0.gs - Consolidated Web App with OAuth 2.0 & tc-api Integration
 * 
 * Version: v1.2.0
 * Release Date: 2025-11-29
 * Changes: Consolidated v1.0.0 and v1.1.0, added OAuth 2.0 direct integration, optimized code
 * 
 * Includes all Web App routing, authentication, page rendering, and API functions
 */

// ==================== Web App Entry Points ====================

/**
 * Web App GET request handler
 */
function doGet(e) {
  try {
    const user = getCurrentUser();
    
    if (!user.hasPermission && CONFIG.SECURITY.ENABLE_AUTH) {
      return renderUnauthorized();
    }
    
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
      case 'sync':
        return renderSync(user);
      default:
        return renderDashboard(user);
    }
  } catch (error) {
    Logger.log(`doGet error: ${error}`);
    return renderError(error.toString());
  }
}

/**
 * Web App POST request handler
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
      case 'syncTcApi':
        result = syncFromTcApi();
        break;
      case 'syncSchoolApi':  // NEW: Direct OAuth sync
        result = syncFromSchoolApi();
        break;
      default:
        result = { success: false, error: '未知的操作' };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log(`doPost error: ${error}`);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==================== Page Rendering Functions ====================

/**
 * Render Dashboard page
 */
function renderDashboard(user) {
  const template = HtmlService.createTemplateFromFile('Dashboard_v1.1.0');
  template.userEmail = user.email;
  template.version = getVersion();
  template.teacherInfo = getTeacherInfo();
  
  return template.evaluate()
    .setTitle(CONFIG.WEB_APP.TITLE + ' - 儀表板')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Render Attendance page with teacher-class selection
 */
function renderAttendance(user) {
  const template = HtmlService.createTemplateFromFile('Attendance_v1.1.0');
  template.userEmail = user.email;
  template.version = getVersion();
  template.teacherInfo = getTeacherInfo();
  
  return template.evaluate()
    .setTitle(CONFIG.WEB_APP.TITLE + ' - 點名')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Render Homework management page
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
 * Render Students management page
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
 * Render Leave management page
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
 * Render Sync page
 */
function renderSync(user) {
  const template = HtmlService.createTemplateFromFile('Sync_v1.1.0');
  template.userEmail = user.email;
  template.version = getVersion();
  template.teacherInfo = getTeacherInfo();
  
  return template.evaluate()
    .setTitle(CONFIG.WEB_APP.TITLE + ' - 資料同步')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Render Unauthorized page
 */
function renderUnauthorized() {
  const template = HtmlService.createTemplateFromFile('ErrorPages_v1.0.0');
  template.errorType = 'unauthorized';
  
  return template.evaluate()
    .setTitle('無權限')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Render Error page
 */
function renderError(errorMessage) {
  const template = HtmlService.createTemplateFromFile('ErrorPages_v1.0.0');
  template.errorType = 'error';
  template.errorMessage = errorMessage;
  
  return template.evaluate()
    .setTitle('錯誤')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ==================== API Functions (Called from Frontend) ====================

/**
 * Get dashboard data with real-time attendance charts
 */
function getDashboardData() {
  try {
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
    const attendanceStats = getAttendanceStatsByClass();
    
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
      attendanceStats: attendanceStats,
      teacherInfo: getTeacherInfo(),
      lastUpdate: formatDateTimeUTC8(today)
    };
    
    setCache('dashboard_summary', data, CACHE_CONFIG.DURATION.SHORT);
    
    return data;
  } catch (error) {
    Logger.log(`Get dashboard data error: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * Get attendance statistics by class
 */
function getAttendanceStatsByClass() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const attendanceSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    const classesSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.CLASSES);
    
    if (!attendanceSheet || !classesSheet) {
      return [];
    }
    
    const today = formatDateTimeUTC8(getCurrentTime(), 'date');
    const attendanceData = attendanceSheet.getDataRange().getValues();
    const classesData = classesSheet.getDataRange().getValues();
    
    // Build class attendance map
    const classStats = {};
    
    // Initialize with all classes
    for (let i = 1; i < classesData.length; i++) {
      const grade = classesData[i][CLASS_COLS.GRADE];
      const classSeq = classesData[i][CLASS_COLS.CLASS_SEQ];
      const className = classesData[i][CLASS_COLS.CLASS_NAME];
      const key = `${grade}-${classSeq}`;
      
      classStats[key] = {
        grade: grade,
        classSeq: classSeq,
        className: className,
        total: 0,
        present: 0,
        absent: 0,
        sick: 0,
        personal: 0,
        late: 0
      };
    }
    
    // Count today's attendance
    for (let i = 1; i < attendanceData.length; i++) {
      const recordDate = formatDateTimeUTC8(new Date(attendanceData[i][ATTENDANCE_COLS.DATE]), 'date');
      if (recordDate === today) {
        const grade = attendanceData[i][ATTENDANCE_COLS.GRADE];
        const classSeq = attendanceData[i][ATTENDANCE_COLS.CLASS_SEQ];
        const status = attendanceData[i][ATTENDANCE_COLS.STATUS];
        const key = `${grade}-${classSeq}`;
        
        if (classStats[key]) {
          classStats[key].total++;
          
          switch (status) {
            case CONFIG.ATTENDANCE_STATUS.PRESENT:
              classStats[key].present++;
              break;
            case CONFIG.ATTENDANCE_STATUS.ABSENT:
              classStats[key].absent++;
              break;
            case CONFIG.ATTENDANCE_STATUS.SICK:
              classStats[key].sick++;
              break;
            case CONFIG.ATTENDANCE_STATUS.PERSONAL:
              classStats[key].personal++;
              break;
            case CONFIG.ATTENDANCE_STATUS.LATE:
              classStats[key].late++;
              break;
          }
        }
      }
    }
    
    return Object.values(classStats);
  } catch (error) {
    Logger.log(`Get attendance stats error: ${error}`);
    return [];
  }
}

/**
 * Get teachers list
 */
function getTeachersListForUI() {
  return getTeachersList();
}

/**
 * Get classes list with optional grade filter
 */
function getClassesListForUI(grade = null) {
  return getClassesList(grade);
}

/**
 * Get students by class for attendance
 */
function getStudentsByClassForAttendance(grade, classSeq) {
  try {
    const students = getStudentsByClass(grade, classSeq);
    const today = formatDateTimeUTC8(getCurrentTime(), 'date');
    
    // Get today's attendance records
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const attendanceSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    
    const attendanceMap = {};
    
    if (attendanceSheet && attendanceSheet.getLastRow() > 1) {
      const data = attendanceSheet.getDataRange().getValues();
      
      for (let i = 1; i < data.length; i++) {
        const recordDate = formatDateTimeUTC8(new Date(data[i][ATTENDANCE_COLS.DATE]), 'date');
        const recordGrade = data[i][ATTENDANCE_COLS.GRADE];
        const recordClassSeq = data[i][ATTENDANCE_COLS.CLASS_SEQ];
        const seatNumber = data[i][ATTENDANCE_COLS.SEAT_NUMBER];
        
        if (recordDate === today && recordGrade == grade && recordClassSeq == classSeq) {
          attendanceMap[seatNumber] = {
            status: data[i][ATTENDANCE_COLS.STATUS],
            notes: data[i][ATTENDANCE_COLS.NOTES]
          };
        }
      }
    }
    
    // Merge students with attendance records
    return students.map(s => ({
      ...s,
      status: attendanceMap[s.seat_no]?.status || '',
      notes: attendanceMap[s.seat_no]?.notes || '',
      hasRecord: !!attendanceMap[s.seat_no]
    }));
  } catch (error) {
    Logger.log(`Get students by class for attendance error: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * Get student list
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
    Logger.log(`Get student list error: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * Get today's attendance data
 */
function getTodayAttendanceData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const attendanceSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    
    const today = formatDateTimeUTC8(getCurrentTime(), 'date');
    const students = getStudentList();
    
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
    Logger.log(`Get today attendance data error: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * Get homework list
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
    Logger.log(`Get homework list error: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * Get homework submission status
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
    Logger.log(`Get homework submission status error: ${error}`);
    return { error: error.toString() };
  }
}

/**
 * Get leave list
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
    Logger.log(`Get leave list error: ${error}`);
    return { error: error.toString() };
  }
}

// ==================== Data Processing Functions ====================

/**
 * Handle add attendance record with grade and class
 */
function handleAddAttendance(attendanceData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let attendanceSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    
    if (!attendanceSheet) {
      attendanceSheet = ss.insertSheet(CONFIG.SHEET_NAMES.ATTENDANCE);
      attendanceSheet.appendRow(['日期', '座號', '姓名', '狀態', '記錄時間', '記錄者', '備註', '年級', '班序']);
      attendanceSheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#667eea').setFontColor('white');
    }
    
    const user = getCurrentUser();
    const now = getCurrentTime();
    const records = attendanceData.records;
    const grade = attendanceData.grade;
    const classSeq = attendanceData.classSeq;
    
    const rows = [];
    
    for (const record of records) {
      if (record.status && record.status !== '') {
        rows.push([
          now,                    // 日期
          record.seatNumber || record.seat_no,      // 座號
          record.name,            // 姓名
          record.status,          // 出席狀態
          now,                    // 記錄時間
          user.email,             // 記錄者
          record.notes || '',     // 備註
          grade || '',            // 年級
          classSeq || ''          // 班序
        ]);
      }
    }
    
    if (rows.length > 0) {
      attendanceSheet.getRange(attendanceSheet.getLastRow() + 1, 1, rows.length, 9)
        .setValues(rows);
    }
    
    clearCache('dashboard_summary');
    
    logAction('新增點名記錄', `新增 ${rows.length} 筆記錄 (${grade}-${classSeq})`, 'INFO');
    
    return {
      success: true,
      message: `成功記錄 ${rows.length} 位學生的出席狀況`,
      count: rows.length
    };
  } catch (error) {
    Logger.log(`Add attendance error: ${error}`);
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle update homework status
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
        
        clearCache('dashboard_summary');
        clearCache('homework_list');
        
        logAction('更新作業狀態', `作業ID: ${statusData.homeworkId}, 座號: ${statusData.seatNumber}`, 'INFO');
        
        return { success: true, message: '更新成功' };
      }
    }
    
    return { success: false, error: '找不到對應的記錄' };
  } catch (error) {
    Logger.log(`Update homework status error: ${error}`);
    return { success: false, error: error.toString() };
  }
}

/**
 * Handle leave approval
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
    
    leaveSheet.getRange(rowIndex, LEAVE_COLS.APPROVAL_STATUS + 1)
      .setValue(leaveData.approvalStatus);
    
    leaveSheet.getRange(rowIndex, LEAVE_COLS.APPROVAL_TIME + 1)
      .setValue(now);
    
    if (CONFIG.EMAIL.ENABLED) {
      const row = leaveSheet.getRange(rowIndex, 1, 1, leaveSheet.getLastColumn()).getValues()[0];
      sendApprovalNotification(rowIndex, leaveData.approvalStatus, leaveData.notes || '');
    }
    
    clearCache('dashboard_summary');
    
    logAction('審核請假', `列 ${rowIndex}, 狀態: ${leaveData.approvalStatus}`, 'INFO');
    
    return { success: true, message: '審核完成' };
  } catch (error) {
    Logger.log(`Approve leave error: ${error}`);
    return { success: false, error: error.toString() };
  }
}

// ==================== Helper Functions ====================

/**
 * Include HTML file content (for modularization)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Get system status
 */
function getSystemStatus() {
  return {
    version: getVersion(),
    buildDate: VERSION.BUILD_DATE,
    timezone: TIMEZONE_CONFIG.TIMEZONE,
    currentTime: formatDateTimeUTC8(getCurrentTime(), 'full'),
    userEmail: Session.getActiveUser().getEmail(),
    lastTcApiSync: getSettingValue('last_tc_api_sync') || 'Never',
    lastSchoolApiSync: getSettingValue('last_school_api_sync') || 'Never'
  };
}

// ==================== Helper functions for dashboard ====================

function getAbsenceData(date) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const attendanceSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    
    if (!attendanceSheet) return [];
    
    const data = attendanceSheet.getDataRange().getValues();
    const targetDate = formatDateTimeUTC8(date, 'date');
    const absenceList = [];
    
    for (let i = 1; i < data.length; i++) {
      const recordDate = formatDateTimeUTC8(new Date(data[i][ATTENDANCE_COLS.DATE]), 'date');
      if (recordDate === targetDate) {
        const status = data[i][ATTENDANCE_COLS.STATUS];
        if (status !== CONFIG.ATTENDANCE_STATUS.PRESENT) {
          absenceList.push({
            seatNumber: data[i][ATTENDANCE_COLS.SEAT_NUMBER],
            name: data[i][ATTENDANCE_COLS.NAME],
            status: status,
            notes: data[i][ATTENDANCE_COLS.NOTES] || ''
          });
        }
      }
    }
    
    return absenceList;
  } catch (error) {
    Logger.log(`Get absence data error: ${error}`);
    return [];
  }
}

function getOverdueHomework() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const statusSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOMEWORK_STATUS);
    const homeworkSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOMEWORK);
    
    if (!statusSheet || !homeworkSheet) return [];
    
    const today = formatDateTimeUTC8(getCurrentTime(), 'date');
    const statusData = statusSheet.getDataRange().getValues();
    const homeworkData = homeworkSheet.getDataRange().getValues();
    
    const homeworkMap = {};
    for (let i = 1; i < homeworkData.length; i++) {
      const hwId = homeworkData[i][HOMEWORK_COLS.HOMEWORK_ID];
      homeworkMap[hwId] = {
        name: homeworkData[i][HOMEWORK_COLS.HOMEWORK_NAME],
        dueDate: formatDateTimeUTC8(new Date(homeworkData[i][HOMEWORK_COLS.DUE_DATE]), 'date'),
        subject: homeworkData[i][HOMEWORK_COLS.SUBJECT]
      };
    }
    
    const overdueList = [];
    for (let i = 1; i < statusData.length; i++) {
      const hwId = statusData[i][HOMEWORK_STATUS_COLS.HOMEWORK_ID];
      const status = statusData[i][HOMEWORK_STATUS_COLS.STATUS];
      
      if (homeworkMap[hwId] && homeworkMap[hwId].dueDate < today && status === CONFIG.HOMEWORK_STATUS.NOT_SUBMITTED) {
        overdueList.push({
          seatNumber: statusData[i][HOMEWORK_STATUS_COLS.SEAT_NUMBER],
          studentName: statusData[i][HOMEWORK_STATUS_COLS.NAME],
          homeworkName: homeworkMap[hwId].name,
          subject: homeworkMap[hwId].subject,
          dueDate: homeworkMap[hwId].dueDate
        });
      }
    }
    
    return overdueList;
  } catch (error) {
    Logger.log(`Get overdue homework error: ${error}`);
    return [];
  }
}

function getPendingLeaves() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const leaveSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE);
    
    if (!leaveSheet) return [];
    
    const data = leaveSheet.getDataRange().getValues();
    const pendingList = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][LEAVE_COLS.APPROVAL_STATUS] === CONFIG.APPROVAL_STATUS.PENDING) {
        pendingList.push({
          rowIndex: i + 1,
          studentName: data[i][LEAVE_COLS.STUDENT_NAME],
          seatNumber: data[i][LEAVE_COLS.SEAT_NUMBER],
          leaveDate: formatDateTimeUTC8(new Date(data[i][LEAVE_COLS.LEAVE_DATE]), 'date'),
          leaveType: data[i][LEAVE_COLS.LEAVE_TYPE],
          reason: data[i][LEAVE_COLS.REASON]
        });
      }
    }
    
    return pendingList;
  } catch (error) {
    Logger.log(`Get pending leaves error: ${error}`);
    return [];
  }
}

function getTotalStudentsCount() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const studentsSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.CLASS_STUDENTS);
    
    if (!studentsSheet) {
      const oldStudentsSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
      return oldStudentsSheet ? oldStudentsSheet.getLastRow() - 1 : 0;
    }
    
    return studentsSheet.getLastRow() - 1;
  } catch (error) {
    return 0;
  }
}

function getTodayAbsenceCount() {
  try {
    const today = getCurrentTime();
    const absenceList = getAbsenceData(today);
    return absenceList.length;
  } catch (error) {
    return 0;
  }
}

function getWeeklyStats() {
  // Placeholder for weekly statistics
  return {
    totalDays: 5,
    totalAttendance: 0,
    totalAbsence: 0
  };
}

function sendApprovalNotification(rowIndex, approvalStatus, notes) {
  // Placeholder for email notification
  // Implement using MailApp if needed
  logAction('發送審核通知', `列 ${rowIndex}, 狀態: ${approvalStatus}`, 'INFO');
}

