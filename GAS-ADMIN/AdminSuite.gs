/**
 * Project: Admin Management Suite
 * Version: 1.4.2
 * Updated: 2024-05-23 (Timezone UTC+8)
 * Description: Added OAuth Scopes to fix Trigger permissions.
 * * 必要的權限授權 (如果手動執行失敗，請在「服務」中已啟用 Admin SDK)：
 * @OnlyCurrentDoc
 * @include https://www.googleapis.com/auth/script.scriptapp
 */

const APP_VERSION = "1.4.2";
const TZ = "GMT+8";

/**
 * Standard Web App Entry Point
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Domain Admin Suite v' + APP_VERSION)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 解決權限問題：
 * 如果在執行此 function 時遇到「沒有呼叫 ScriptApp.getProjectTriggers 的權限」，
 * 請在 Apps Script 編輯器中「手動執行一次」此 function。
 * 系統會彈出授權視窗，請點選「進階」->「前往 (不安全)」並允許所有權限。
 */
function installTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => {
      if (t.getHandlerFunction() === 'checkDeletionQueue') ScriptApp.deleteTrigger(t);
    });

    ScriptApp.newTrigger('checkDeletionQueue')
      .timeBased()
      .atHour(1)
      .everyDays(1)
      .create();

    return "每日自動刪除觸發器已成功安裝。";
  } catch (e) {
    throw new Error("授權失敗或權限不足：" + e.message);
  }
}

/**
 * 同步現有的停權使用者進入刪除
 */
function syncSuspendedToQueue() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName("Action_Logs") || ss.insertSheet("Action_Logs");

  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(["Action Timestamp", "User Email", "Status", "Scheduled Deletion Date", "Version"]);
  }

  const existingLogs = logSheet.getDataRange().getValues().map(row => row[1]);
  const deletionDate = new Date();
  deletionDate.setMonth(deletionDate.getMonth() + 3);
  const formattedDeletionDate = Utilities.formatDate(deletionDate, TZ, "yyyy-MM-dd");

  let syncedCount = 0;
  let pageToken = null;

  try {
    do {
      const response = AdminDirectory.Users.list({
        customer: 'my_customer',
        query: "isSuspended=true",
        maxResults: 500,
        pageToken: pageToken
      });
      const users = response.users || [];

      users.forEach(user => {
        if (!existingLogs.includes(user.primaryEmail)) {
          logSheet.appendRow([new Date(), user.primaryEmail, "Suspended", formattedDeletionDate, "Sync-" + APP_VERSION]);
          syncedCount++;
        }
      });
      pageToken = response.nextPageToken;
    } while (pageToken);

    return `同步完成。已將 ${syncedCount} 個現有的停權帳號加入 3 個月刪除排程。`;
  } catch (e) {
    throw new Error("同步錯誤: " + e.message);
  }
}

/**
 * 核心功能：掃描 'Action_Logs' 並刪除到期的帳號
 */
function checkDeletionQueue() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName("Action_Logs");
  if (!logSheet) return "找不到紀錄表。";

  const data = logSheet.getDataRange().getValues();
  if (data.length <= 1) return "沒有待處理的紀錄。";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let deletedCount = 0;
  let rows = [data[0]];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = row[1];
    const status = row[2];
    const scheduledDate = new Date(row[3]);

    if (status === "Suspended" && scheduledDate <= today) {
      try {
        AdminDirectory.Users.remove(email);
        row[2] = "Deleted (Auto)";
        row[0] = new Date();
        deletedCount++;
      } catch (e) {
        if (e.message.indexOf("notFound") > -1) row[2] = "Deleted (Manual/Ext)";
      }
    }
    rows.push(row);
  }

  logSheet.getRange(1, 1, rows.length, data[0].length).setValues(rows);
  return `自動清理完成。共刪除 ${deletedCount} 個帳號。`;
}

/**
 * 停權多個使用者並紀錄 3 個月後刪除
 */
function processUserSuspension(emails) {
  if (!emails || emails.length === 0) return "未選擇使用者。";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName("Action_Logs") || ss.insertSheet("Action_Logs");

  const deletionDate = new Date();
  deletionDate.setMonth(deletionDate.getMonth() + 3);
  const formattedDeletionDate = Utilities.formatDate(deletionDate, TZ, "yyyy-MM-dd");

  emails.forEach(email => {
    try {
      AdminDirectory.Users.update({ suspended: true }, email);
      logSheet.appendRow([new Date(), email, "Suspended", formattedDeletionDate, APP_VERSION]);
    } catch (err) {
      console.error("停權失敗: " + email, err);
    }
  });

  return `已停權 ${emails.length} 個使用者。預計刪除日期：${formattedDeletionDate}`;
}

/**
 * 獲取所有組織單位 (OU)
 */
function getDomainOUs() {
  try {
    const response = AdminDirectory.Orgunits.list('my_customer', { type: 'all' });
    const ous = response.organizationUnits || [];
    return ous.map(ou => ou.orgUnitPath).sort();
  } catch (e) { throw new Error("獲取 OU 失敗: " + e.message); }
}

/**
 * 根據 OU 和準則過濾使用者
 */
function getFilteredUsers(ouPath, dateString) {
  let allUsers = [];
  let pageToken = null;
  const cutoffDate = (dateString && dateString !== "NEVER_LOGIN") ? new Date(dateString) : null;

  try {
    do {
      const options = {
        customer: 'my_customer',
        query: ouPath ? `orgUnitPath='${ouPath}'` : "",
        maxResults: 500,
        pageToken: pageToken,
        viewType: 'admin_view'
      };
      const response = AdminDirectory.Users.list(options);
      const users = response.users || [];

      users.forEach(user => {
        const lastLogin = user.lastLoginTime ? new Date(user.lastLoginTime) : null;
        let match = false;

        if (dateString === "NEVER_LOGIN") {
          if (!lastLogin) match = true;
        } else if (!cutoffDate) {
          match = true;
        } else {
          if (lastLogin && lastLogin < cutoffDate) match = true;
        }

        if (match) {
          allUsers.push({
            name: user.name.fullName,
            email: user.primaryEmail,
            lastLogin: lastLogin ? Utilities.formatDate(lastLogin, TZ, "yyyy-MM-dd HH:mm") : "從未登入",
            suspended: user.suspended,
            org: user.orgUnitPath
          });
        }
      });
      pageToken = response.nextPageToken;
    } while (pageToken);
    return allUsers;
  } catch (e) { throw new Error("User API 錯誤: " + e.message); }
}

/**
 * 將使用者移動至目標 OU
 */
function moveUsersToOU(emails, targetOU) {
  emails.forEach(email => {
    try { AdminDirectory.Users.update({ orgUnitPath: targetOU }, email); } catch (err) {}
  });
  return `已將 ${emails.length} 個使用者移動至 ${targetOU}。`;
}

/**
 * 獲取雲端硬碟過期檔案
 */
function getOldFiles(dateString) {
  const rfcDate = dateString + "T00:00:00Z";
  const query = `modifiedDate < '${rfcDate}' and trashed = false`;
  const fileList = [];
  try {
    let response = Drive.Files.list({
      q: query, maxResults: 150, orderBy: "modifiedDate desc",
      supportsAllDrives: true, includeItemsFromAllDrives: true
    });
    if (response.items) {
      response.items.forEach(file => {
        fileList.push({
          id: file.id, name: file.title, owner: file.ownerNames ? file.ownerNames[0] : "共用雲端硬碟項目",
          modified: Utilities.formatDate(new Date(file.modifiedDate), TZ, "yyyy-MM-dd"),
          link: file.alternateLink, isFolder: file.mimeType === "application/vnd.google-apps.folder"
        });
      });
    }
    return fileList;
  } catch (e) { throw new Error("Drive API 錯誤: " + e.message); }
}

/**
 * 批次封存或刪除檔案
 */
function manageFiles(fileIds, action) {
  fileIds.forEach(id => {
    try {
      if (action === 'delete') Drive.Files.remove(id, { supportsAllDrives: true });
      else {
        const file = Drive.Files.get(id, { supportsAllDrives: true });
        Drive.Files.patch({ title: "[ARCHIVED]_" + file.title }, id, { supportsAllDrives: true });
      }
    } catch (e) {}
  });
  return `成功 ${action === 'delete' ? '刪除' : '封存'} ${fileIds.length} 個項目。`;
}