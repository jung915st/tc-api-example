// HiTeach & Wordwall 授權自動分配系統
// 版本 v2.1
// 更新：增加防呆機制，避免手動執行時產生錯誤。增加日誌紀錄方便除錯。

// === 全域設定 ===
// 修改為試算表分頁名稱
const RESPONSE_SHEET_NAME = "表單回應 1"; // 接收表單回應的分頁名稱
const LICENSE_SHEET_NAME = "序號列表";   // 存放 Hiteach 序號的分頁名稱
const ADMIN_EMAIL = "lres@mail.lres.tc.edu.tw"; // 當 Hiteach 序號發完時，通知管理員的信箱

function onFormSubmit(e) {
  // --- [新增] 錯誤預防與除錯機制 ---
  // 檢查事件物件 e 是否存在。如果不存在，代表是手動執行，而非由表單提交觸發。
  if (!e || !e.namedValues) {
    Logger.log("此函式應由 Google 表單提交觸發，請勿手動執行。");
    // 可以選擇在這裡彈出提示，方便在試算表內測試時得知結果
    // SpreadsheetApp.getUi().alert("此函式應由 Google 表單提交觸發，請勿手動執行。");
    return; // 直接結束函式
  }

  // 記錄收到的表單資料，方便除錯
  Logger.log("收到新的表單提交，資料如下：");
  Logger.log(JSON.stringify(e.namedValues, null, 2));

  // 獲取表單提交的資料
  const formResponse = e.namedValues;
  
  // 從表單回應中讀取申請的軟體名稱
  // 注意：'申請的軟體名稱' 必須與 Google 表單上的問題完全相同
  const softwareAppliedFor = formResponse['您要申請的軟體授權'][0];

  // 檢查使用者是否申請了 Hiteach，如果沒有，就直接結束程式
  if (!softwareAppliedFor.includes('Hiteach')) {
    Logger.log("使用者未申請 Hiteach，程式結束。");
    return; // 提前結束函式，不執行後續的序號分配
  }

  // --- 如果使用者申請了 Hiteach，才繼續執行以下程式 ---
  Logger.log("使用者已申請 Hiteach，開始分配序號...");

  // 鎖定服務，避免多人同時提交表單導致重複分配同一個序號
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // 等待最多30秒

  try {
    // !!重要!! 請確保以下 '' 中的文字與表單上的問題「完全一致」
    const applicantName = formResponse['您的大名'][0].trim();
    const applicantEmail = formResponse['您的常用email信箱'][0].trim();

    // 連接試算表與分頁
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const licenseSheet = ss.getSheetByName(LICENSE_SHEET_NAME);
    const responseSheet = ss.getSheetByName(RESPONSE_SHEET_NAME);
    
    // 獲取序號列表的所有資料
    const licenseDataRange = licenseSheet.getRange(2, 1, licenseSheet.getLastRow() - 1, 3);
    const licenseData = licenseDataRange.getValues();

    let assignedKey = null;
    let keyRowIndex = -1; // 紀錄是第幾行被分配了

    // 尋找第一個可用的序號
    for (let i = 0; i < licenseData.length; i++) {
      if (licenseData[i][1] === '') { 
        assignedKey = licenseData[i][0];
        keyRowIndex = i + 2; 
        break;
      }
    }

    // 根據是否有可用序號，執行不同動作
    if (assignedKey) {
      Logger.log(`找到可用序號: ${assignedKey}，準備分配給 ${applicantEmail}`);
      // 如果找到可用序號
      const timestamp = new Date();
      
      // 1. 在 "序號列表" 分頁中標記使用者資訊
      licenseSheet.getRange(keyRowIndex, 2).setValue(applicantEmail); // 寫入Email
      licenseSheet.getRange(keyRowIndex, 3).setValue(timestamp);    // 寫入時間

      // 2. 在 "表單回應" 分頁中追加一欄，紀錄分配的序號
      const lastRow = responseSheet.getLastRow();
      const headers = responseSheet.getRange(1, 1, 1, responseSheet.getLastColumn()).getValues()[0];
      let assignedKeyColumn = headers.indexOf("已分配Hiteach序號") + 1;
      if (assignedKeyColumn === 0) {
        responseSheet.getRange(1, responseSheet.getLastColumn() + 1).setValue("已分配Hiteach序號");
        assignedKeyColumn = responseSheet.getLastColumn();
      }
      responseSheet.getRange(lastRow, assignedKeyColumn).setValue(assignedKey);

      // 3. 寄送成功通知信給申請者
      const subject = "【成功】HiTeach 智慧教學系統授權序號已分配";
      const body = `
        <p>親愛的 ${applicantName} 老師，您好：</p>
        <p>您已成功申請 HiTeach 智慧教學系統的授權序號。</p>
        <p>您的專屬序號為：<b>${assignedKey}</b></p>
        <p>請妥善保管此序號，並依照軟體指示進行啟用。</p>
        <br>
        <p>臺中市北區立人國民小學 資訊組 敬上</p>
        <p style="color: grey; font-size: 12px;">此為系統自動發送信件，請勿直接回覆。</p>
      `;
      MailApp.sendEmail({
        to: applicantEmail,
        subject: subject,
        htmlBody: body
      });
      Logger.log("成功信件已寄出。");

    } else {
      // 如果找不到可用序號
      Logger.log("所有序號已分配完畢，準備寄送配額不足通知。");
      const subject = "【失敗】HiTeach 授權序號申請 - 目前無可用序號";
      const body = `
        <p>親愛的 ${applicantName} 老師，您好：</p>
        <p>非常抱歉，您本次申請的 HiTeach 智慧教學系統授權序號，目前已全數分配完畢。</p>
        <p>若有使用需求，請洽詢資訊組長了解詳情。</p>
        <br>
        <p>臺中市北區立人國民小學 資訊組 敬上</p>
        <p style="color: grey; font-size: 12px;">此為系統自動發送信件，請勿直接回覆。</p>
      `;
      MailApp.sendEmail({
        to: applicantEmail,
        subject: subject,
        htmlBody: body
      });
      
      // 寄信通知管理員序號已用罄
      MailApp.sendEmail(ADMIN_EMAIL, "【系統通知】HiTeach 授權序號已全數發放完畢", `HiTeach 授權序號已於 ${new Date()} 全數發放完畢。最後一位申請 HiTeach 的老師為 ${applicantName} (${applicantEmail})。`);
      Logger.log("配額不足信件與管理員通知已寄出。");
    }

  } catch (error) {
    // 發生錯誤時，寄信通知管理員
    Logger.log("發生未預期的錯誤：");
    Logger.log(error.toString());
    MailApp.sendEmail(ADMIN_EMAIL, "【錯誤】HiTeach 序號分配系統發生錯誤", error.toString());
  
  } finally {
    // 釋放鎖定
    lock.releaseLock();
    Logger.log("程式執行完畢，釋放鎖定。");
  }
}

