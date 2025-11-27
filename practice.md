## 實戰練習

### 練習 1：繫結式腳本（基礎）

**任務：** 建立一個天氣查詢試算表

1. 建立新試算表
2. 從試算表內開啟 Apps Script
3. 貼上繫結式腳本程式碼
4. 測試自訂選單功能

**預期結果：**
- 看到自訂選單
- 可透過選單更新天氣
- 有 UI 提示訊息

#### 程式碼範例

```javascript
/**
 * ==========================================
 * 繫結式腳本版本 - 天氣資料抓取工具
 * ==========================================
 * 此腳本依附於當前試算表，可直接使用 getActiveSpreadsheet()
 */

/**
 * 當試算表開啟時自動執行，建立自訂選單
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('天氣工具')
    .addItem('更新天氣資料', 'fetchWeatherDataBound')
    .addItem('設定 API Key', 'setupCWAApiKeyWithUI')
    .addItem('清除資料', 'clearWeatherData')
    .addSeparator()
    .addItem('除錯 API', 'debugAPIResponse')
    .addItem('使用說明', 'showHelp')
    .addToUi();
  
  Logger.log('自訂選單已建立');
}

/**
 * 安全的日期格式化函式
 */
function formatDate(date) {
  try {
    if (!date || isNaN(date.getTime())) {
      return '日期無效';
    }
    const timezone = Session.getScriptTimeZone();
    return Utilities.formatDate(date, timezone, 'yyyy/MM/dd HH:mm:ss');
  } catch (e) {
    return '無法格式化日期';
  }
}

/**
 * 設定 API Key（帶 UI）
 */
function setupCWAApiKeyWithUI() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.prompt(
    '設定中央氣象署 API Key',
    '請輸入您的 API Key (格式: CWA-XXXXXXXX-...)：',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() == ui.Button.OK) {
    const apiKey = response.getResponseText().trim();
    
    if (apiKey && apiKey.startsWith('CWA-')) {
      PropertiesService.getScriptProperties().setProperty('CWA_API_KEY', apiKey);
      ui.alert('API Key 已成功儲存！', ui.ButtonSet.OK);
      Logger.log('API Key 已儲存');
    } else {
      ui.alert('API Key 格式不正確', '請確認格式為: CWA-XXXXXXXX-...', ui.ButtonSet.OK);
    }
  }
}

/**
 * 取得 API Key
 */
function getCWAApiKey() {
  return PropertiesService.getScriptProperties().getProperty('CWA_API_KEY');
}

/**
 * 主函式：取得天氣資料並寫入試算表（繫結式版本）
 * 可以使用 getActiveSpreadsheet()
 * 可以使用 getUi()
 */
function fetchWeatherDataBound() {
  const ui = SpreadsheetApp.getUi();
  
  // 繫結式腳本可以直接使用 getActiveSpreadsheet()
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("天氣預報") || ss.insertSheet("天氣預報");

  try {
    // 1. 取得 API Key
    const apiKey = getCWAApiKey();
    if (!apiKey) {
      ui.alert('找不到 API Key', '請先執行「設定 API Key」', ui.ButtonSet.OK);
      return;
    }

    // 2. 組合 API 端點 URL
    const baseUrl = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';
    const params = {
      'Authorization': apiKey,
      'format': 'JSON'
    };
    const queryString = Object.keys(params)
      .map(k => `${k}=${encodeURIComponent(params[k])}`)
      .join('&');
    const url = `${baseUrl}?${queryString}`;

    Logger.log('正在呼叫 API...');

    // 3. 使用 UrlFetchApp 發出 GET 請求
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true
    });

    // 4. 檢查 HTTP 狀態碼
    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      throw new Error(`API 請求失敗 (狀態碼: ${statusCode})`);
    }

    // 5. 取得回應內容並解析 JSON 字串
    const jsonString = response.getContentText();
    const data = JSON.parse(jsonString);

    // 6. 驗證資料結構
    if (!data.success || !data.records || !data.records.location) {
      throw new Error('API 資料格式不符');
    }

    // 7. 整理資料
    const locations = data.records.location;
    const outputData = [];

    outputData.push([
      '縣市', '天氣現象', '最低溫 (°C)', '最高溫 (°C)', 
      '舒適度', '降雨機率 (%)', '資料更新時間'
    ]);

    // 日期處理
    let updateTime;
    try {
      const dateString = data.records.datasetDescription?.update 
                      || data.records.datasetDescription?.updateTime;
      updateTime = dateString ? new Date(dateString) : new Date();
      if (isNaN(updateTime.getTime())) {
        updateTime = new Date();
      }
    } catch (e) {
      updateTime = new Date();
    }

    locations.forEach(location => {
      const locationName = location.locationName;
      const weatherElements = location.weatherElement;

      const wxElement = weatherElements.find(el => el.elementName === 'Wx');
      const minTElement = weatherElements.find(el => el.elementName === 'MinT');
      const maxTElement = weatherElements.find(el => el.elementName === 'MaxT');
      const ciElement = weatherElements.find(el => el.elementName === 'CI');
      const popElement = weatherElements.find(el => el.elementName === 'PoP');

      const wx = wxElement ? wxElement.time[0].parameter.parameterName : 'N/A';
      const minT = minTElement ? minTElement.time[0].parameter.parameterName : 'N/A';
      const maxT = maxTElement ? maxTElement.time[0].parameter.parameterName : 'N/A';
      const ci = ciElement ? ciElement.time[0].parameter.parameterName : 'N/A';
      const pop = popElement ? popElement.time[0].parameter.parameterName : 'N/A';

      outputData.push([locationName, wx, minT, maxT, ci, pop, updateTime]);
    });

    // 8. 寫入試算表
    sheet.clear();
    sheet.getRange(1, 1, outputData.length, outputData[0].length).setValues(outputData);

    // 9. 美化試算表
    const headerRange = sheet.getRange(1, 1, 1, outputData[0].length);
    headerRange.setBackground('#4285F4')
               .setFontColor('#FFFFFF')
               .setFontWeight('bold')
               .setHorizontalAlignment('center');

    sheet.autoResizeColumns(1, outputData[0].length);
    sheet.setFrozenRows(1);
    
    if (outputData.length > 1) {
      const dateColumn = sheet.getRange(2, 7, outputData.length - 1, 1);
      dateColumn.setNumberFormat('yyyy/mm/dd hh:mm:ss');
    }

    // 繫結式腳本可以使用 UI
    ui.alert(
      '天氣資料已成功更新！',
      `共取得 ${locations.length} 個縣市的天氣預報\n資料更新時間: ${formatDate(updateTime)}`,
      ui.ButtonSet.OK
    );

    Logger.log(`成功寫入 ${locations.length} 筆資料`);

  } catch (e) {
    // 繫結式腳本可以使用 UI 顯示錯誤
    ui.alert(
      '執行失敗',
      `錯誤訊息: ${e.message}\n\n請查看執行記錄以了解詳情。`,
      ui.ButtonSet.OK
    );
    Logger.log("錯誤: " + e.toString());
    Logger.log("堆疊: " + e.stack);
  }
}

/**
 * 清除天氣資料
 */
function clearWeatherData() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("天氣預報");
  
  if (!sheet) {
    ui.alert('找不到「天氣預報」工作表');
    return;
  }
  
  const response = ui.alert(
    '確認清除',
    '確定要清除「天氣預報」工作表的所有資料嗎？',
    ui.ButtonSet.YES_NO
  );
  
  if (response == ui.Button.YES) {
    sheet.clear();
    ui.alert('資料已清除');
    Logger.log('天氣預報資料已清除');
  }
}

/**
 * 除錯函式
 */
function debugAPIResponse() {
  const ui = SpreadsheetApp.getUi();
  const apiKey = getCWAApiKey();
  
  if (!apiKey) {
    ui.alert('請先設定 API Key');
    return;
  }

  const baseUrl = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';
  const url = `${baseUrl}?Authorization=${apiKey}&format=JSON`;

  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    Logger.log('=== API 回應結構 ===');
    Logger.log('success: ' + data.success);
    Logger.log('records 存在: ' + (data.records ? 'Yes' : 'No'));
    
    if (data.records && data.records.datasetDescription) {
      Logger.log('\n=== 日期欄位資訊 ===');
      Logger.log(JSON.stringify(data.records.datasetDescription, null, 2));
    }
    
    ui.alert('除錯完成', '請查看「執行記錄」以了解詳情', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('除錯失敗', e.message, ui.ButtonSet.OK);
    Logger.log('錯誤: ' + e.toString());
  }
}

/**
 * 顯示使用說明
 */
function showHelp() {
  const ui = SpreadsheetApp.getUi();
  const helpText = 
    '繫結式腳本使用說明\n\n' +
    '特色：\n' +
    '  • 直接依附在此試算表上\n' +
    '  • 可使用自訂選單\n' +
    '  • 適合單一文件的自動化\n\n' +
    '使用步驟：\n' +
    '1️點擊「設定 API Key」\n' +
    '2️ 點擊「更新天氣資料」\n' +
    '3️ 查看「天氣預報」工作表\n\n' +
    '取得 API Key：\n' +
    ' https://opendata.cwa.gov.tw\n\n' +
    '問題排解：\n' +
    ' 查看「擴充功能 → Apps Script → 執行記錄」';
  
  ui.alert('天氣工具使用說明', helpText, ui.ButtonSet.OK);
}

/**
 * 建立定時觸發器
 */
function createHourlyTrigger() {
  // 刪除現有觸發器
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'fetchWeatherDataBound') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // 建立新觸發器
  ScriptApp.newTrigger('fetchWeatherDataBound')
    .timeBased()
    .everyHours(1)
    .create();
  
  const ui = SpreadsheetApp.getUi();
  ui.alert('已設定每小時自動更新');
  Logger.log('✅ 已設定定時觸發器');
}

#### 部署與執行步驟 (Step-by-Step Guide)

由於這是**繫結式腳本**，它不需要像 Web 應用程式那樣進行傳統的「部署」。它的「部署」過程其實就是將腳本儲存並在試算表中執行。

以下是詳細的逐步指南：

**步驟 1：建立 Google 試算表並開啟 Apps Script**

1.  前往 [Google Sheets](https://sheets.new) 建立一個新的空白試算表。
2.  為您的試算表命名，例如「我的天氣查詢工具」。
3.  點擊頂部選單的「擴充功能」 > 「Apps Script」。
4.  這會在新分頁中開啟 Apps Script 編輯器。您會看到一個預設的 `Code.gs` 檔案。

**步驟 2：貼上並儲存程式碼**

1.  刪除 `Code.gs` 中所有預設的程式碼 (`function myFunction() { ... }`)。
2.  將上方「練習 1」的**完整程式碼範例**複製並貼到編輯器中。
3.  點擊編輯器上方的**儲存專案**圖示 (💾)。
4.  您可以為專案命名，例如「天氣腳本」。

**步驟 3：重新整理試算表並授權腳本**

1.  回到您的 Google 試算表分頁，**重新整理**整個頁面 (按 `F5` 或 `Cmd+R`)。
2.  重新整理後，您應該會在選單欄看到一個新的自訂選單：「**天氣工具**」。
3.  點擊「天氣工具」 > 「設定 API Key」。
4.  **首次執行時，Google 會要求您授權**。這是正常的安全機制。
    *   點擊「需要授權」。
    *   選擇您的 Google 帳戶。
    *   您可能會看到「Google 尚未驗證這個應用程式」的警告。請點擊「進階」，然後選擇「前往『(您的專案名稱)』(不安全)」。
    *   詳閱腳本要求的權限（例如：管理您的試算表），然後點擊「允許」。

**步驟 4：設定 API Key 並執行**

1.  授權完成後，會彈出一個輸入框，提示您「設定中央氣象署 API Key」。
2.  前往 [中央氣象署開放資料平臺](https://opendata.cwa.gov.tw/user/authkey) 登入並取得您的 API 授權碼。
3.  將您的 API Key 貼到輸入框中，然後點擊「確定」。
4.  接著，點擊「天氣工具」 > 「更新天氣資料」。
5.  腳本會開始執行，抓取天氣資料。完成後，會彈出一個成功的提示訊息。

**步驟 5：驗證結果**

1.  腳本執行完畢後，您的試算表中會自動建立一個名為「**天氣預報**」的新工作表。
2.  切換到該工作表，您應該能看到從 API 抓取並整理好的天氣資料。

至此，您已成功「部署」並執行了這個繫結式腳本！

### 練習 2：獨立式腳本（進階）

**任務：** 建立一個可更新多個試算表的工具

1. 前往 script.google.com
2. 建立新專案
3. 貼上獨立式腳本程式碼
4. 設定多個試算表 ID
5. 執行批次更新功能

**預期結果：**
- 可同時更新多個試算表
- 透過 Logger 查看執行結果
- 收到 Email 通知

#### 程式碼範例

```javascript
/**
 * ==========================================
 * 獨立式腳本版本 - 天氣資料抓取工具
 * ==========================================
 * 此腳本獨立存在，需明確指定要操作的試算表
 */

/**
 * 配置區：設定目標試算表
 * 
 * 取得試算表 ID 的方法：
 * 開啟試算表，網址格式為：
 * https://docs.google.com/spreadsheets/d/[試算表ID]/edit
 * 
 * 複製 [試算表ID] 這段文字並貼到下方
 */
const CONFIG = {
  // 方法 1：使用試算表 ID（推薦）
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',
  
  // 方法 2：使用試算表網址（也可以）
  // SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit',
  
  // 工作表名稱
  SHEET_NAME: '天氣預報'
};

/**
 * 安全的日期格式化函式
 */
function formatDate(date) {
  try {
    if (!date || isNaN(date.getTime())) {
      return '日期無效';
    }
    const timezone = Session.getScriptTimeZone();
    return Utilities.formatDate(date, timezone, 'yyyy/MM/dd HH:mm:ss');
  } catch (e) {
    return '無法格式化日期';
  }
}

/**
 * 設定 API Key（獨立式版本）
 */
function setupCWAApiKey() {
  const apiKey = 'CWA-YOUR-ACTUAL-API-KEY'; // 替換成您的 API Key
  PropertiesService.getScriptProperties().setProperty('CWA_API_KEY', apiKey);
  Logger.log('API Key 已安全儲存');
}

/**
 * 取得 API Key
 */
function getCWAApiKey() {
  return PropertiesService.getScriptProperties().getProperty('CWA_API_KEY');
}

/**
 * 取得目標試算表（獨立式腳本必須明確指定）
 */
function getTargetSpreadsheet() {
  try {
    // 方法 1：使用試算表 ID
    if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID_HERE') {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    }
    
    // 方法 2：使用試算表 URL
    if (CONFIG.SPREADSHEET_URL) {
      return SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
    }
    
    // 方法 3：建立新試算表
    Logger.log('未設定試算表 ID，將建立新試算表');
    const newSs = SpreadsheetApp.create('天氣預報_' + new Date().toLocaleDateString('zh-TW'));
    Logger.log('已建立新試算表');
    Logger.log('試算表網址: ' + newSs.getUrl());
    Logger.log('試算表 ID: ' + newSs.getId());
    Logger.log('請將上方 ID 複製到程式碼的 CONFIG.SPREADSHEET_ID');
    return newSs;
    
  } catch (e) {
    Logger.log('無法開啟試算表: ' + e.toString());
    Logger.log('請確認：');
    Logger.log('1. SPREADSHEET_ID 是否正確');
    Logger.log('2. 您是否有該試算表的存取權限');
    throw new Error('無法開啟目標試算表: ' + e.message);
  }
}

/**
 * 主函式：取得天氣資料並寫入試算表（獨立式版本）
 * 不能使用 getActiveSpreadsheet()
 * 不能使用 getUi()
 */
function fetchWeatherDataStandalone() {
  try {
    // 獨立式腳本必須明確指定試算表
    const ss = getTargetSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);

    // 1. 取得 API Key
    const apiKey = getCWAApiKey();
    if (!apiKey) {
      throw new Error('找不到 API Key，請先執行 setupCWAApiKey()');
    }

    // 2. 組合 API 端點 URL
    const baseUrl = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';
    const params = {
      'Authorization': apiKey,
      'format': 'JSON'
    };
    const queryString = Object.keys(params)
      .map(k => `${k}=${encodeURIComponent(params[k])}`)
      .join('&');
    const url = `${baseUrl}?${queryString}`;

    Logger.log('正在呼叫 API...');
    Logger.log('目標試算表: ' + ss.getName());
    Logger.log('目標工作表: ' + sheet.getName());

    // 3. 使用 UrlFetchApp 發出 GET 請求
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true
    });

    // 4. 檢查 HTTP 狀態碼
    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      throw new Error(`API 請求失敗 (狀態碼: ${statusCode})`);
    }

    // 5. 取得回應內容並解析 JSON 字串
    const jsonString = response.getContentText();
    const data = JSON.parse(jsonString);

    // 6. 驗證資料結構
    if (!data.success || !data.records || !data.records.location) {
      throw new Error('API 資料格式不符');
    }

    // 7. 整理資料
    const locations = data.records.location;
    const outputData = [];

    outputData.push([
      '縣市', '天氣現象', '最低溫 (°C)', '最高溫 (°C)', 
      '舒適度', '降雨機率 (%)', '資料更新時間'
    ]);

    // 日期處理
    let updateTime;
    try {
      const dateString = data.records.datasetDescription?.update 
                      || data.records.datasetDescription?.updateTime;
      updateTime = dateString ? new Date(dateString) : new Date();
      if (isNaN(updateTime.getTime())) {
        updateTime = new Date();
      }
    } catch (e) {
      updateTime = new Date();
    }

    locations.forEach(location => {
      const locationName = location.locationName;
      const weatherElements = location.weatherElement;

      const wxElement = weatherElements.find(el => el.elementName === 'Wx');
      const minTElement = weatherElements.find(el => el.elementName === 'MinT');
      const maxTElement = weatherElements.find(el => el.elementName === 'MaxT');
      const ciElement = weatherElements.find(el => el.elementName === 'CI');
      const popElement = weatherElements.find(el => el.elementName === 'PoP');

      const wx = wxElement ? wxElement.time[0].parameter.parameterName : 'N/A';
      const minT = minTElement ? minTElement.time[0].parameter.parameterName : 'N/A';
      const maxT = maxTElement ? maxTElement.time[0].parameter.parameterName : 'N/A';
      const ci = ciElement ? ciElement.time[0].parameter.parameterName : 'N/A';
      const pop = popElement ? popElement.time[0].parameter.parameterName : 'N/A';

      outputData.push([locationName, wx, minT, maxT, ci, pop, updateTime]);
    });

    // 8. 寫入試算表
    sheet.clear();
    sheet.getRange(1, 1, outputData.length, outputData[0].length).setValues(outputData);

    // 9. 美化試算表
    const headerRange = sheet.getRange(1, 1, 1, outputData[0].length);
    headerRange.setBackground('#4285F4')
               .setFontColor('#FFFFFF')
               .setFontWeight('bold')
               .setHorizontalAlignment('center');

    sheet.autoResizeColumns(1, outputData[0].length);
    sheet.setFrozenRows(1);
    
    if (outputData.length > 1) {
      const dateColumn = sheet.getRange(2, 7, outputData.length - 1, 1);
      dateColumn.setNumberFormat('yyyy/mm/dd hh:mm:ss');
    }

    // ❌ 獨立式腳本不能使用 UI，只能用 Logger
    Logger.log('✅ 天氣資料已成功寫入 Google Sheet！');
    Logger.log(`📊 共取得 ${locations.length} 個縣市的天氣預報`);
    Logger.log(`🕒 資料更新時間: ${formatDate(updateTime)}`);
    Logger.log(`📊 試算表網址: ${ss.getUrl()}`);
    Logger.log(`\n✅ 執行完成！請開啟試算表查看結果`);

  } catch (e) {
    Logger.log("❌ 發生錯誤: " + e.toString());
    Logger.log("錯誤堆疊: " + e.stack);
    
    // 可選：發送 Email 通知
    sendErrorEmail(e);
  }
}

/**
 * 發送錯誤通知 Email（獨立式腳本的替代方案）
 */
function sendErrorEmail(error) {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    if (userEmail) {
      GmailApp.sendEmail(
        userEmail,
        '❌ 天氣資料更新失敗',
        `執行時間: ${new Date().toLocaleString('zh-TW')}\n\n` +
        `錯誤訊息: ${error.message}\n\n` +
        `錯誤堆疊:\n${error.stack}\n\n` +
        `請查看 Apps Script 執行記錄以了解詳情。`
      );
      Logger.log('📧 已發送錯誤通知 Email');
    }
  } catch (emailError) {
    Logger.log('⚠️ 無法發送 Email: ' + emailError.toString());
  }
}

/**
 * 批次更新多個試算表（獨立式腳本的優勢）
 */
function batchUpdateMultipleSpreadsheets() {
  const spreadsheetIds = [
    'SPREADSHEET_ID_1',
    'SPREADSHEET_ID_2',
    'SPREADSHEET_ID_3'
  ];
  
  Logger.log('🔄 開始批次更新...');
  
  spreadsheetIds.forEach((id, index) => {
    try {
      Logger.log(`\n處理第 ${index + 1} 個試算表...`);
      
      // 暫時設定目標試算表
      const originalId = CONFIG.SPREADSHEET_ID;
      CONFIG.SPREADSHEET_ID = id;
      
      // 執行更新
      fetchWeatherDataStandalone();
      
      // 恢復原設定
      CONFIG.SPREADSHEET_ID = originalId;
      
      Logger.log(`✅ 第 ${index + 1} 個試算表更新完成`);
      
      // 避免超過配額，稍作延遲
      if (index < spreadsheetIds.length - 1) {
        Utilities.sleep(2000);
      }
      
    } catch (e) {
      Logger.log(`❌ 第 ${index + 1} 個試算表更新失敗: ${e.message}`);
    }
  });
  
  Logger.log('\n✅ 批次更新完成！');
}

/**
 * 除錯函式
 */
function debugAPIResponse() {
  const apiKey = getCWAApiKey();
  
  if (!apiKey) {
    Logger.log('❌ 請先設定 API Key（執行 setupCWAApiKey）');
    return;
  }

  const baseUrl = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';
  const url = `${baseUrl}?Authorization=${apiKey}&format=JSON`;

  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    Logger.log('=== API 回應結構 ===');
    Logger.log('success: ' + data.success);
    Logger.log('records 存在: ' + (data.records ? 'Yes' : 'No'));
    
    if (data.records && data.records.datasetDescription) {
      Logger.log('\n=== 日期欄位資訊 ===');
      Logger.log(JSON.stringify(data.records.datasetDescription, null, 2));
    }
    
    Logger.log('\n✅ 除錯完成');
  } catch (e) {
    Logger.log('❌ 錯誤: ' + e.toString());
  }
}

/**
 * 測試配置（確認試算表可正常開啟）
 */
function testConfiguration() {
  Logger.log('=== 測試配置 ===');
  
  try {
    const ss = getTargetSpreadsheet();
    Logger.log('✅ 成功開啟試算表');
    Logger.log('📊 試算表名稱: ' + ss.getName());
    Logger.log('📋 試算表 ID: ' + ss.getId());
    Logger.log('🔗 試算表網址: ' + ss.getUrl());
    
    const apiKey = getCWAApiKey();
    if (apiKey) {
      Logger.log('✅ API Key 已設定');
    } else {
      Logger.log('⚠️ 尚未設定 API Key');
      Logger.log('請執行 setupCWAApiKey() 函式');
    }
    
    Logger.log('\n✅ 配置測試完成');
  } catch (e) {
    Logger.log('❌ 配置測試失敗: ' + e.toString());
    Logger.log('\n請檢查：');
    Logger.log('1. CONFIG.SPREADSHEET_ID 是否正確');
    Logger.log('2. 您是否有該試算表的存取權限');
  }
}

/**
 * 建立定時觸發器（獨立式版本）
 */
function createHourlyTrigger() {
  // 刪除現有觸發器
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'fetchWeatherDataStandalone') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // 建立新觸發器
  ScriptApp.newTrigger('fetchWeatherDataStandalone')
    .timeBased()
    .everyHours(1)
    .create();
  
  Logger.log('✅ 已設定每小時自動更新');
}
```

### 練習 2：獨立式腳本（進階）

**任務：** 建立一個可更新多個試算表的工具

1. 前往 script.google.com
2. 建立新專案
3. 貼上獨立式腳本程式碼
4. 設定多個試算表 ID
5. 執行批次更新功能

**預期結果：**
- 可同時更新多個試算表
- 透過 Logger 查看執行結果
- 收到 Email 通知

#### 程式碼範例

```javascript
/**
 * ==========================================
 * 獨立式腳本版本 - 天氣資料抓取工具
 * ==========================================
 * 此腳本獨立存在，需明確指定要操作的試算表
 */

/**
 * 配置區：設定目標試算表
 * 
 * 取得試算表 ID 的方法：
 * 開啟試算表，網址格式為：
 * https://docs.google.com/spreadsheets/d/[試算表ID]/edit
 * 
 * 複製 [試算表ID] 這段文字並貼到下方
 */
const CONFIG = {
  // 方法 1：使用試算表 ID（推薦）
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',
  
  // 方法 2：使用試算表網址（也可以）
  // SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit',
  
  // 工作表名稱
  SHEET_NAME: '天氣預報'
};

/**
 * 安全的日期格式化函式
 */
function formatDate(date) {
  try {
    if (!date || isNaN(date.getTime())) {
      return '日期無效';
    }
    const timezone = Session.getScriptTimeZone();
    return Utilities.formatDate(date, timezone, 'yyyy/MM/dd HH:mm:ss');
  } catch (e) {
    return '無法格式化日期';
  }
}

/**
 * 設定 API Key（獨立式版本）
 */
function setupCWAApiKey() {
  const apiKey = 'CWA-YOUR-ACTUAL-API-KEY'; // 替換成您的 API Key
  PropertiesService.getScriptProperties().setProperty('CWA_API_KEY', apiKey);
  Logger.log('API Key 已安全儲存');
}

/**
 * 取得 API Key
 */
function getCWAApiKey() {
  return PropertiesService.getScriptProperties().getProperty('CWA_API_KEY');
}

/**
 * 取得目標試算表（獨立式腳本必須明確指定）
 */
function getTargetSpreadsheet() {
  try {
    // 方法 1：使用試算表 ID
    if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID_HERE') {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    }
    
    // 方法 2：使用試算表 URL
    if (CONFIG.SPREADSHEET_URL) {
      return SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
    }
    
    // 方法 3：建立新試算表
    Logger.log('未設定試算表 ID，將建立新試算表');
    const newSs = SpreadsheetApp.create('天氣預報_' + new Date().toLocaleDateString('zh-TW'));
    Logger.log('已建立新試算表');
    Logger.log('試算表網址: ' + newSs.getUrl());
    Logger.log('試算表 ID: ' + newSs.getId());
    Logger.log('請將上方 ID 複製到程式碼的 CONFIG.SPREADSHEET_ID');
    return newSs;
    
  } catch (e) {
    Logger.log('無法開啟試算表: ' + e.toString());
    Logger.log('請確認：');
    Logger.log('1. SPREADSHEET_ID 是否正確');
    Logger.log('2. 您是否有該試算表的存取權限');
    throw new Error('無法開啟目標試算表: ' + e.message);
  }
}

/**
 * 主函式：取得天氣資料並寫入試算表（獨立式版本）
 * ❌ 不能使用 getActiveSpreadsheet()
 * ❌ 不能使用 getUi()
 */
function fetchWeatherDataStandalone() {
  try {
    // ✅ 獨立式腳本必須明確指定試算表
    const ss = getTargetSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);

    // 1. 取得 API Key
    const apiKey = getCWAApiKey();
    if (!apiKey) {
      throw new Error('找不到 API Key，請先執行 setupCWAApiKey()');
    }

    // 2. 組合 API 端點 URL
    const baseUrl = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';
    const params = {
      'Authorization': apiKey,
      'format': 'JSON'
    };
    const queryString = Object.keys(params)
      .map(k => `${k}=${encodeURIComponent(params[k])}`)
      .join('&');
    const url = `${baseUrl}?${queryString}`;

    Logger.log('📡 正在呼叫 API...');
    Logger.log('🎯 目標試算表: ' + ss.getName());
    Logger.log('📄 目標工作表: ' + sheet.getName());

    // 3. 使用 UrlFetchApp 發出 GET 請求
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true
    });

    // 4. 檢查 HTTP 狀態碼
    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      throw new Error(`API 請求失敗 (狀態碼: ${statusCode})`);
    }

    // 5. 取得回應內容並解析 JSON 字串
    const jsonString = response.getContentText();
    const data = JSON.parse(jsonString);

    // 6. 驗證資料結構
    if (!data.success || !data.records || !data.records.location) {
      throw new Error('API 資料格式不符');
    }

    // 7. 整理資料
    const locations = data.records.location;
    const outputData = [];

    outputData.push([
      '縣市', '天氣現象', '最低溫 (°C)', '最高溫 (°C)', 
      '舒適度', '降雨機率 (%)', '資料更新時間'
    ]);

    // 日期處理
    let updateTime;
    try {
      const dateString = data.records.datasetDescription?.update 
                      || data.records.datasetDescription?.updateTime;
      updateTime = dateString ? new Date(dateString) : new Date();
      if (isNaN(updateTime.getTime())) {
        updateTime = new Date();
      }
    } catch (e) {
      updateTime = new Date();
    }

    locations.forEach(location => {
      const locationName = location.locationName;
      const weatherElements = location.weatherElement;

      const wxElement = weatherElements.find(el => el.elementName === 'Wx');
      const minTElement = weatherElements.find(el => el.elementName === 'MinT');
      const maxTElement = weatherElements.find(el => el.elementName === 'MaxT');
      const ciElement = weatherElements.find(el => el.elementName === 'CI');
      const popElement = weatherElements.find(el => el.elementName === 'PoP');

      const wx = wxElement ? wxElement.time[0].parameter.parameterName : 'N/A';
      const minT = minTElement ? minTElement.time[0].parameter.parameterName : 'N/A';
      const maxT = maxTElement ? maxTElement.time[0].parameter.parameterName : 'N/A';
      const ci = ciElement ? ciElement.time[0].parameter.parameterName : 'N/A';
      const pop = popElement ? popElement.time[0].parameter.parameterName : 'N/A';

      outputData.push([locationName, wx, minT, maxT, ci, pop, updateTime]);
    });

    // 8. 寫入試算表
    sheet.clear();
    sheet.getRange(1, 1, outputData.length, outputData[0].length).setValues(outputData);

    // 9. 美化試算表
    const headerRange = sheet.getRange(1, 1, 1, outputData[0].length);
    headerRange.setBackground('#4285F4')
               .setFontColor('#FFFFFF')
               .setFontWeight('bold')
               .setHorizontalAlignment('center');

    sheet.autoResizeColumns(1, outputData[0].length);
    sheet.setFrozenRows(1);
    
    if (outputData.length > 1) {
      const dateColumn = sheet.getRange(2, 7, outputData.length - 1, 1);
      dateColumn.setNumberFormat('yyyy/mm/dd hh:mm:ss');
    }

    // ❌ 獨立式腳本不能使用 UI，只能用 Logger
    Logger.log('✅ 天氣資料已成功寫入 Google Sheet！');
    Logger.log(`📊 共取得 ${locations.length} 個縣市的天氣預報`);
    Logger.log(`🕒 資料更新時間: ${formatDate(updateTime)}`);
    Logger.log(`📊 試算表網址: ${ss.getUrl()}`);
    Logger.log(`\n✅ 執行完成！請開啟試算表查看結果`);

  } catch (e) {
    Logger.log("❌ 發生錯誤: " + e.toString());
    Logger.log("錯誤堆疊: " + e.stack);
    
    // 可選：發送 Email 通知
    sendErrorEmail(e);
  }
}

/**
 * 發送錯誤通知 Email（獨立式腳本的替代方案）
 */
function sendErrorEmail(error) {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    if (userEmail) {
      GmailApp.sendEmail(
        userEmail,
        '❌ 天氣資料更新失敗',
        `執行時間: ${new Date().toLocaleString('zh-TW')}\n\n` +
        `錯誤訊息: ${error.message}\n\n` +
        `錯誤堆疊:\n${error.stack}\n\n` +
        `請查看 Apps Script 執行記錄以了解詳情。`
      );
      Logger.log('📧 已發送錯誤通知 Email');
    }
  } catch (emailError) {
    Logger.log('⚠️ 無法發送 Email: ' + emailError.toString());
  }
}

/**
 * 批次更新多個試算表（獨立式腳本的優勢）
 */
function batchUpdateMultipleSpreadsheets() {
  const spreadsheetIds = [
    'SPREADSHEET_ID_1',
    'SPREADSHEET_ID_2',
    'SPREADSHEET_ID_3'
  ];
  
  Logger.log('🔄 開始批次更新...');
  
  spreadsheetIds.forEach((id, index) => {
    try {
      Logger.log(`\n處理第 ${index + 1} 個試算表...`);
      
      // 暫時設定目標試算表
      const originalId = CONFIG.SPREADSHEET_ID;
      CONFIG.SPREADSHEET_ID = id;
      
      // 執行更新
      fetchWeatherDataStandalone();
      
      // 恢復原設定
      CONFIG.SPREADSHEET_ID = originalId;
      
      Logger.log(`✅ 第 ${index + 1} 個試算表更新完成`);
      
      // 避免超過配額，稍作延遲
      if (index < spreadsheetIds.length - 1) {
        Utilities.sleep(2000);
      }
      
    } catch (e) {
      Logger.log(`❌ 第 ${index + 1} 個試算表更新失敗: ${e.message}`);
    }
  });
  
  Logger.log('\n✅ 批次更新完成！');
}

/**
 * 除錯函式
 */
function debugAPIResponse() {
  const apiKey = getCWAApiKey();
  
  if (!apiKey) {
    Logger.log('❌ 請先設定 API Key（執行 setupCWAApiKey）');
    return;
  }

  const baseUrl = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';
  const url = `${baseUrl}?Authorization=${apiKey}&format=JSON`;

  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    Logger.log('=== API 回應結構 ===');
    Logger.log('success: ' + data.success);
    Logger.log('records 存在: ' + (data.records ? 'Yes' : 'No'));
    
    if (data.records && data.records.datasetDescription) {
      Logger.log('\n=== 日期欄位資訊 ===');
      Logger.log(JSON.stringify(data.records.datasetDescription, null, 2));
    }
    
    Logger.log('\n✅ 除錯完成');
  } catch (e) {
    Logger.log('❌ 錯誤: ' + e.toString());
  }
}

/**
 * 測試配置（確認試算表可正常開啟）
 */
function testConfiguration() {
  Logger.log('=== 測試配置 ===');
  
  try {
    const ss = getTargetSpreadsheet();
    Logger.log('✅ 成功開啟試算表');
    Logger.log('📊 試算表名稱: ' + ss.getName());
    Logger.log('📋 試算表 ID: ' + ss.getId());
    Logger.log('🔗 試算表網址: ' + ss.getUrl());
    
    const apiKey = getCWAApiKey();
    if (apiKey) {
      Logger.log('✅ API Key 已設定');
    } else {
      Logger.log('⚠️ 尚未設定 API Key');
      Logger.log('請執行 setupCWAApiKey() 函式');
    }
    
    Logger.log('\n✅ 配置測試完成');
  } catch (e) {
    Logger.log('❌ 配置測試失敗: ' + e.toString());
    Logger.log('\n請檢查：');
    Logger.log('1. CONFIG.SPREADSHEET_ID 是否正確');
    Logger.log('2. 您是否有該試算表的存取權限');
  }
}

/**
 * 建立定時觸發器（獨立式版本）
 */
function createHourlyTrigger() {
  // 刪除現有觸發器
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'fetchWeatherDataStandalone') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // 建立新觸發器
  ScriptApp.newTrigger('fetchWeatherDataStandalone')
    .timeBased()
    .everyHours(1)
    .create();
  
  Logger.log('✅ 已設定每小時自動更新');
}
```

### 練習 3：混合應用（挑戰）

**任務：** 建立一個主控台試算表，透過獨立式腳本管理多個分部試算表

1. 建立主控台試算表（繫結式腳本）
2. 建立管理腳本（獨立式腳本）
3. 在主控台設定各分部試算表 ID
4. 透過主控台觸發批次更新

#### 實作說明

這個挑戰需要兩個腳本協同工作：

1.  **管理腳本 (獨立式)**:
    *   這是一個獨立的 Apps Script 專案，負責執行核心的天氣資料抓取邏輯。
    *   它將被發佈為一個**函式庫 (Library)**，以便其他腳本可以重複使用它的功能。
    *   函式庫會提供一個公開的函式，例如 `updateWeatherForSheet(spreadsheetId)`，接收一個試算表 ID 作為參數來執行更新。

2.  **主控台腳本 (繫結式)**:
    *   這個腳本附加在一個「主控台」試算表上。
    *   這個試算表會有一個工作表 (例如 "目標列表") 用來存放所有要更新的分部試算表 ID。
    *   它會提供一個自訂選單，讓使用者可以觸發「批次更新」。
    *   當使用者觸發更新時，它會讀取 "目標列表" 中的所有 ID，然後逐一呼叫**管理腳本函式庫**中的 `updateWeatherForSheet` 函式來完成任務。

#### 程式碼範例

```javascript
/**
 * ==========================================
 * 管理腳本 (獨立式函式庫)
 * ==========================================
 * 這個腳本將被發佈為函式庫，供其他腳本呼叫。
 */

/**
 * 公開的函式：更新指定試算表的天氣資料。
 * @param {string} spreadsheetId 要更新的試算表 ID。
 * @returns {string} 執行結果的摘要訊息。
 */
function updateWeatherForSheet(spreadsheetId) {
  if (!spreadsheetId) {
    return '錯誤：未提供試算表 ID。';
  }

  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName("天氣預報") || ss.insertSheet("天氣預報");

    const apiKey = PropertiesService.getScriptProperties().getProperty('CWA_API_KEY');
    if (!apiKey) {
      // 在函式庫中，我們無法輕易地提示使用者輸入，所以直接拋出錯誤。
      // 可以在主控台腳本中設定 API Key。
      throw new Error('找不到 API Key。請在函式庫專案中設定。');
    }

    const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=${apiKey}&format=JSON`;
    
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      throw new Error(`API 請求失敗 (狀態碼: ${statusCode})`);
    }

    const data = JSON.parse(response.getContentText());
    if (!data.success || !data.records || !data.records.location) {
      throw new Error('API 回應的資料格式不符。');
    }

    const locations = data.records.location;
    const outputData = [];
    outputData.push(['縣市', '天氣現象', '最低溫 (°C)', '最高溫 (°C)', '舒適度', '降雨機率 (%)', '資料更新時間']);

    const updateTime = new Date(data.records.datasetDescription?.update || new Date());

    locations.forEach(location => {
      const weatherElements = location.weatherElement;
      const wx = weatherElements.find(el => el.elementName === 'Wx')?.time[0].parameter.parameterName || 'N/A';
      const minT = weatherElements.find(el => el.elementName === 'MinT')?.time[0].parameter.parameterName || 'N/A';
      const maxT = weatherElements.find(el => el.elementName === 'MaxT')?.time[0].parameter.parameterName || 'N/A';
      const ci = weatherElements.find(el => el.elementName === 'CI')?.time[0].parameter.parameterName || 'N/A';
      const pop = weatherElements.find(el => el.elementName === 'PoP')?.time[0].parameter.parameterName || 'N/A';
      outputData.push([location.locationName, wx, minT, maxT, ci, pop, updateTime]);
    });

    sheet.clear();
    sheet.getRange(1, 1, outputData.length, outputData[0].length).setValues(outputData);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, outputData[0].length);
    sheet.getRange(2, 7, outputData.length - 1, 1).setNumberFormat('yyyy/mm/dd hh:mm:ss');

    Logger.log(`✅ 成功更新試算表 ${spreadsheetId}`);
    return `成功更新 ${locations.length} 筆資料。`;

  } catch (e) {
    Logger.log(`❌ 更新試算表 ${spreadsheetId} 失敗: ${e.message}`);
    return `錯誤: ${e.message}`;
  }
}

/**
 * 讓主控台可以幫助設定此函式庫的 API Key
 */
function setApiKey(apiKey) {
  PropertiesService.getScriptProperties().setProperty('CWA_API_KEY', apiKey);
  Logger.log('✅ API Key 已在函式庫中設定。');
}
```

#### 部署與執行步驟 (Step-by-Step Guide)

這個混合應用模式的部署稍微複雜，因为它涉及到兩個專案的協同工作：一個作為函式庫，另一個作為主控台。

**第一部分：建立並部署 `WeatherManagerLibrary` (獨立式函式庫)**

1.  **建立獨立專案**
    *   前往 [script.google.com](https://script.google.com)。
    *   點擊「+ 新增專案」。
    *   將專案命名為 `WeatherManagerLibrary`。

2.  **貼上程式碼並儲存**
    *   刪除預設的程式碼。
    *   複製上面 `WeatherManagerLibrary 程式碼` 的內容並貼上。
    *   點擊儲存 (💾)。

3.  **部署為函式庫**
    *   點擊右上角的「部署」 > 「新增部署」。
    *   在「選取類型」旁邊，點擊齒輪圖示 (⚙️) 並選擇「**函式庫**」。
    *   輸入一個描述，例如「v1.0 - 初始版本」。
    *   點擊「部署」。

4.  **複製指令碼 ID**
    *   部署成功後，會顯示一個「部署 ID」和「**指令碼 ID**」。
    *   **複製「指令碼 ID」**，我們稍後會用到它。
    *   點擊「完成」。

**第二部分：建立並設定 `天氣更新主控台` (繫結式腳本)**

5.  **建立主控台試算表**
    *   建立一個新的 Google 試算表 ([sheets.new](https://sheets.new))。
    *   將其命名為 `天氣更新主控台`。
    *   在試算表內，將預設的工作表 `工作表1` 重新命名為 `目標列表`。
    *   在 `A1` 儲存格輸入標題 `試算表ID`。
    *   在 `A2`, `A3` 等儲存格中，貼上您想要批次更新天氣的**目標試算表 ID**。您可以先建立幾個空白試算表，然後將它們的 ID 貼在這裡。

6.  **建立繫結式腳本**
    *   在 `天氣更新主控台` 試算表中，點擊「擴充功能」 > 「Apps Script」。
    *   將這個新專案命名為 `主控台腳本`。

7.  **貼上主控台程式碼**
    *   刪除預設程式碼。
    *   複製上面 `主控台腳本程式碼` 的內容並貼上。

8.  **引入函式庫**
    *   在 `主控台腳本` 編輯器的左側選單中，找到「服務」並點擊旁邊的 `+` 按鈕。
    *   在「新增服務」的對話框中，貼上您在**步驟 4** 複製的 `WeatherManagerLibrary` **指令碼 ID**。
    *   點擊「查詢」。
    *   系統會找到您的函式庫。保持預設的識別碼 `WeatherManagerLibrary` 不變。
    *   點擊「新增」。現在，您的主控台腳本就可以呼叫函式庫中的函式了。
    *   儲存專案 (💾)。

**第三部分：執行與授權**

9.  **重新整理主控台**
    *   回到 `天氣更新主控台` 試算表分頁，**重新整理**頁面。
    *   您會看到一個新的自訂選單：「**⚙️ 主控台工具**」。

10. **設定 API Key (透過主控台)**
    *   點擊「⚙️ 主控台工具」 > 「🔑 設定函式庫 API Key」。
    *   **首次執行會要求授權**。請依照指示完成 `主控台腳本` 的授權流程 (包含點擊「進階」和「允許」)。
    *   授權後，會彈出一個輸入框。貼上您的**中央氣象署 API Key**。
    *   點擊「確定」。此時，`主控台腳本` 會呼叫 `WeatherManagerLibrary` 中的 `setApiKey` 函式，將 API Key 安全地儲存在函式庫專案的屬性中。
    *   **注意**：Google 可能會再次要求授權，這次是為了讓 `主控台腳本` 有權限執行 `WeatherManagerLibrary`。請再次允許。

11. **執行批次更新**
    *   點擊「⚙️ 主控台工具」 > 「🔄 執行批次更新」。
    *   腳本會讀取 `目標列表` 中的所有 ID，並逐一呼叫函式庫來更新它們。
    *   執行完成後，會彈出一個「批次更新報告」的對話框，顯示每個試算表的更新結果。

12. **驗證結果**
    *   打開您在 `目標列表` 中設定的任一個試算表。
    *   您應該會看到一個名為「天氣預報」的工作表，裡面已經填滿了最新的天氣資料。

至此，您已成功部署並執行了這個混合應用！這個架構讓您可以集中管理更新邏輯 (在函式庫中)，同時提供一個簡單的 UI (在主控台試算表中) 來觸發複雜的任務。

---

## 總結

- **繫結式腳本**：簡單易用，適合單一文件自動化
- **獨立式腳本**：靈活強大，適合複雜應用

**建議學習路徑：**
1. 從繫結式腳本開始（本課程 Lab 1）
2. 熟悉基本操作後，嘗試獨立式腳本
3. 根據實際需求選擇合適的方式
4. 進階後可混合使用兩種方式

**關鍵記憶點：**
- 繫結式 = 從試算表內開啟 = 可用 UI
- 獨立式 = 從 script.google.com = 需指定 ID
- 選擇取決於您的使用場景