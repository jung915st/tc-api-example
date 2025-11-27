# Lab 1 補充內容：繫結式 vs 獨立式腳本完整範例

## 目錄
- [概念說明](#概念說明)
- [方法 1：繫結式腳本（Bound Script）](#方法-1繫結式腳本bound-script)
- [方法 2：獨立式腳本（Standalone Script）](#方法-2獨立式腳本standalone-script)
- [兩種方式的比較](#兩種方式的比較)
- [選擇建議](#選擇建議)

---

## 概念說明

### 什麼是繫結式腳本？

**繫結式腳本（Bound Script）** 是直接依附在某個 Google 文件（試算表、文件、簡報、表單）下的腳本。

**特點：**
- ✅ 與文件綁定，無法分離
- ✅ 可直接存取所在的文件
- ✅ 可建立自訂選單和 UI
- ✅ 適合單一檔案的自動化

**建立方式：**
1. 開啟 Google 試算表
2. 點擊「擴充功能」→「Apps Script」

### 什麼是獨立式腳本？

**獨立式腳本（Standalone Script）** 是一個獨立的專案，不依附於任何文件。

**特點：**
- ✅ 獨立存在，可操作多個文件
- ✅ 適合開發 Web App
- ✅ 可作為函式庫
- ✅ 需明確指定操作的文件

**建立方式：**
1. 前往 https://script.google.com
2. 點擊「+ 新增專案」

---

## 方法 1：繫結式腳本（Bound Script）

### 📋 使用場景
- 為**特定試算表**建立自動化功能
- 需要自訂選單和 UI 互動
- 團隊共享文件時一起共享腳本

### 🎯 建立步驟

#### 步驟 1：開啟試算表並建立腳本
1. 開啟或建立一個 Google 試算表
2. 點擊「擴充功能」→「Apps Script」
3. 刪除預設的程式碼
4. 貼上下方的完整程式碼

#### 步驟 2：完整程式碼

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
  ui.createMenu('🌤️ 天氣工具')
    .addItem('📥 更新天氣資料', 'fetchWeatherDataBound')
    .addItem('⚙️ 設定 API Key', 'setupCWAApiKeyWithUI')
    .addItem('🗑️ 清除資料', 'clearWeatherData')
    .addSeparator()
    .addItem('🔍 除錯 API', 'debugAPIResponse')
    .addItem('📖 使用說明', 'showHelp')
    .addToUi();
  
  Logger.log('✅ 自訂選單已建立');
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
    '⚙️ 設定中央氣象署 API Key',
    '請輸入您的 API Key (格式: CWA-XXXXXXXX-...)：',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() == ui.Button.OK) {
    const apiKey = response.getResponseText().trim();
    
    if (apiKey && apiKey.startsWith('CWA-')) {
      PropertiesService.getScriptProperties().setProperty('CWA_API_KEY', apiKey);
      ui.alert('✅ API Key 已成功儲存！', ui.ButtonSet.OK);
      Logger.log('✅ API Key 已儲存');
    } else {
      ui.alert('⚠️ API Key 格式不正確', '請確認格式為: CWA-XXXXXXXX-...', ui.ButtonSet.OK);
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
 * ✅ 可以使用 getActiveSpreadsheet()
 * ✅ 可以使用 getUi()
 */
function fetchWeatherDataBound() {
  const ui = SpreadsheetApp.getUi();
  
  // ✅ 繫結式腳本可以直接使用 getActiveSpreadsheet()
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("天氣預報") || ss.insertSheet("天氣預報");

  try {
    // 1. 取得 API Key
    const apiKey = getCWAApiKey();
    if (!apiKey) {
      ui.alert('⚠️ 找不到 API Key', '請先執行「⚙️ 設定 API Key」', ui.ButtonSet.OK);
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

    Logger.log('📡 正在呼叫 API...');

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

    // ✅ 繫結式腳本可以使用 UI
    ui.alert(
      '✅ 天氣資料已成功更新！',
      `共取得 ${locations.length} 個縣市的天氣預報\n資料更新時間: ${formatDate(updateTime)}`,
      ui.ButtonSet.OK
    );

    Logger.log(`✅ 成功寫入 ${locations.length} 筆資料`);

  } catch (e) {
    // ✅ 繫結式腳本可以使用 UI 顯示錯誤
    ui.alert(
      '❌ 執行失敗',
      `錯誤訊息: ${e.message}\n\n請查看執行記錄以了解詳情。`,
      ui.ButtonSet.OK
    );
    Logger.log("❌ 錯誤: " + e.toString());
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
    ui.alert('⚠️ 找不到「天氣預報」工作表');
    return;
  }
  
  const response = ui.alert(
    '確認清除',
    '確定要清除「天氣預報」工作表的所有資料嗎？',
    ui.ButtonSet.YES_NO
  );
  
  if (response == ui.Button.YES) {
    sheet.clear();
    ui.alert('✅ 資料已清除');
    Logger.log('✅ 天氣預報資料已清除');
  }
}

/**
 * 除錯函式
 */
function debugAPIResponse() {
  const ui = SpreadsheetApp.getUi();
  const apiKey = getCWAApiKey();
  
  if (!apiKey) {
    ui.alert('⚠️ 請先設定 API Key');
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
    
    ui.alert('✅ 除錯完成', '請查看「執行記錄」以了解詳情', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ 除錯失敗', e.message, ui.ButtonSet.OK);
    Logger.log('❌ 錯誤: ' + e.toString());
  }
}

/**
 * 顯示使用說明
 */
function showHelp() {
  const ui = SpreadsheetApp.getUi();
  const helpText = 
    '📖 繫結式腳本使用說明\n\n' +
    '🎯 特色：\n' +
    '  • 直接依附在此試算表上\n' +
    '  • 可使用自訂選單\n' +
    '  • 適合單一文件的自動化\n\n' +
    '📝 使用步驟：\n' +
    '1️⃣ 點擊「⚙️ 設定 API Key」\n' +
    '2️⃣ 點擊「📥 更新天氣資料」\n' +
    '3️⃣ 查看「天氣預報」工作表\n\n' +
    '🔗 取得 API Key：\n' +
    '   https://opendata.cwa.gov.tw\n\n' +
    '❓ 問題排解：\n' +
    '   查看「擴充功能 → Apps Script → 執行記錄」';
  
  ui.alert('🌤️ 天氣工具使用說明', helpText, ui.ButtonSet.OK);
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
  ui.alert('✅ 已設定每小時自動更新');
  Logger.log('✅ 已設定定時觸發器');
}
```

#### 步驟 3：執行與測試
1. 重新整理試算表，會看到「🌤️ 天氣工具」選單
2. 點擊「⚙️ 設定 API Key」輸入您的 API Key
3. 點擊「📥 更新天氣資料」
4. 查看「天氣預報」工作表

---

## 方法 2：獨立式腳本（Standalone Script）

### 📋 使用場景
- 需要操作**多個不同的試算表**
- 開發 Web App 應用程式
- 建立可重複使用的函式庫
- 集中管理多個自動化任務

### 🎯 建立步驟

#### 步驟 1：建立獨立腳本
1. 前往 https://script.google.com
2. 點擊「+ 新增專案」
3. 將專案命名為「天氣資料抓取工具（獨立版）」
4. 貼上下方的完整程式碼

#### 步驟 2：完整程式碼

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
  Logger.log('✅ API Key 已安全儲存');
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
    Logger.log('⚠️ 未設定試算表 ID，將建立新試算表');
    const newSs = SpreadsheetApp.create('天氣預報_' + new Date().toLocaleDateString('zh-TW'));
    Logger.log('✅ 已建立新試算表');
    Logger.log('📊 試算表網址: ' + newSs.getUrl());
    Logger.log('📋 試算表 ID: ' + newSs.getId());
    Logger.log('💡 請將上方 ID 複製到程式碼的 CONFIG.SPREADSHEET_ID');
    return newSs;
    
  } catch (e) {
    Logger.log('❌ 無法開啟試算表: ' + e.toString());
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

#### 步驟 3：配置試算表

**選項 1：使用現有試算表**
1. 開啟您要更新的試算表
2. 從網址複製試算表 ID
   ```
   https://docs.google.com/spreadsheets/d/[這段就是ID]/edit
   ```
3. 將 ID 貼到程式碼的 `CONFIG.SPREADSHEET_ID`

**選項 2：建立新試算表**
1. 保持 `CONFIG.SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'`
2. 直接執行 `fetchWeatherDataStandalone()`
3. 查看執行記錄，會顯示新建試算表的網址和 ID
4. 將 ID 更新到程式碼中

#### 步驟 4：執行與測試
1. 執行 `testConfiguration()` 確認配置正確
2. 執行 `setupCWAApiKey()` 設定 API Key
3. 執行 `fetchWeatherDataStandalone()`
4. 查看執行記錄，取得試算表網址
5. 開啟試算表查看結果

---

## 兩種方式的比較

### 功能比較表

| 功能特性 | 繫結式腳本 | 獨立式腳本 |
|---------|-----------|-----------|
| **建立位置** | 從試算表內開啟 | https://script.google.com |
| **getActiveSpreadsheet()** | ✅ 可用 | ❌ 不可用 |
| **getUi()** | ✅ 可用 | ❌ 不可用 |
| **自訂選單** | ✅ 可建立 | ❌ 不可建立 |
| **操作多個試算表** | ❌ 較困難 | ✅ 容易 |
| **Web App 開發** | ⚠️ 可以但不建議 | ✅ 適合 |
| **觸發器** | ✅ 支援 | ✅ 支援 |
| **共享方式** | 與試算表一起共享 | 需單獨授權 |
| **適用場景** | 單一文件自動化 | 多文件、Web App |

### 程式碼差異對照

#### 取得試算表

```javascript
// 繫結式腳本
const ss = SpreadsheetApp.getActiveSpreadsheet();

// 獨立式腳本
const ss = SpreadsheetApp.openById('SPREADSHEET_ID');
// 或
const ss = SpreadsheetApp.openByUrl('SPREADSHEET_URL');
// 或
const ss = SpreadsheetApp.create('新試算表名稱');
```

#### 使用者互動

```javascript
// 繫結式腳本
const ui = SpreadsheetApp.getUi();
ui.alert('訊息');

// 獨立式腳本
Logger.log('訊息');
// 或發送 Email
GmailApp.sendEmail(email, '主旨', '內文');
```

#### 自訂選單

```javascript
// 繫結式腳本
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('選單名稱')
    .addItem('項目', 'functionName')
    .addToUi();
}

// 獨立式腳本
// ❌ 無法建立自訂選單
```

### 優缺點分析

#### 繫結式腳本

**優點 ✅**
- 設定簡單，不需指定試算表 ID
- 可使用自訂選單，使用者體驗好
- 可使用 UI 對話框
- 與試算表一起共享，權限管理簡單
- 適合團隊協作

**缺點 ❌**
- 只能操作綁定的試算表
- 無法建立 Web App（技術上可以但不建議）
- 程式碼與特定文件綁定，重複使用較困難

**適用場景：**
- 為特定試算表建立自動化功能
- 需要自訂選單和 UI 互動
- 團隊共享文件

#### 獨立式腳本

**優點 ✅**
- 可操作多個試算表
- 適合開發 Web App
- 可作為函式庫重複使用
- 集中管理多個自動化任務
- 更靈活

**缺點 ❌**
- 需要明確指定試算表 ID
- 無法使用自訂選單
- 無法使用 UI 對話框
- 權限管理較複雜

**適用場景：**
- 需要更新多個試算表
- 開發 Web App
- 建立可重複使用的工具
- 集中管理自動化任務

---

## 選擇建議

### 🎯 選擇繫結式腳本，如果：

1. ✅ 您只需要處理**一個特定的試算表**
2. ✅ 您希望有**自訂選單**方便操作
3. ✅ 您需要**UI 對話框**與使用者互動
4. ✅ 您要與團隊**共享試算表和腳本**
5. ✅ 您是 **Apps Script 初學者**

**範例場景：**
- 個人財務管理試算表
- 團隊專案進度追蹤
- 班級成績管理系統

### 🚀 選擇獨立式腳本，如果：

1. ✅ 您需要處理**多個不同的試算表**
2. ✅ 您要開發 **Web App** 應用程式
3. ✅ 您需要**集中管理**多個自動化任務
4. ✅ 您要建立**可重複使用**的工具
5. ✅ 您需要**更高的靈活性**

**範例場景：**
- 批次更新多個部門的報表
- 開發面向客戶的 Web 應用
- 建立公司內部的自動化工具庫

---

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

### 練習 3：混合應用（挑戰）

**任務：** 建立一個主控台試算表，透過獨立式腳本管理多個分部試算表

1. 建立主控台試算表（繫結式腳本）
2. 建立管理腳本（獨立式腳本）
3. 在主控台設定各分部試算表 ID
4. 透過主控台觸發批次更新

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