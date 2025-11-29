# **Google Apps Script 進階 API 應用研習**

## **Part 1: 課程介紹與環境準備**

- **課程目標與成果預覽**
- **GAS 基礎回顧：**
  - **1-1 繫結式 (Bound) 與獨立式 (Standalone) 腳本**
    - **繫結式腳本 (Bound Script):**
      - **說明：** 直接依附在某個 Google 文件（試算表、文件、簡報、表單）下的腳本。它與該文件共生，無法分離。
      - **優點：** 容易取得並操作其所在的檔案，例如 SpreadsheetApp.getActiveSpreadsheet() 可以直接抓到當前的試算表。適合針對單一檔案進行自動化。
      - **建立方式：** 在 Google 試算表、文件等應用程式中，點擊 擴充功能 \> Apps Script。
      - **範例程式碼 (在試算表中)：**  
        function getSheetName() {  
         // 直接取得目前所在的試算表檔案名稱  
         var sheetName \= SpreadsheetApp.getActiveSpreadsheet().getName();  
         Logger.log("這份試算表的名稱是: " \+ sheetName);  
        }

    - **獨立式腳本 (Standalone Script):**
      - **說明：** 一個獨立的專案，不依附於任何特定文件，就像 Google Drive 中的一個獨立檔案。
      - **優點：** 適合用來開發網頁應用 (Web App)、操作多個不同檔案，或是作為一個集中管理的公用函式庫。
      - **建立方式：** 前往 [Apps Script 儀表板](https://script.google.com) 點擊 \+ 新增專案。
      - **範例程式碼：**  
        function createNewDoc() {  
         // 獨立腳本需要明確指定要操作的檔案，例如建立一個新檔案  
         var doc \= DocumentApp.create('一份新的文件');  
         Logger.log("已建立新文件，ID為: " \+ doc.getId());  
        }

  - **1-2 JSON 格式與 JS 物件的關係**
    - **說明：** JSON (JavaScript Object Notation) 是一種輕量級的資料交換格式，其語法基本上就是 JavaScript 物件的語法子集。在串接 API 時，伺服器回傳的資料幾乎都是 JSON 格式的**文字字串**。我們需要將這個字串轉換成 JavaScript 可以操作的**物件**。
    - JSON.parse(): 將 JSON 格式的**文字字串**轉換成 JavaScript **物件**。
    - JSON.stringify(): 將 JavaScript **物件**轉換成 JSON 格式的**文字字串** (常用於 POST 請求的 payload)。
    - **範例程式碼：**  
      function demoJSON() {  
       // 1\. 假設這是從 API 收到的 JSON "文字字串"  
       var jsonString \= '{"name":"王大明", "id":"S001", "courses":\["國文", "英文"\], "isActive":true}';

      // 2\. 使用 JSON.parse() 將字串轉換成 JS 物件  
       var studentObject \= JSON.parse(jsonString);

      // 現在可以像操作一般物件一樣存取資料  
       Logger.log(studentObject.name); // 輸出: 王大明  
       Logger.log(studentObject.courses\[1\]); // 輸出: 英文

      // 3\. 反向操作：將 JS 物件轉換回 JSON 字串  
       var jsonOutputString \= JSON.stringify(studentObject, null, 2); // null, 2 是為了美化排版  
       Logger.log(jsonOutputString);  
      }

  - **1-3 開啟 appsscript.json 顯示設定**
    - **說明：** appsscript.json 是一個清單檔案 (Manifest file)，用來設定專案的核心屬性，例如所需的 API 權限範圍 (OAuth Scopes)、時區、進階服務等。在後續課程中，我們需要手動編輯此檔案來啟用 Admin SDK API。
    - **設定步驟：**
      1. 在 Apps Script 編輯器左側，點擊 **「專案設定」** (齒輪圖示 ⚙️)。
      2. 在「一般設定」區塊中，勾選 **「在編輯器中顯示 Manifest 檔案『appsscript.json』」**。
      3. 回到 **「編輯器」** 頁面 ( \<\> 圖示)，就會看到 appsscript.json 檔案出現在檔案清單中。

- **實作：** 建立 GAS 專案與環境確認

##

## **Part 2: Web API 核心概念**

- **2-1. 什麼是 API？生活化比喻**
  - **API (Application Programming Interface, 應用程式介面)** 就像是應用程式之間的「服務生」或「點餐櫃檯」。
  - **比喻：**
    - **你 (客戶):** 你的 Apps Script 程式。
    - **餐廳廚房 (後端伺服器):** 擁有資料和功能的遠端服務 (例如：氣象局資料庫)。
    - **菜單 (API 文件):** 告訴你廚房能提供哪些菜色 (資料)、點餐的格式是什麼 (呼叫規則)。
    - **服務生 (API):** 你按照菜單格式向服務生點餐 (發出 API 請求)，服務生將你的需求轉告廚房，然後將做好的菜 (資料) 送回給你。
  - **重點：** 你不需要知道廚房內部的複雜運作，只需要透過 API 這個標準化的溝通窗口，就能取得你需要的服務或資料。
- **2-2. HTTP Methods (GET, POST)**
  - 這是定義你希望對伺服器資源「做什麼動作」的方法。
  - **GET (取得資料):**
    - **用途：** 向伺服器「索取」或「讀取」資料。這是最常見的請求。
    - **特性：** 請求的參數會附加在網址 (URL) 後面，例如 ?city=Taipei\&days=3。因為參數可見，所以不適合傳遞密碼等機敏資訊。
    - **比喻：** 在圖書館櫃檯，你遞出一張寫著「書名：哈利波特」的紙條來借書。
    - **範例程式碼：**  
      function demoGetMethod() {  
       // 參數直接放在 URL 後方  
       const url \= '\[https://httpbin.org/get?name=David\&from=GAS\](https://httpbin.org/get?name=David\&from=GAS)';  
       const response \= UrlFetchApp.fetch(url);  
       Logger.log(response.getContentText()); // 你會看到伺服器收到了 name 和 from 這兩個參數  
      }

  - **POST (提交資料):**
    - **用途：** 向伺服器「傳送」或「新增」資料，有時也用於更新資料。
    - **特性：** 請求的資料被打包在請求的「本體 (Body)」中，不會顯示在網址上，相對更安全。
    - **比喻：** 你把一封信裝進信封裡，再交給郵局寄送。信的內容 (資料) 被包在信封 (Body) 中。
    - **範例程式碼：**  
      function demoPostMethod() {  
       const url \= '\[https://httpbin.org/post\](https://httpbin.org/post)';  
       const data \= {  
       'message': 'Hello from Google Apps Script\!',  
       'value': 123  
       };

      const options \= {  
       'method': 'post',  
       'contentType': 'application/json',  
       'payload': JSON.stringify(data) // 資料放在 payload 中  
       };

      const response \= UrlFetchApp.fetch(url, options);  
       Logger.log(response.getContentText()); // 你會看到伺服器收到了你 post 的 JSON 資料  
      }

- **2-3. API 構成要素**
  - 一個完整的 API 請求通常包含以下部分：
  - **端點 (Endpoint):** 就是 API 的網址 (URL)，指向你想要存取的特定資源。
    - https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001 就是一個端點，專門提供「各縣市天氣預報」的資料。
  - **參數 (Parameters):** 用來客製化你的請求，篩選或指定你想要的資料。
    - **查詢參數 (Query Parameters for GET):** 附加在 URL 後面，以 ? 開始，用 & 分隔。例如 ?locationName=臺北市 可以只抓取臺北市的資料。
    - **請求主體 (Request Body for POST):** 要傳送的資料，通常是 JSON 格式，放在一個稱為 payload 的屬性中。
  - **標頭 (Headers):** 額外的中介資料，用來說明這次請求的資訊，例如資料格式、身分驗證等。
    - 'Content-Type': 'application/json' 告訴伺服器你送出的資料是 JSON 格式。
    - 'Authorization': 'CWA-YOUR_API_KEY' 就像是出示你的會員卡或通行證，證明你有權限取得資料。
- **UrlFetchApp 服務入門**
  - 這是 Google Apps Script 內建的服務，專門用來扮演「網路瀏覽器」的角色，可以向任何網路上的端點發出 HTTP 請求。
  - **範例 1: 基本的 GET 請求**
    - 這是最單純的用法，只需要提供目標網址。

  function basicGetRequest() {  
   const url \= '\[https://jsonplaceholder.typicode.com/todos/1\](https://jsonplaceholder.typicode.com/todos/1)';  
   const response \= UrlFetchApp.fetch(url);  
   Logger.log(response.getContentText());  
   }
  - **範例 2: 帶有選項 (Options) 的 POST 請求**
    - 當我們需要傳送資料給伺服器時 (例如新增一筆紀錄)，就會使用 POST。所有設定都放在 fetch 方法的第二個參數 options 物件中。
    - 常見 options 屬性：
      - method: HTTP 方法， 'get', 'post', 'put', 'delete' 等。
      - headers: 標頭物件，用來傳遞驗證碼或內容類型。
      - payload: 要傳送的資料主體，通常是 JSON 字串。
      - muteHttpExceptions: 設為 true 時，即使發生 HTTP 錯誤 (如 404, 500)，程式也不會中斷，而是會回傳錯誤的回應物件，方便我們進行自訂的錯誤處理。

function postRequestExample() {  
 const url \= '\[https://httpbin.org/post\](https://httpbin.org/post)'; // 這個網址會回傳你送出的請求內容，很適合測試

const studentData \= {  
 'name': '陳小華',  
 'grade': 8,  
 'id': 'S002'  
 };

const options \= {  
 'method': 'post',  
 'contentType': 'application/json', // 告知伺服器我們傳送的是 JSON  
 // 'payload' 必須是字串，所以我們用 JSON.stringify() 轉換  
 'payload': JSON.stringify(studentData),  
 'muteHttpExceptions': true  
 };

const response \= UrlFetchApp.fetch(url, options);

Logger.log('Response Code: ' \+ response.getResponseCode()); // 顯示回應碼，例如 200 代表成功  
 Logger.log(response.getContentText());  
}

- **2-4. Lab 1: 串接公開資料 API**
  - **目標：** 我們將使用「中央氣象署開放資料平台」的 API，抓取臺灣各縣市的今日天氣預報，並自動填入 Google Sheets。
  - **前置作業：** 請學員先至 [中央氣象署開放資料平台](https://opendata.cwa.gov.tw/user/authkey) 註冊並取得 API 授權碼。
  - **程式碼範例：**  
    // Lab 1: 串接天氣 API 並寫入 Google Sheets

    // 請將 'YOUR_API_KEY' 替換成你從氣象署網站申請到的授權碼  
    const CWA_API_KEY \= 'YOUR_API_KEY';

    function fetchWeatherDataAndWriteToSheet() {  
     const sheet \= SpreadsheetApp.getActiveSpreadsheet().getSheetByName("天氣預報") || SpreadsheetApp.getActiveSpreadsheet().insertSheet("天氣預報");

    try {  
     // 1\. 組合 API 端點 URL  
     const url \= \`https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=${CWA\_API\_KEY}\&format=JSON\`;

        // 2\. 使用 UrlFetchApp 發出 GET 請求
        const response \= UrlFetchApp.fetch(url);

        // 3\. 取得回應內容並解析 JSON 字串
        const jsonString \= response.getContentText();
        const data \= JSON.parse(jsonString);

        // 檢查 API 是否成功回傳資料
        if (\!data.success || \!data.records || \!data.records.location) {
          SpreadsheetApp.getUi().alert("API 請求失敗或資料格式不符！");
          Logger.log("API Response Error: " \+ jsonString);
          return;
        }

        // 4\. 整理資料以便寫入試算表
        const locations \= data.records.location;
        const outputData \= \[\];

        // 加入標題列
        outputData.push(\['縣市', '天氣現象', '最低溫 (°C)', '最高溫 (°C)', '舒適度', '降雨機率 (%)'\]);

        locations.forEach(location \=\> {
          const locationName \= location.locationName;
          // 氣象元素陣列
          const weatherElements \= location.weatherElement;

          // 透過 .find() 方法來安全地尋找特定氣象元素，避免因順序改變而出錯
          const wx \= weatherElements.find(el \=\> el.elementName \=== 'Wx').time\[0\].parameter.parameterName;
          const minT \= weatherElements.find(el \=\> el.elementName \=== 'MinT').time\[0\].parameter.parameterName;
          const maxT \= weatherElements.find(el \=\> el.elementName \=== 'MaxT').time\[0\].parameter.parameterName;
          const ci \= weatherElements.find(el \=\> el.elementName \=== 'CI').time\[0\].parameter.parameterName;
          const pop \= weatherElements.find(el \=\> el.elementName \=== 'PoP').time\[0\].parameter.parameterName;

          outputData.push(\[locationName, wx, minT, maxT, ci, pop\]);
        });

        // 5\. 將整理好的資料一次性寫入 Google Sheet
        sheet.clear(); // 清除舊資料
        sheet.getRange(1, 1, outputData.length, outputData\[0\].length).setValues(outputData);

        // 自動調整欄寬
        sheet.autoResizeColumns(1, outputData\[0\].length);

        Logger.log("天氣資料已成功寫入 Google Sheet！");
        SpreadsheetApp.getUi().alert("天氣資料已成功更新！");

    } catch (e) {  
     // 錯誤處理  
     Logger.log("發生錯誤: " \+ e.toString());  
     SpreadsheetApp.getUi().alert("執行失敗，請查看日誌！");  
     }  
    }

    // Bonus: 從試算表讀取資料的函數  
    function readDataFromSheet() {  
     const sheet \= SpreadsheetApp.getActiveSpreadsheet().getSheetByName("天氣預報");  
     if (\!sheet) {  
     Logger.log("找不到名為 '天氣預報' 的工作表。");  
     return;  
     }  
     const data \= sheet.getDataRange().getValues();  
     // Logger.log(data); // 顯示二維陣列

        // 逐行顯示
        data.forEach((row, index) \=\> {
            Logger.log(\`第 ${index \+ 1} 行: ${row.join(', ')}\`);
        });

    }

- **2-5. Google API 配額與限制 (Quotas & Limits)**
  - Google 為所有服務設定了使用配額，以保護系統穩定性。超過配額時，腳本會拋出錯誤 (如 Limit Exceeded 或 Service invoked too many times) 並停止執行。
  - 配額通常分為「一般免費帳號 (gmail.com)」與「Google Workspace 帳號 (Education/Business)」。Workspace 帳號通常享有較高的配額。
  - **常見 GAS 配額表 (每日限制)：**

| 功能/服務                                | 一般帳號 (Consumer) | Google Workspace (Education/Business) |
| :--------------------------------------- | :------------------ | :------------------------------------ |
| **腳本執行時間** (Script runtime)        | 6 分鐘 / 次         | 6 分鐘 / 次                           |
| **UrlFetchApp 呼叫次數**                 | 20,000 次 / 天      | 100,000 次 / 天                       |
| **UrlFetchApp 資料傳輸量**               | 100 MB / 天         | 100 MB / 天 (通常較少遇到此限制)      |
| **Gmail 寄信額度**                       | 100 封 / 天         | 1,500 封 / 天 (含 CC/BCC)             |
| **觸發器總執行時間**                     | 90 分鐘 / 天        | 6 小時 / 天                           |
| **同時執行數** (Simultaneous executions) | 30 個 / 使用者      | 30 個 / 使用者                        |

\* \*\*特定 API 限制 (Rate Limits)：\*\* 除了每日配額，某些 API 還有「頻率限制」，例如每秒鐘或每分鐘能呼叫幾次。  
 \* \*\*Admin SDK Directory API:\*\* 寫入操作 (如建立使用者) 約每秒 1 次；讀取操作約每秒 5-10 次。若進行大量批次作業，務必在迴圈中加入 \`Utilities.sleep(1000)\` 來避免錯誤。  
 \* \*\*Gmail API:\*\* 有複雜的「配額單位 (Quota Units)」計算方式。讀取信件消耗較少，寄信消耗較多。  
 \* \*\*Calendar API:\*\* 短時間內建立大量活動可能會觸發防濫用機制。

\* \*\*最佳實踐：\*\*  
 1\. \*\*快取 (Cache):\*\* 使用 \`CacheService\` 暫存 API 回傳的資料，減少重複呼叫。  
 2\. \*\*延遲 (Sleep):\*\* 在大量迴圈操作中，使用 \`Utilities.sleep(ms)\` 稍作暫停。  
 3\. \*\*指數退避 (Exponential Backoff):\*\* 當遇到「太頻繁 (Rate Limit)」錯誤時，不要立即重試，而是等待一段時間後再試 (如 1秒 \-\> 2秒 \-\> 4秒)。

##

## **Part 3: 啟用並串接 Google API (10:40 \- 12:00)**

- **Google Cloud Platform (GCP) 與 GAS 的關聯**
  - 說明：每個 GAS 專案背後，其實都對應一個隱藏的 Google Cloud 專案。當我們需要使用 Google 的「進階服務」(Advanced Services) 或手動啟用 API 時，就會接觸到 GCP。
  - 對於管理員來說，最強大的 Admin SDK API（管理使用者、群組、裝置等）就需要透過這個管道啟用。
- **為 GAS 專案啟用進階服務與 API**
  - **步驟 1：啟用進階服務 (Lab 2 會用到)**
    1. 在 GAS 編輯器左側，點擊「服務」旁邊的 \+ 按鈕。
    2. 捲動清單，找到 Admin SDK API，點擊它並按下「新增」。
    3. 這會告訴 GAS：「我準備要呼叫 Google 管理員後台的功能了。」
  - **步驟 2：手動在 GCP 啟用 API (如果服務未列在清單中)**
    1. 點擊左側「專案設定」(齒輪 ⚙️)。
    2. 點擊 GCP 專案 下方的專案連結，即可開啟此 GAS 專案對應的 GCP 頁面。
    3. 在 GCP 中，前往 API 和服務 \> 已啟用的 API 和服務，點擊 \+ 啟用 API 和服務。
    4. 搜尋並啟用你需要的 API (例如 Google Drive API, Gmail API 等)。
    - (註：Admin SDK API 透過「進階服務」啟用時，會自動在 GCP 中啟用，但知道這個路徑對未來擴充功能很重要。)
- **認識 API 範圍 (Scopes) 與 Manifest 檔案設定**
  - **什麼是 Scopes？** 權限範圍。它定義了你的程式碼「被允許做什麼」。例如 .../auth/spreadsheets.readonly (只能讀取試算表) vs .../auth/spreadsheets (可完整讀寫)。
  - **最小權限原則：** 只要求你「絕對必要」的權限，增加安全性。
  - **Manifest 檔案 (appsscript.json)**
    - 當我們新增 Admin SDK API 服務時，GAS 會自動在 appsscript.json 檔案中加入 "oauthScopes"。
    - 我們可以手動編輯這個檔案，來新增或移除 Scopes，精確控制專案權限。
    - **【注意】** 如果你需要手動編輯進階服務，正確的欄位名稱是 enabledAdvancedServices (陣列)，而不是 advancedServices。
    - **範例 appsscript.json (正確格式)：**  
      {  
       "timeZone": "Asia/Taipei",  
       "dependencies": {  
       "enabledAdvancedServices": \[  
       {  
       "userSymbol": "AdminDirectory",  
       "serviceId": "admin",  
       "version": "directory_v1"  
       }  
       \]  
       },  
       "exceptionLogging": "STACKDRIVER",  
       "runtimeVersion": "V8",  
       "oauthScopes": \[  
       "\[https://www.googleapis.com/auth/admin.directory.user.readonly\](https://www.googleapis.com/auth/admin.directory.user.readonly)",  
       "\[https://www.googleapis.com/auth/spreadsheets\](https://www.googleapis.com/auth/spreadsheets)"  
       \]  
      }

    - **注意：** .../auth/admin.directory.user.readonly 這個 Scope 代表「唯讀使用者資料」，非常危險且強大，**只有網域的超級管理員才能成功執行並授予此權限。**

- **實戰：Admin SDK Directory API**
  - 這是 Google Workspace 管理員的利器，可以透過程式碼對管理控制台 (admin.google.com) 進行自動化操作。主要包含以下幾個核心資源：
  - **Users (使用者)：帳號的完整生命週期管理**
    - **說明：** 這是 API 中最核心、最常用的部分，代表您網域中的「帳號」。您可以透過程式碼存取、修改在 admin.google.com 中能看到的「所有」使用者屬性。
    - **主要功能 (方法)：**
      - **Users.list():** 查詢 (Query) / 列出 (List) 使用者。這就是 Lab 2 會用到的核心功能。它可以搭配強大的 query 參數來篩選特定使用者，例如：
        - query: "orgUnitPath='/學生'" (篩選特定 OU 的使用者)
        - query: "isSuspended=true" (篩選出所有被停權的帳號)
        - query: "name:王大明" (用姓名查詢)
      - **Users.get():** 取得 (Get) 某個特定使用者的完整詳細資料（必須提供使用者的 id 或 primaryEmail）。
      - **Users.insert():** 新增 (Insert) 使用者，等同於在後台建立新帳號。可用於自動化新生入學的帳號建立流程。
      - **Users.update():** 更新 (Update) 使用者的資料。功能非常強大，例如：
        - 重設密碼 (password)
        - 更改姓名 (name)
        - 將使用者移動到不同的 OU (orgUnitPath)
        - 強制使用者下次登入時變更密碼 (changePasswordAtNextLogin)
      - **Users.delete():** 刪除 (Delete) 使用者帳號。
  - **Groups (群組)：權限與郵寄清單管理**
    - **說明：** 這對應到 Google 後台的「群組」(Google Groups for Business)。它不僅是郵寄清單 (Mailing List)，也是管理權限的重要方式 (例如：將一個群組加入共用雲端硬碟、設定 Google Chat 聊天室成員)。
    - **主要功能 (方法)：**
      - **Groups.list():** 列出網域中的所有群組。
      - **Members.list():** 列出某個特定群組中的所有成員 (例如 Members.list("all\_teachers@your.domain.com") )。
      - **Members.insert():** 將使用者加入特定群組。
        - **校園情境：** 可搭配 Lab 2，將 Users.list() 撈出的所有 '/學生' OU 成員，自動 insert 到 all\_students@your.domain.com 這個群組中，確保郵寄清單永遠保持最新。
      - **Members.delete():** 將使用者從群組中移除 (例如：學生畢業時自動移出群組)。
  - **Orgs (機構單位 / OU)：組織架構與政策管理**
    - **說明：** 這就是 Google 管理控制台中的「機構單位 (Organizational Units)」。OU 是 Google Workspace 用來組織使用者及「套用不同政策」的基礎。
    - **重要概念：** 我們 _管理_ 使用者時 (如 Lab 2)，通常是透過 Users 服務搭配 orgUnitPath 參數來 _篩選_ 使用者，而不是直接操作 Orgs 服務。
    - **主要功能 (方法)：**
      - **Orgs.list() / Orgs.get():** 查詢您網域的 OU 架構。
      - **Orgs.insert() / Orgs.update():** 透過程式碼建立或修改 OU。
        - **校園情境：** 可用於學期初自動建立新的班級 OU 架構 (例如：在 /學生/113學年度 之下，自動建立 /一年級/甲班、/一年級/乙班...)。
  - **【重要觀念】Groups (群組) vs. Orgs (機構單位 / OU) 的差異**
    - 這是 Google Workspace 管理中最核心的兩個概念，它們的用途**完全不同**。
    - **生活化比喻：**
      - **Orgs (機構單位 / OU) \= 你的「部門座位」或「班級教室」**
        - 你被分配到「三年甲班」這個座位。
        - 這個座位決定了你的\*\*「規則」與「政策」\*\*：例如，這個教室裡的電腦「不允許」使用 YouTube、Gmail 主題「強制」設為學校 Logo。
        - **你一次只能在一個座位 (OU) 上**。你不可能同時隸屬於「三年甲班」和「二年乙班」。
      - **Groups (群組) \= 你加入的「社團」或「郵寄名單」**
        - 你加入了「籃球社」、「全校教師公告群」和「資訊科辦公室」這三個群組。
        - 這決定了你的\*\*「權限」與「溝通對象」\*\*：
          - 「籃球社」群組可以存取「籃球社共用雲端硬碟」。
          - 「全校教師公告群」決定了你會收到哪些公告 Email。
        - **你可以同時加入無限多個群組**。
    - **差異比較表：**

| 特性         | Orgs (機構單位 / OU)                                               | Groups (群組)                                                                |
| :----------- | :----------------------------------------------------------------- | :--------------------------------------------------------------------------- |
| **主要目的** | **強制套用「政策」** (Policy)                                      | **授予「權限」** (Permission) & **通訊** (Communication)                     |
| **範例**     | 限制服務存取 (停用 YouTube)、強制安裝 Chrome 外掛、設定 Gmail 規範 | 建立郵寄清單 (e.g., all_teachers@)、共用雲端硬碟成員、Google Chat 聊天室成員 |
| **成員關係** | **一對一** (一位使用者**只能**屬於一個 OU)                         | **多對多** (一位使用者可以加入**多個**群組)                                  |
| **結構**     | **嚴格的樹狀階層** (Hierarchy)                                     | **扁平的** (Flat) (或可巢狀，但主要非階層管理)                               |
| **繼承性**   | **會**。子 OU 會繼承父 OU 的設定 (除非覆寫)                        | **不會**。群組權限各自獨立。                                                 |
| **管理 API** | AdminDirectory.Orgs                                                | AdminDirectory.Groups & AdminDirectory.Members                               |

- **Lab 2: 校內使用者帳號管理**
  - **目標：** 讀取特定機構單位 (OU) 的所有使用者清單，並將其 Email、全名、最後登入時間等資訊自動產生在 Google Sheet 報表中。
  - **前置作業：**
    1. 確認你具備「超級管理員」身分。
    2. 開啟一個 Google 試算表，並建立一個 GAS **繫結式腳本**。
    3. 依照上列步驟，啟用 Admin SDK API 進階服務。
    4. (可選) 建立一個名為 "使用者清單" 的工作表分頁。
  - **範例程式碼：**  
     /\*\*

           \* @OnlyCurrentDoc

           \* \* Lab 2: 匯出特定 OU 的使用者清單

           \* \* 執行此函數前，請務必：

           \* 1\. 確保您是 Google Workspace 的「超級管理員」。

           \* 2\. 在 GAS 編輯器中啟用「服務」 \> "Admin SDK API"。

           \* 3\. 首次執行時，會彈出授權視窗，請務必同意。

           \*/

          function listUsersInOU() {

            // \--- 1\. 使用者設定 \---

            // 請將 '/學生/一年級/甲班' 替換成您想查詢的 OU 完整路徑

            const TARGET\_OU\_PATH \= '/學生';



            // 如果發生 "Cannot read properties of null" 錯誤，請在此填入您的試算表 ID

            // ID 位於網址列：\[https://docs.google.com/spreadsheets/d/\](https://docs.google.com/spreadsheets/d/)\[您的ID在這裡\]/edit

            const FALLBACK\_SPREADSHEET\_ID \= '';

            // \---------------------


            let ss \= SpreadsheetApp.getActiveSpreadsheet();


            // \[除錯\] 如果是獨立腳本，getActiveSpreadsheet() 會是 null，此時改用 openById

            if (\!ss) {

              if (FALLBACK\_SPREADSHEET\_ID) {

                  try {

                      ss \= SpreadsheetApp.openById(FALLBACK\_SPREADSHEET\_ID);

                  } catch (e) {

                      Logger.log("錯誤：提供的試算表 ID 無效。");

                      return;

                  }

              } else {

                  Logger.log("錯誤：找不到作用中的試算表 (ss 為 null)。");

                  Logger.log("原因：您可能正在執行「獨立式腳本」。");

                  Logger.log("解法：請在程式碼上方的 FALLBACK\_SPREADSHEET\_ID 變數中填入您的試算表 ID。");

                  return;

              }

            }


            const sheet \= ss.getSheetByName("使用者清單") || ss.insertSheet("使用者清單");

            sheet.clear();


            // 輸出的標題列

            const headers \= \['全名', 'Email', '機構單位', '最後登入時間', '帳號狀態'\];

            const outputData \= \[headers\];


            let pageToken \= null;

            let pageNumber \= 1;


            Logger.log(\`開始查詢 OU: ${TARGET\_OU\_PATH} ...\`);


            try {

              // 2\. 處理 API 分頁 (Pagination)

              // Admin SDK API 一次最多只會回傳 500 筆資料，

              // 我們必須使用 do...while 迴圈和 pageToken 來取得所有頁面的資料。

              do {

                const optionalArgs \= {

                  customer: 'my\_customer',        // 'my\_customer' 是指您自己的網域

                  query: \`orgUnitPath='${TARGET\_OU\_PATH}'\`, // 查詢語法

                  maxResults: 500,                // 一次取得的最大數量

                  pageToken: pageToken,

                  orderBy: 'email',               // 排序方式

                  viewType: 'admin\_view'          // 必須是 admin\_view 才能看到所有欄位

                };


                // 3\. 呼叫 Admin SDK API

                const response \= AdminDirectory.Users.list(optionalArgs);

                const users \= response.users;


                if (users && users.length \> 0\) {

                  Logger.log(\`正在處理第 ${pageNumber} 頁，共 ${users.length} 筆使用者資料...\`);


                  // 4\. 整理回傳的資料

                  users.forEach(user \=\> {

                    // 處理最後登入時間，如果是新帳號可能沒有這個欄位

                    let lastLoginTime \= user.lastLoginTime ? new Date(user.lastLoginTime) : '從未登入';

                    let status \= user.suspended ? '已停權' : '啟用中';


                    outputData.push(\[

                      user.name.fullName,

                      user.primaryEmail,

                      user.orgUnitPath,

                      lastLoginTime,

                      status

                    \]);

                  });

                } else {

                  Logger.log('在此 OU 中找不到任何使用者。');

                  break;

                }


                // 取得下一頁的 token，如果沒有下一頁，pageToken 會是 null

                pageToken \= response.nextPageToken;

                pageNumber++;


              } while (pageToken);


              // 5\. 將所有資料一次性寫入 Google Sheet

            if (outputData.length \> 1\) { // 確保有資料 (大於 1 是因為標題列)

              sheet.getRange(1, 1, outputData.length, headers.length).setValues(outputData);

              sheet.autoResizeColumns(1, headers.length);

              Logger.log(\`查詢完成！總共匯出 ${outputData.length \- 1} 筆使用者資料。\`);



              // \[修正\] 只有在綁定模式 (非獨立腳本) 下才跳出 UI 通知，避免報錯

              if (SpreadsheetApp.getActiveSpreadsheet()) {

                  SpreadsheetApp.getUi().alert(\`查詢完成！總共匯出 ${outputData.length \- 1} 筆使用者資料。\`);

              }

            } else {

              sheet.getRange(1, 1).setValue('在該 OU 中找不到任何使用者。');

              Logger.log('在該 OU 中找不到任何使用者。');

            }


          } catch (e) {

            // 6\. 錯誤處理

            Logger.log('執行失敗: ' \+ e.message);

            Logger.log('詳細錯誤: ' \+ e.stack);



            // 只有在綁定模式下才跳出 UI 警告，避免獨立執行時出錯

            if (SpreadsheetApp.getActiveSpreadsheet()) {

                SpreadsheetApp.getUi().alert('執行失敗！請檢查日誌。\\n錯誤訊息：' \+ e.message \+ '\\n\\n(常見原因：1. 非管理員 2\. OU 路徑錯誤 3\. API 未啟用)');

            }

          }

        }


          /\*\*

           \* (可選) 增加一個選單，方便執行

           \*/

          function onOpen() {

              // 只有在綁定模式下才建立選單

              if (SpreadsheetApp.getActiveSpreadsheet()) {

                  SpreadsheetApp.getUi()

                    .createMenu('管理員工具')

                 .addItem('匯出 OU 使用者清單', 'listUsersInOU')

                   .addToUi();

            }

        }

  **【常見錯誤排除 1】遇到 Exception: You do not have permission...**
  - **原因：** 您的 Apps Script 專案缺少了「讀取使用者資料」的權限範圍 (Scope)。
  - **解法：** 請檢查並修改您的 appsscript.json 檔案：
    1. 在左側檔案清單中，點擊 appsscript.json (若無，請至專案設定勾選顯示)。
    2. 確認 oauthScopes 區塊包含 https://www.googleapis.com/auth/admin.directory.user.readonly。
    3. **範例設定檔：**  
       {  
        "timeZone": "Asia/Taipei",  
        "dependencies": {  
        "enabledAdvancedServices": \[{  
        "userSymbol": "AdminDirectory",  
        "serviceId": "admin",  
        "version": "directory_v1"  
        }\]  
        },  
        "exceptionLogging": "STACKDRIVER",  
        "runtimeVersion": "V8",  
        "oauthScopes": \[  
        "\[https://www.googleapis.com/auth/admin.directory.user.readonly\]",  
        "\[https://www.googleapis.com/auth/spreadsheets\]"  
        \]  
       }

    4. 修改後存檔 (Ctrl+S)，並**再次執行**函數以觸發授權視窗。

  - **【常見錯誤排除 2】遇到 Error 400: admin_policy_enforced 怎麼辦？**
    - **情境：** 當您按下執行，授權視窗跳出並顯示 Error 400: admin_policy_enforced。
    - **原因：** Google Workspace 教育版預設安全性較高，阻擋了未經審核的應用程式存取敏感資料（如使用者清單），即使是管理員自己寫的程式也一樣。
    - **解法：將您的 GAS 專案設為「信任的應用程式」**
      1. **複製 Client ID：** 從錯誤訊息詳細資訊中，找到 client_id 數值（例如 123456...apps.googleusercontent.com）。
      2. **進入管理控制台：** 登入 [admin.google.com](https://admin.google.com)。
      3. **前往 API 設定：** 安全性 \> 存取權與資料控管 \> API 控制項。
      4. **新增應用程式：** 點擊「管理第三方應用程式存取權」 \> 「新增應用程式」 \> 「OAuth 應用程式名稱或用戶端 ID」。
      5. **搜尋並授權：** 貼上 Client ID \> 搜尋 \> 勾選您的應用程式 \> 選取。
      6. **設為信任：** 在 OAuth Client ID 步驟再次選取 \> 在存取權設定頁面選擇 **「受信任」 (Trusted)** \> 完成。
      7. **重試：** 等待數分鐘後，回到 GAS 再次執行即可。

##

## **Part 4: 打造 LINE Bot 助理**

- **專案目標：** 建立一個 LINE 官方帳號機器人，使用者可以透過傳送訊息，來新增 Google Tasks 任務、建立 Google Calendar 行程，並能查詢現有項目。
- **核心架構：** LINE (使用者介面) \<=\> Make.com (中介橋樑) \<=\> Google Workspace APIs (後端服務)
- **LINE Messaging API 簡介**
  - 什麼是 LINE Bot？它如何接收與回覆訊息？
  - 關鍵元素：Channel Secret (頻道密鑰) & Channel Access Token (頻道存取權杖)。
  - Webhook 概念複習：LINE 平台如何透過 HTTP POST 請求，將使用者訊息「推送」到我們的後端服務 (Make.com)。
- **Make.com 視覺化流程平台入門**
  - 概念：Scenario (場景)、Module (模組)、Router (路由器)。
  - Make.com 如何取代傳統的程式碼，用拖拉的方式建立自動化流程。
- **Lab 3: 建立你的第一個 LINE Echo Bot**
  1. **LINE 端設定：**
     - 前往 [LINE Developers Console](https://developers.line.biz/)。
     - 建立一個新的 Provider 和一個 Messaging API Channel。
     - 取得 Channel access token 並記下。
  2. **Make.com 端設定：**
     - 建立一個新的 Scenario。
     - 第一個模組選擇 LINE \> Watch Events。
     - 建立一個新的 Webhook，將 Channel access token 填入。
     - 將 Make.com 產生的 Webhook URL 複製起來。
  3. **串接設定：**
     - 回到 LINE Developers Console 的 Messaging API 設定頁面。
     - 將 Make.com 的 Webhook URL 貼到 Webhook URL 欄位並啟用。
  4. **完成 Echo 功能：**
     - 在 Make.com 的 LINE Watch Events 模組後方，新增 LINE \> Send a Reply Message 模組。
     - 點開 Send a Reply Message 模組的設定。
     - **【關鍵步驟】** 在 Reply Token 欄位中，點擊一下，從跳出的變數面板中，選擇來自第一個 Watch Events 模組的 Events\[\]: Reply Token 變數。
     - 在 Text 欄位中，同樣從變數面板選擇 Events\[\]: Message: Text 變數。
     - 這樣設定的意義是「將收到的訊息內容（Text），回覆給當初觸發這個事件的訊息（Reply Token）」。
  5. **測試：** 開啟 LINE App，加入你的機器人為好友，傳送訊息看它是否會重複你說的話。

##

## **Part 5: 整合 Google Workspace \- 實現智慧助理**

- **5-1. 在 Make.com 中串接 Google 服務**
  - **5-1-1. Google Workspace API 核心功能與權限 (Scopes) 介紹**
    - 在開始串接前，先了解這次會用到的幾個 Google 服務，它們分別能做什麼，以及需要授予 Make.com 什麼樣的權限。
    - **Google Calendar API**
      - **主要功能：** 讓應用程式可以讀取、建立和修改日曆上的活動。是實現行程管理的關鍵。
      - **Make.com 常用模組：** Create an Event, Search Events, Update an Event。
      - **相關權限 (Scopes)：** 當你授權 Make.com 時，它會請求類似 https://www.googleapis.com/auth/calendar.events 的權限，這代表允許 Make.com「讀取、寫入、修改、刪除」你日曆上的活動。如果只需要讀取，則會是 .../auth/calendar.events.readonly。
    - **Google Tasks API**
      - **主要功能：** 讓應用程式可以管理你的待辦事項清單，包括新增任務、標示完成、設定截止日期等。
      - **Make.com 常用模組：** Create a Task, List Tasks, Get a Task, Update a Task。
      - **相關權限 (Scopes)：** 通常會請求 https://www.googleapis.com/auth/tasks，代表允許 Make.com 對你的任務清單進行完整的讀寫操作。唯讀權限則是 .../auth/tasks.readonly。
    - **Gmail API**
      - **主要功能：** 提供強大的郵件處理能力，包括讀取信件、搜尋特定郵件、傳送郵件等。
      - **Make.com 常用模組：** Send an email, Search Emails, Mark an email as read/unread。
      - **相關權限 (Scopes)：** Gmail 的權限分得更細。例如，.../auth/gmail.send 只允許傳送郵件，.../auth/gmail.readonly 只允許讀取，而 .../auth/gmail.modify 則包含讀寫與修改標籤等權限。
  - **5-1-2. 透過 Make.com 完成 Google 帳號 OAuth 2.0 授權**
    - **什麼是 OAuth 2.0？**
      - 這是一個安全的「授權」標準，而非「驗證」標準。
      - **生活化比喻：** 你想讓快遞員幫你把包裹放進社區的儲物櫃，你不會把家裡的「萬能鑰匙」（你的 Google 帳號密碼）給他。你會給他一個「臨時密碼」或「QR Code」（這就是 Access Token），這個憑證只能用來打開儲物櫃的門，而且有時效性，他不能用它來開你家的門。這就是 OAuth 的核心精神：**在不洩漏使用者主要憑證的前提下，允許第三方應用程式存取使用者資源的特定部分。**
    - **權限範圍 (Scopes) 的重要性**
      - Scopes 就是用來定義那把「臨時鑰匙」的權限有多大。我們應該遵循**最小權限原則**，只給予應用程式完成工作所必需的最小權限。
      - 當 Make.com 跳出授權畫面時，Google 會明確列出它正在請求的所有 Scopes，例如「管理您的日曆」、「查看及管理您的工作」，使用者可以清楚看到並決定是否同意。
    - **Make.com 實際授權流程：**
      1. 在 Make.com 的 Scenario 編輯器中，加入第一個需要 Google 授權的模組（例如 Google Calendar: Create an Event）。
      2. 在模組設定中，點擊 Connection 旁邊的 Add 按鈕。
      3. 系統會彈出一個新視窗，引導你為這個連結命名，然後點擊 Sign in with Google。
      4. 頁面會跳轉到熟悉的 Google 帳號登入畫面，請登入你的 Google 帳號。
      5. 接著，Google 會顯示一個**授權同意畫面**，上面會清楚列出 Make.com 正在請求的權限（例如，「查看、編輯、分享及永久刪除您的所有 Google 日曆」）。
      6. 仔細閱讀後，點擊「允許」。
      7. 頁面跳轉回 Make.com，Connection 建立成功！這個授權好的連結未來可以被這個帳號下的所有 Scenarios 重複使用，不需每次都重新授權。
- **設計指令與流程分派 (Routing)**
  - 我們需要規劃關鍵字，讓機器人知道使用者想做什麼。
  - 範例指令：
    - 新增任務 \[任務內容\]：建立 Google Task。
    - 新增行程 \[時間\] \[行程名稱\]：建立 Google Calendar 事件。
    - 查詢：回傳近期的任務與行程。
  - 使用 Make.com 的 Router 模組來根據訊息內容，將流程導向不同的分支。
- **Lab 4: 實現 LINE Bot 助理核心功能**  
   \* **概念流程圖與詳細設定：**

          * 在 `LINE: Watch Events` 模組後方，加上一個 `Router` 模組，並從 `Router` 拉出三條路線。

      * **分支1: 新增任務**

          * **使用者輸入格式：** (請使用 `Shift+Enter` 換行)
          ```text
          新增任務
          繳交資訊研習心得
          ```
          * **【重要修正】** 為了統一操作體驗並避免空格錯誤，改用**換行**來分隔指令與任務內容。

        <!-- end list -->

        1.  **設定 Filter (過濾器):** 在 `Router` 和 `Google Tasks` 模組之間的路徑上點擊，選擇 `Set up a filter`。
              * **Label:** `判斷為新增任務`
              * **Condition:** `{{1.events[].message.text}}` (來自 LINE 的訊息)
              * **Text operator:** `Starts with (case insensitive)`
              * **Value:** `新增任務` (移除後方的空格，只要開頭文字符合即可)
        2.  **加入模組 `Google Tasks: Create a Task`:**
              * **Task List ID:** 選擇你的預設任務清單 (例如: My Tasks)。
              * **Title:** 這裡改用 `split` 函數來處理多行文字，比 `substring` 更穩定：
                  * `{{get(split(1.events[].message.text; newline); 2)}}`
                  * *解析：* 使用 `newline` (Make.com 內建變數，代表換行) 將訊息切開。
                  * Make.com 的陣列索引是 **1-based**，所以「新增任務」是第 1 項，**任務內容**位於 **第 2 項**。
        3.  **加入模組 `LINE: Send a Reply Message`:**
              * **Reply Token:** `{{1.events[].replyToken}}`
              * **Text:** `任務已新增：「{{4.title}}」` (這裡的 `{{title}}` 是從上一步 Google Tasks 模組回傳的任務標題)。

      * **分支2: 新增行程**

          * **使用者輸入格式：** (請使用 `Shift+Enter` 換行，將指令分為三行輸入)
            ```text
            新增行程
            2024-12-01T14:00
            參加線上研習
            ```
            * **【重要修正】** 為了避免空格造成的判斷錯誤，建議改用**換行**來分隔資料。
            * 日期時間請繼續使用 **ISO 8601** 標準格式 (`YYYY-MM-DDTHH:mm`)，中間以 `T` 連接。

        <!-- end list -->

        1.  **設定 Filter:**
              * **Label:** `判斷為新增行程`
              * **Condition:** `{{1.events[].message.text}}`
              * **Text operator:** `Starts with (case insensitive)`
              * **Value:** `新增行程` (移除後方的空格，只要開頭文字符合即可)
        2.  **加入模組 `Google Calendar: Create an Event`:**
              * **Calendar ID:** 選擇你的主要日曆。
              * **Event Name:** 這裡需要擷取第三行的活動名稱。我們將分隔符號改為 `newline` (換行變數)：
                  * `{{get(split(1.events[].message.text; newline); 3)}}`
                  * *解析：* 使用 `newline` (Make.com 內建變數，代表換行) 切割後，第 1 行是"新增行程"，第 2 行是"日期時間"，**第 3 行**就是"活動名稱"。
              * **Start Date:** 使用 `get()` 取出第 2 行，並搭配 ISO 格式解析：
                  * `{{parseDate(trim(get(split(1.events[].message.text; newline); 2)); "YYYY-MM-DDTHH:mm")}}`
                  * *說明：* 取出第 2 行 (日期時間)，並確保使用 `YYYY-MM-DDTHH:mm` 格式解析。
              * **End Date:** 在 Start Date 的基礎上增加一小時：
                  * `{{addHours(parseDate(trim(get(split(1.events[].message.text; newline); 2)); "YYYY-MM-DDTHH:mm"); 1)}}`
        3.  **加入模組 `LINE: Send a Reply Message`:**
              * **Reply Token:** `{{1.events[].replyToken}}`
              * **Text:** `行程已建立：「{{3.summary}}」\n時間：{{formatDate(3.start.dateTime; "YYYY/MM/DD HH:mm")}}`

  - **分支3: 查詢**
    - **使用者輸入格式：** 查詢
    1. **設定 Filter:**
       - **Label:** 判斷為查詢
       - **Condition:** {{1.events\[\].message.text}}
       - **Text operator:** Equal to (case insensitive)
       - **Value:** 查詢
    2. **加入模組 `Google Calendar: Search Events`:**
    - **Calendar ID:** 選擇你的主要日曆。
    - **Start Date:** `{{now}}` (內建變數，代表現在)
    - **End Date:** `{{addDays(now; 7)}}` (查詢未來7天的行程)
    - **Order by:** `Start time (ascending)` (依開始時間排序)
    - **Single events:** `Yes`
    - **【重要修正】** 務必將 `Single events` 設為 `Yes`。這會將循環活動展開為個別項目，若未開啟此選項卻設定排序，會導致 `[400] The requested ordering is not available` 錯誤。
      - **Limit:** `10`
    3.  **加入模組 `Tools: Text Aggregator`:** (串接在 `Search Events` 之後)
    - 這個模組會將多個行程彙整成一段文字。
    - **Source Module:** 選擇上一步的 `Google Calendar: Search Events`。
    - **Row separator (分隔符號):** 選擇 `New row` (這代表每筆資料之間會自動換行)。
    - **Text:**
    - **【重要修正】** 根據您的輸出資料，`start` 欄位直接包含了日期時間，請直接選取 `start` 變數，**不要**選取 `start` 下面的 `dateTime`。
    - **公式：** `{{formatDate(start; "MM/DD HH:mm")}} {{summary}}`
    - _解析：_ 若您的 `start` 變數是 ISO 格式字串 (如 `2025-11-24T...`)，直接放入 `formatDate` 即可。若部分活動 (如全天活動) 使用 `date` 欄位，可使用 `ifempty` 函數：`{{formatDate(ifempty(start; start.date); "MM/DD HH:mm")}}`。
    4. **加入模組 Google Tasks: List Tasks:** (串接在 Text Aggregator 之後)
       - **Task List ID:** 選擇你的任務清單。
       - **Limit:** 10
    5. **再加入一個 Tools: Text Aggregator:** (串接在 List Tasks 之後)
       - **Source Module:** 選擇上一步的 Google Tasks: List Tasks。
       - **Text:** {{12.title}}\\n
    6. **最後加入 LINE: Send a Reply Message:**
       - **Reply Token:** {{1.events\[\].replyToken}}
       - Text:  
         \---未來7日行程---\\n{{11.text}}\\n---待辦任務---\\n{{13.text}}  
         (這裡的 {{11.text}} 和 {{13.text}} 分別來自兩個 Text Aggregator 模組從 Calendar 和 Task 組成的最終結果)

- **功能 3-3 (自動 Gmail 通知) 的實現思路：**
  - **方法 A：利用 Google Calendar 內建通知 (最簡單)**
  - **說明：** 這是在建立行程時，直接告訴 Google 日曆：「活動開始前幫我寄信」。這利用的是 Google 日曆本身的功能，不需要額外消耗 Make.com 的操作次數。
  - **實作步驟：**
  1. 回到 Lab 4 的 Scenario，點擊 `Google Calendar: Create an Event` 模組。
  2. 勾選下方的 `Show advanced settings` (顯示進階設定)。
  3. 向下捲動找到 `Reminders` (提醒) 區塊。
  4. 點擊 `Add item` 增加一個提醒項目。
  5. **Method (方式):** 選擇 `Email`。
  6. **Minutes (分鐘):**
     - 輸入 `1440` (代表 24 小時，即活動前 1 天寄信)。
     - 或輸入 `60` (代表活動前 1 小時寄信)。
  7. 按下 OK 存檔。之後透過 LINE 建立的行程，就會自動帶有 Email 提醒設定了。
  - **方法 B：建立每日排程檢查機器人 (進階 - 適合任務清單)**
  - **說明：** 建立一個全新的、獨立的 Scenario，設定為「每天早上」定時執行。它會主動去檢查 Google Tasks 任務清單，找出「明天」到期的任務並寄信提醒。
  - **實作步驟：**
  1. **建立新 Scenario：** 回到 Make.com 首頁，點擊 `Create a new scenario`，命名為「每日任務提醒」。
  2. **設定排程 (Schedule)：**
  - 點擊左下角的 `Schduling` (時鐘圖示)，將 `Run scenario` 設為 `Every day`。
  - 設定 `Time` 為 `08:00` (每天早上八點執行)。
  - 記得將開關切換為 `ON`。
  3.  **加入模組 1 (觸發)：`Google Tasks: List Tasks`**
      _ **Task List ID:** 選擇您的任務清單 (例如 My Tasks)。
      _ **Show completed:** 選擇 `No` (只抓取未完成的任務)。
      _ **Show hidden:** 選擇 `No`。4. **設定過濾器 (Filter)：篩選「明天到期」的任務**
      _ 在 `List Tasks` 模組右側的連線點擊一下，設定 Filter。
      _ **Label:** `明天到期的任務`
      _ **Condition 1 (大於等於明天 00:00):**
      _ 第一個欄位選 `Due` (任務到期日)。
      _ 運算子選 `Datetime: Greater than or equal to`。
      _ 第二個欄位輸入公式：`{{addDays(startOfDay(now); 1)}}`
      _ _解析：_ `startOfDay(now)` 是今天的 00:00，`addDays(..., 1)` 則是明天 00:00。
      _ **Condition 2 (且小於後天 00:00):**
      _ 點擊 `AND` 規則。
      _ 第一個欄位選 `Due`。
      _ 運算子選 `Datetime: Less than`。
      _ 第二個欄位輸入公式：`{{addDays(startOfDay(now); 2)}}`
      _ _解析：_ 這是後天的 00:00。\* _總結：_ 這樣設定會精準篩選出「到期日落在明天一整天」的任務。5. **加入模組 2 (執行)：`Gmail: Send an Email`**
      _ **Connection:** 選擇您的 Gmail 帳號連結。
      _ **To:** 輸入您想接收提醒的 Email 地址。
      _ **Subject:** `[提醒] 明日待辦事項：{{1.title}}`
      _ **Content:**
      ```text
      您好，

                 提醒您，以下任務將於明天到期，請記得處理：
                 任務名稱：{{1.title}}
                 備註說明：{{1.notes}}

                 加油！
                 ```
            6. **(進階優化) 彙整成一封信：**
               * 如果明天有 5 個任務，上述做法會寄 5 封信。若想合併成一封：
               * 在 `List Tasks` 和 `Gmail` 中間，插入一個 `Tools > Text Aggregator` 模組。
               * 設定 Aggregator 將 `Title` 和 `Due` 欄位組合成一行文字。
               * 最後 `Gmail` 模組的 Content 改為放入 Aggregator 輸出的 `Text` 變數即可。
  - **功能 3-4 (回傳資訊) 的實現思路：**
    - 如流程圖分支3所示，收到查詢指令後，分別用 Google Calendar 和 Tasks 模組撈取資料。
    - 使用 Tools \> Text aggregator 模組將多筆資料整理成單一、格式優美的文字訊息。
    - 最後透過 LINE 模組回傳給使用者。
  - **Apps Script 的角色 (進階應用):**
    - 雖然 Make.com 能完成大部分工作，但 GAS 仍可扮演輔助角色。例如，可以寫一個 GAS 函式，透過 UrlFetchApp 去觸發一個 Make.com 的 Webhook，用於執行批次、複雜的排程任務。
    - **範例程式碼 (GAS 每日觸發 Make.com 進行提醒檢查):**  
      // 這個 GAS 函式可以設定每日定時觸發  
      function triggerDailyReminderCheck() {  
       const makeWebhookUrl \= 'YOUR_MAKE_COM_WEBHOOK_URL'; // 從 Make.com 取得

      const options \= {  
       'method': 'post',  
       'contentType': 'application/json',  
       'payload': JSON.stringify({ 'userId': 'YOUR_LINE_USER_ID' }) // 主動告知 Make 要提醒誰  
       };

      try {  
       UrlFetchApp.fetch(makeWebhookUrl, options);  
       Logger.log('成功觸發 Make.com 每日提醒流程。');  
       } catch (e) {  
       Logger.log('觸發 Make.com 失敗: ' \+ e.toString());  
       }  
      }

##

## **Part 6: 【專案實戰】LINE Bot 結合 AI 實現 OCR 文字辨識**

- **專案目標：** 建立一個能接收使用者傳送的圖片、辨識圖片中的文字，並將文字回傳給使用者的 LINE 機器人。
- **核心架構：** LINE (傳送圖片) → Make.com (自動化流程) → imgbb (圖片暫存) → Mistral AI Pixtral (OCR辨識) → LINE (回傳文字)

- **前置準備：取得必要的帳號與 API 金鑰**
  1. **imgbb 帳號：**
     - 前往 [https://imgbb.com/](https://imgbb.com/) 註冊帳號
     - Make.com 提供原生 [ImgBB 模組](https://apps.make.com/imgbb)，會自動處理 API 連線
     - (備用) 若需使用 HTTP 模組，可至 [https://api.imgbb.com/](https://api.imgbb.com/) 取得 API Key
  2. **Mistral AI API Key：**
     - 前往 [https://console.mistral.ai/](https://console.mistral.ai/)
     - 註冊帳號後，前往 API Keys 頁面建立新的 API Key
     - Make.com 提供原生 [Mistral AI 模組](https://apps.make.com/mistral-ai)
     - **【注意】** 根據 Make.com 文件，使用原生模組需要 Mistral AI **付費訂閱**
     - 若無付費帳戶，可改用 HTTP 模組直接呼叫 API (免費額度有限)

- **使用工具與 API 概念：**
  - **LINE Messaging API:**
    - **概念：** 使用 `Watch Events` 模組接收所有訊息。當訊息類型為 `image` 時，我們會取得一個 Message ID，再用此 ID 去下載實際的圖片內容。
    - **Get Content 端點：** `GET https://api-data.line.me/v2/bot/message/{messageId}/content`
    - **文件：** [LINE Messaging API - Get content](https://developers.line.biz/en/reference/messaging-api/#get-content)
  - **imgbb API:**
    - **概念：** LINE 傳來的圖片內容有存取時效性，我們無法直接將臨時連結丟給 AI。因此，我們需要先將圖片上傳到一個公開的圖片託管服務 (如 imgbb)，以取得一個永久的公開 URL。
    - **上傳端點：** `POST https://api.imgbb.com/1/upload`
    - **參數說明：**
      - `key` (必填): 您的 API 金鑰
      - `image` (必填): 圖片資料，可以是 Base64 編碼字串、圖片 URL、或二進位檔案
      - `expiration` (選填): 圖片保留秒數 (60-15552000)，不填則永久保存
    - **回應結構：** `data.url` 或 `data.display_url` 為圖片的公開網址
    - **文件：** [imgbb API Documentation](https://api.imgbb.com/)
  - **Mistral AI Pixtral (Vision/Multimodal) API:**
    - **【重要修正】** `mistral-large-latest` **不支援**圖片辨識！必須使用 **Pixtral** 系列的視覺模型：
      - `pixtral-12b-2409` - 基礎視覺模型 (建議使用)
      - `pixtral-large-latest` - 進階視覺模型 (效果更好，但消耗更多 tokens)
    - **API 端點：** `POST https://api.mistral.ai/v1/chat/completions`
    - **文件：** [Mistral AI - Vision Guide](https://docs.mistral.ai/capabilities/vision/)

- **Lab 5: 建立 OCR 機器人 (Make.com 流程詳解)**

  - **情境 (Scenario) 總覽流程圖：**
    ```
    [1] LINE: Watch Events
           ↓
    [2] Router (流程分支)
           ↓ (Filter: message.type = "image")
    [3] LINE: Download a Message Content
           ↓
    [4] ImgBB: Upload a Photo (原生模組)
           ↓
    [5] Mistral AI: Make an API Call (原生模組)
           ↓
    [6] LINE: Send a Reply Message
    ```
    
    **🎉 全程使用原生模組！** 不需要任何 HTTP 模組，設定更簡單。

  - **詳細模組設定步驟：**

    ---
    ### **步驟 1：觸發器 - LINE > Watch Events**
    
    這是整個流程的起點，用來監聽 LINE 用戶傳送的所有訊息。
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **Connection** | 選擇您在 Lab 3 建立的 LINE 連結 |
    | **Webhook** | 使用現有的 Webhook (與 Lab 3/4 相同) |
    
    **輸出變數 (可在後續模組使用)：**
    - `{{1.events[].message.type}}` - 訊息類型 (text, image, video...)
    - `{{1.events[].message.id}}` - 訊息 ID (用來下載圖片)
    - `{{1.events[].replyToken}}` - 回覆用的 Token
    - `{{1.events[].source.userId}}` - 發送者的 User ID

    ---
    ### **步驟 2：流程控制 - Router**
    
    從 LINE Watch Events 模組後方拉出 Router 模組，用來根據訊息類型分流處理。
    
    **設定過濾器 (Filter) - 只處理圖片訊息：**
    
    1. 點擊 Router 與下一個模組之間的連線 (虛線)
    2. 點擊「Set up a filter」
    3. 填入以下設定：
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **Label** | `判斷為圖片訊息` |
    | **Condition 欄位 1** | `{{1.events[].message.type}}` |
    | **Operator** | `Text operators: Equal to (case insensitive)` |
    | **Condition 欄位 2** | `image` |
    
    ---
    ### **步驟 3：模組 A - LINE > Download a Message Content**
    
    **【重要】** Make.com 的 LINE 模組名稱是 `Download a Message Content`，不是 "Get Message Content"。
    
    此模組會根據 Message ID，向 LINE 伺服器請求下載圖片的原始二進位資料。
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **Connection** | 選擇同一個 LINE 連結 |
    | **Message ID** | `{{1.events[].message.id}}` (從面板拖曳選取) |
    
    **輸出變數：**
    - `{{3.data}}` - 圖片的二進位 (Binary) 資料
    - `{{3.fileName}}` - 檔案名稱 (可能為空)

    ---
    ### **步驟 4：模組 B - ImgBB > Upload a Photo (推薦方法)**
    
    Make.com 提供原生的 ImgBB 模組，比使用 HTTP 模組更簡單！
    
    **參考文件：** [Make.com ImgBB Documentation](https://apps.make.com/imgbb)
    
    **首次使用需建立 Connection：**
    1. 點擊 Connection 旁的 `Add` 按鈕
    2. 為連結命名 (例如：「我的 ImgBB」)
    3. 系統會引導您登入 ImgBB 帳號並授權
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **Connection** | 選擇或建立您的 ImgBB 連結 |
    | **Source File** | `Map` (選擇映射模式) |
    | **File Name** | `{{3.fileName}}` 或輸入自訂名稱如 `image.jpg` |
    | **Data** | `{{3.data}}` (來自 LINE Download 模組的檔案資料) |
    
    **【優點】使用原生模組的好處：**
    - ✅ 不需要手動管理 API Key
    - ✅ 不需要 Base64 編碼轉換
    - ✅ Make.com 自動處理連線與認證
    - ✅ 更清晰的錯誤訊息
    
    **輸出變數 (用於下一步)：**
    - `{{4.url}}` - 圖片的公開 URL ⭐
    - `{{4.display_url}}` - 圖片顯示 URL (備用)
    - `{{4.delete_url}}` - 刪除圖片用的 URL
    
    ---
    
    <details>
    <summary>📋 **備用方法：使用 HTTP 模組 (點擊展開)**</summary>
    
    如果您偏好使用 HTTP 模組或無法使用原生 ImgBB 模組，可以改用以下設定：
    
    **前置作業：** 至 [https://api.imgbb.com/](https://api.imgbb.com/) 取得 API Key
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **URL** | `https://api.imgbb.com/1/upload` |
    | **Method** | `POST` |
    | **Body type** | `Application/x-www-form-urlencoded` |
    
    **Fields：**
    
    | Key | Value |
    |-----|-------|
    | `key` | `您的_IMGBB_API_KEY` |
    | `image` | `{{toString(3.data; "base64")}}` |
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **Parse response** | `Yes` ✅ |
    
    **輸出變數：** `{{4.data.url}}` (注意路徑與原生模組不同)
    
    </details>

    ---
    ### **步驟 5：模組 C - Mistral AI > Make an API Call (推薦方法)**
    
    Make.com 提供原生 Mistral AI 模組！使用 **Make an API Call** 動作可以自動處理認證，同時保留完整的 API 控制權。
    
    **參考文件：** [Make.com Mistral AI Documentation](https://apps.make.com/mistral-ai)
    
    **【重要】** 必須使用 **Pixtral 視覺模型**，不能用 `mistral-large-latest`！
    
    **首次使用需建立 Connection：**
    1. 點擊 Connection 旁的 `Add` 按鈕
    2. 為連結命名 (例如：「我的 Mistral AI」)
    3. 輸入您的 Mistral AI API Key
    4. 點擊 Save
    
    **【注意】** 根據 Make.com 文件，Mistral AI 需要**付費訂閱**才能使用。
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **Connection** | 選擇或建立您的 Mistral AI 連結 |
    | **URL** | `/v1/chat/completions` |
    | **Method** | `POST` |
    
    **Body (JSON)：**
    
    ```json
    {
      "model": "pixtral-12b-2409",
      "messages": [
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": "請辨識這張圖片中的所有文字，並僅回傳文字內容，不要包含任何額外的說明或開場白。如果圖片中沒有文字，請回覆「圖片中未偵測到文字」。"
            },
            {
              "type": "image_url",
              "image_url": {
                "url": "{{4.url}}"
              }
            }
          ]
        }
      ],
      "max_tokens": 1024
    }
    ```
    
    **【變數說明】**
    - **使用原生 ImgBB 模組：** `{{4.url}}` - 直接取得圖片 URL
    - **使用 HTTP 模組上傳 imgbb：** `{{4.data.url}}` - 需多一層 data
    - 在 Make.com 編輯 JSON 時，可以直接在 `"url": "` 後方點擊，從變數面板選取
    
    **【優點】使用原生 Mistral 模組的好處：**
    - ✅ 自動處理 Authorization header
    - ✅ 連線管理更方便
    - ✅ 不需要手動填寫完整 URL
    - ✅ 更好的錯誤提示
    
    **輸出變數 (用於下一步)：**
    - `{{5.data.choices[1].message.content}}` - OCR 辨識結果文字 ⭐
    - **【注意】** Make.com 的陣列索引是 1-based，所以 `choices[0]` 要寫成 `choices[1]`
    
    ---
    
    <details>
    <summary>📋 **備用方法：使用 HTTP 模組 (點擊展開)**</summary>
    
    如果您沒有 Mistral 付費帳戶或偏好使用 HTTP 模組：
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **URL** | `https://api.mistral.ai/v1/chat/completions` |
    | **Method** | `POST` |
    
    **Headers：**
    
    | Name | Value |
    |------|-------|
    | `Content-Type` | `application/json` |
    | `Authorization` | `Bearer 您的_MISTRAL_API_KEY` |
    
    **Body type:** `Raw`  
    **Content type:** `JSON (application/json)`
    
    **Request content:** (使用上方相同的 JSON Body)
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **Parse response** | `Yes` ✅ |
    
    </details>
    
    ---
    
    **Mistral API 回應範例：**
    ```json
    {
      "id": "cmpl-xxxxx",
      "object": "chat.completion",
      "choices": [
        {
          "index": 0,
          "message": {
            "role": "assistant",
            "content": "這是圖片中辨識出的文字內容..."
          },
          "finish_reason": "stop"
        }
      ],
      "usage": {
        "prompt_tokens": 100,
        "completion_tokens": 50,
        "total_tokens": 150
      }
    }
    ```

    ---
    ### **步驟 6：模組 D - LINE > Send a Reply Message**
    
    將 OCR 辨識結果回傳給使用者。
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **Connection** | 選擇同一個 LINE 連結 |
    | **Reply Token** | `{{1.events[].replyToken}}` |
    
    **Messages (點擊 Add item)：**
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **Type** | `Text` |
    | **Text** | `{{5.data.choices[1].message.content}}` |
    
    **【美化輸出 (選用)】** 如果想加上前綴說明：
    ```
    📝 OCR 辨識結果：
    
    {{5.data.choices[1].message.content}}
    ```

    ---
    ### **步驟 7：錯誤處理與 Fallback 路徑 (進階建議)**
    
    **7-1. 非圖片訊息的回覆 (Router Else 路徑)**
    
    1. 從 Router 拉出第二條路徑
    2. 點擊該路徑的連線，選擇「Set as fallback route」(設為備用路由)
    3. 在這條路徑上新增 `LINE > Send a Reply Message` 模組：
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **Reply Token** | `{{1.events[].replyToken}}` |
    | **Text** | `請傳送圖片檔案，我會幫您辨識其中的文字！📷` |
    
    **7-2. API 錯誤處理 (Error Handler)**
    
    1. 在模組 C (Mistral API) 上按右鍵，選擇「Add error handler」
    2. 新增 `LINE > Send a Reply Message` 模組：
    
    | 設定項目 | 設定值 |
    |---------|--------|
    | **Reply Token** | `{{1.events[].replyToken}}` |
    | **Text** | `抱歉，圖片辨識過程發生錯誤，請稍後再試。🙏` |
    
    **7-3. 圖片過大處理 (選用)**
    
    在 Router 之後、Download 之前，可加入 Filter 檢查檔案大小：
    - LINE 圖片訊息包含 `contentProvider.type`，若為 `line`，檔案大小有限制

    ---
    ### **完整流程檢查清單**
    
    在啟用 Scenario 之前，請確認：
    
    **連線設定：**
    - [ ] LINE Connection 已正確設定且授權有效
    - [ ] ImgBB Connection 已建立並授權
    - [ ] Mistral AI Connection 已建立 (需輸入 API Key)
    
    **模組設定：**
    - [ ] 模型名稱使用 `pixtral-12b-2409` (不是 mistral-large-latest)
    - [ ] 圖片 URL 變數正確：原生 ImgBB 模組用 `{{4.url}}`
    - [ ] 所有變數路徑正確 (特別注意 Make.com 陣列是 1-based)
    - [ ] 已設定 Fallback 路徑處理非圖片訊息
    
    **原生模組 vs HTTP 模組對照：**
    
    | 項目 | 原生模組 (推薦) | HTTP 模組 (備用) |
    |------|----------------|------------------|
    | ImgBB URL 變數 | `{{4.url}}` | `{{4.data.url}}` |
    | Mistral URL | `/v1/chat/completions` | `https://api.mistral.ai/v1/chat/completions` |
    | 認證方式 | Connection 自動處理 | 手動填 Authorization header |

    ---
    ### **測試流程**
    
    1. 點擊右下角的「Run once」啟動監聽
    2. 用手機 LINE 傳送一張包含文字的圖片給你的機器人
    3. 觀察 Make.com 的執行狀態，確認每個模組都顯示綠色勾勾
    4. 檢查 LINE 是否收到 OCR 辨識結果
    
    **常見問題排除：**
    
    | 問題 | 可能原因 | 解決方法 |
    |------|---------|---------|
    | imgbb 上傳失敗 | API Key 錯誤或過期 | 重新確認 API Key |
    | Mistral 回傳錯誤 | 使用了不支援視覺的模型 | 改用 `pixtral-12b-2409` |
    | LINE 沒收到回覆 | Reply Token 過期 (只有 30 秒效期) | 確保流程在 30 秒內完成 |
    | 變數取不到值 | 陣列索引錯誤 | Make.com 用 1-based，不是 0-based |

    ---
    ### **替代方案：使用 OpenAI GPT-4 Vision**
    
    如果 Mistral 不穩定，可以改用 OpenAI 的 GPT-4 Vision：
    
    **URL:** `https://api.openai.com/v1/chat/completions`
    
    **Headers:**
    - `Content-Type`: `application/json`
    - `Authorization`: `Bearer 您的_OPENAI_API_KEY`
    
    **Body:**
    ```json
    {
      "model": "gpt-4o",
      "messages": [
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": "請辨識這張圖片中的所有文字，僅回傳文字內容。"
            },
            {
              "type": "image_url",
              "image_url": {
                "url": "{{4.url}}"
              }
            }
          ]
        }
      ],
      "max_tokens": 1024
    }
    ```
    
    **【注意】** 若使用 HTTP 模組上傳 imgbb，請將 `{{4.url}}` 改為 `{{4.data.url}}`

##

## **Part 7: Q\&A 與未來展望 (16:30 \- 17:00)**

- 學員問題解答
- 錯誤處理 (try-catch) 的重要性
- 後續學習資源分享（官方文件、OAuth2 函式庫）
- 課程回饋與交流
