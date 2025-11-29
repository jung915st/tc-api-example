# Google Apps Script 部署指南 - 班級管理系統 v1.2.0

## 📋 部署資訊

- **系統版本**：v1.2.0
- **部署時間**：約 30-40 分鐘
- **技術需求**：Google 帳號、網頁瀏覽器
- **校務系統整合**：內建 OAuth 2.0 客戶端認證流程

---

## 🎯 部署前準備

### 必要條件

1. **Google 帳號**
   - 有效的 Google 帳號
   - 存取 Google Drive 與 Google Sheets 的權限

2. **試算表準備**
   - 準備一個 Google 試算表
   - 或使用現有的班級管理試算表

3. **OAuth 2.0 認證資訊**（選用）
   - 如需整合臺中市校務系統，需要準備：
     - OAuth Client ID
     - OAuth Client Secret
     - Token URL
     - School API URL

### 檔案清單

部署需要的檔案：

```
classManage/
├── code/
│   ├── Config_v1.2.0.gs          ← 必要
│   └── WebApp_v1.2.0.gs          ← 必要
└── html/
    ├── Common_v1.0.0.html        ← 必要
    ├── Dashboard_v1.1.0.html     ← 必要
    ├── Attendance_v1.1.0.html    ← 必要
    ├── Sync_v1.1.0.html          ← 必要
    ├── Login_v1.2.0.html         ← 必要（新增）
    └── ErrorPages_v1.0.0.html    ← 必要
```

---

## 🚀 快速部署流程

### 步驟 1：建立或開啟 Google 試算表（5 分鐘）

#### 1.1 新建試算表

1. 前往 [Google Drive](https://drive.google.com)
2. 點選「新增」→「Google 試算表」→「空白試算表」
3. 命名為「班級管理系統 v1.2.0」

#### 1.2 或使用現有試算表

如果您已有班級管理系統的試算表，可以直接使用。

---

### 步驟 2：開啟 Apps Script 編輯器（2 分鐘）

1. 在試算表中，點選頂部選單「擴充功能」
2. 選擇「Apps Script」
3. 新視窗會開啟 Apps Script 編輯器

![開啟 Apps Script](https://i.imgur.com/example.png)

---

### 步驟 3：建立 Google Apps Script 檔案（15 分鐘）

#### 3.1 刪除預設程式碼

1. 刪除編輯器中的預設 `myFunction()` 程式碼

#### 3.2 建立 Config_v1.2.0.gs

1. 將預設檔案重新命名為 `Config_v1.2.0`
2. 從 `classManage/code/Config_v1.2.0.gs` 複製全部內容
3. 貼到編輯器中
4. **重要**：修改以下設定

```javascript
// 修改 OAuth 2.0 認證設定（如需使用校務系統整合）
OAUTH: {
  TOKEN_URL: 'https://api.cloudschool.tw/oauth?authorize',
  CLIENT_ID: 'your_client_id',           // ← 改成您的 Client ID
  CLIENT_SECRET: 'your_client_secret',   // ← 改成您的 Client Secret
  SCHOOL_API_URL: 'https://api.cloudschool.tw'
}

// 修改安全性設定
SECURITY: {
  ENABLE_AUTH: true,
  ALLOWED_DOMAINS: ['your-school.edu.tw'],  // ← 改成您學校的網域
  DEFAULT_PASSCODE: '8888'  // ← 預設登入密碼（建議修改）
}
```

5. 點選「儲存」圖示（或按 Ctrl+S / Cmd+S）

#### 3.3 建立 WebApp_v1.2.0.gs

1. 點選左側「+」圖示
2. 選擇「指令碼」
3. 命名為 `WebApp_v1.2.0`
4. 從 `classManage/code/WebApp_v1.2.0.gs` 複製全部內容
5. 貼到編輯器中
6. 點選「儲存」

#### 3.4 建立 HTML 檔案

依序建立以下 HTML 檔案：

1. **Common_v1.0.0.html**
   - 點選左側「+」→「HTML」
   - 命名為 `Common_v1.0.0`
   - 複製 `classManage/html/Common_v1.0.0.html` 內容
   - 貼上並儲存

2. **Dashboard_v1.1.0.html**
   - 點選左側「+」→「HTML」
   - 命名為 `Dashboard_v1.1.0`
   - 複製 `classManage/html/Dashboard_v1.1.0.html` 內容
   - 貼上並儲存

3. **Attendance_v1.1.0.html**
   - 點選左側「+」→「HTML」
   - 命名為 `Attendance_v1.1.0`
   - 複製 `classManage/html/Attendance_v1.1.0.html` 內容
   - 貼上並儲存

4. **Sync_v1.1.0.html**
   - 點選左側「+」→「HTML」
   - 命名為 `Sync_v1.1.0`
   - 複製 `classManage/html/Sync_v1.1.0.html` 內容
   - 貼上並儲存

5. **Login_v1.2.0.html**（新增）
   - 點選左側「+」→「HTML」
   - 命名為 `Login_v1.2.0`
   - 複製 `classManage/html/Login_v1.2.0.html` 內容
   - 貼上並儲存

6. **ErrorPages_v1.0.0.html**
   - 點選左側「+」→「HTML」
   - 命名為 `ErrorPages_v1.0.0`
   - 複製 `classManage/html/ErrorPages_v1.0.0.html` 內容
   - 貼上並儲存

完成後，您的檔案結構應如下：

```
Apps Script 專案
├── Config_v1.2.0.gs
├── WebApp_v1.2.0.gs
├── Common_v1.0.0.html
├── Dashboard_v1.1.0.html
├── Attendance_v1.1.0.html
├── Sync_v1.1.0.html
├── Login_v1.2.0.html
└── ErrorPages_v1.0.0.html
```

---

### 步驟 4：部署為 Web 應用程式（8 分鐘）

#### 4.1 觸發部署

1. 點選右上角「部署」按鈕
2. 選擇「新增部署」

#### 4.2 設定部署選項

1. **選擇類型**：
   - 點選「選取類型」
   - 選擇「Web 應用程式」

2. **填寫說明**：
   - 說明：`班級管理系統 v1.2.0`

3. **執行身分**：
   - 選擇「我」

4. **具有存取權的使用者**：
   - 選擇「任何人」（如需限制，選「僅限網域內的使用者」）

5. 點選「部署」

#### 4.3 授權

首次部署需要授權：

1. 點選「授權存取」
2. 選擇您的 Google 帳號
3. 如果出現「這個應用程式未經驗證」：
   - 點選「進階」
   - 點選「前往 [專案名稱]（不安全）」
4. 點選「允許」

#### 4.4 取得 Web App URL

1. 部署完成後，會顯示「部署 ID」和「Web 應用程式 URL」
2. **複製 Web 應用程式 URL**

格式類似：
```
https://script.google.com/macros/s/AKfycby...xxxxx.../exec
```

3. 點選「完成」

---

### 步驟 5：設定系統參數（5 分鐘）

#### 5.1 首次登入系統

1. 在瀏覽器中開啟剛複製的 Web 應用程式 URL
2. 系統會自動導向到「教師登入」頁面

#### 5.2 同步校務系統資料（必要）

**在首次登入前，必須先同步資料：**

1. 回到 Apps Script 編輯器
2. 在頂部選擇函式：`syncFromSchoolApi`
3. 點選「執行」按鈕
4. 等待執行完成（30 秒 - 2 分鐘）
5. 回到 Google 試算表，確認以下工作表已建立並有資料：
   - 「教師資料」工作表
   - 「班級資料」工作表
   - 「班級學生對照」工作表

**注意**：若未事先同步資料，登入頁面將無法顯示教師清單。

#### 5.3 教師登入

同步完成後，開啟 Web App 進行登入：

1. 在下拉選單中選擇您的姓名
   - 系統會自動顯示您的任教班級和科目
2. 輸入您的 Email
   - 首次登入時，系統會記錄此 Email
   - 之後登入需使用相同 Email
3. 輸入登入密碼（預設：`8888`）
4. 點選「登入」

**首次登入後**：
- 系統會將您的 Email 儲存到試算表
- 下次登入時必須使用相同的 Email

#### 5.4 修改預設密碼（建議）

為提升安全性，建議修改預設密碼：

1. 開啟 `Config_v1.2.0.gs`
2. 找到 `SECURITY` 設定
3. 修改 `DEFAULT_PASSCODE`：

```javascript
SECURITY: {
  DEFAULT_PASSCODE: 'your_secure_password'  // ← 修改為您的密碼
}
```

4. 儲存並重新部署

---

## ✅ 驗證部署

### 測試清單

完成部署後，請測試以下功能：

- [ ] **教師登入**
  - [ ] 能顯示教師清單（含任教班級）
  - [ ] Email 驗證正常
  - [ ] 登入密碼正確
  - [ ] 成功登入後進入儀表板

- [ ] **儀表板**
  - [ ] 能正常開啟
  - [ ] 顯示教師姓名（不是 Email）
  - [ ] 顯示登出按鈕
  - [ ] 統計卡片顯示數字
  - [ ] 圖表正常顯示

- [ ] **點名功能**
  - [ ] 能選擇年級
  - [ ] 能選擇班級
  - [ ] 學生名單正確載入
  - [ ] 能儲存點名記錄

- [ ] **同步功能**
  - [ ] OAuth 2.0 連線正常
  - [ ] 資料同步成功
  - [ ] 資料表正確更新
  - [ ] 顯示同步時間和學期資訊

- [ ] **登出功能**
  - [ ] 點選登出按鈕
  - [ ] 正確返回登入頁面
  - [ ] Session 已清除

---

## ⚙️ 進階設定

### 自動同步設定

設定定時觸發條件，自動同步校務系統資料：

1. 在 Apps Script 編輯器中，點選左側「觸發條件」（時鐘圖示）
2. 點選「新增觸發條件」
3. 設定：
   - 選擇函式：`syncFromSchoolApi`
   - 部署作業應執行：`Head`
   - 選取活動來源：`時間驅動`
   - 選取時間型觸發條件類型：`每天計時器`
   - 選取時段：`上午 6 時至 7 時`
4. 點選「儲存」

### 登入密碼設定

#### 修改預設密碼

在 `Config_v1.2.0.gs` 中：

```javascript
SECURITY: {
  ENABLE_AUTH: true,
  DEFAULT_PASSCODE: 'your_secure_password',  // ← 修改密碼
  SESSION_DURATION: 3600000  // Session 有效期：1 小時
}
```

#### Session 時效設定

調整教師登入的 Session 有效時間：

```javascript
SECURITY: {
  SESSION_DURATION: 7200000  // 2 小時（毫秒）
}
```

### 權限設定

#### 啟用網域限制

在 `Config_v1.2.0.gs` 中：

```javascript
SECURITY: {
  ENABLE_AUTH: true,
  ALLOWED_DOMAINS: ['your-school.edu.tw'],
  DEFAULT_PASSCODE: '8888',
  SESSION_DURATION: 3600000
}
```

#### 停用網域限制（開發測試）

```javascript
SECURITY: {
  ENABLE_AUTH: false,
  // ...
}
```

### OAuth 2.0 校務系統整合

#### 設定 OAuth 認證

在 `Config_v1.2.0.gs` 中：

```javascript
OAUTH: {
  TOKEN_URL: 'https://api.cloudschool.tw/oauth?authorize',
  CLIENT_ID: 'your_client_id',
  CLIENT_SECRET: 'your_client_secret',
  SCHOOL_API_URL: 'https://api.cloudschool.tw',
  TOKEN_CACHE_KEY: 'oauth_access_token',
  TOKEN_CACHE_DURATION: 3500  // Token 快取時間（秒）
}
```

#### 使用 Script Properties（更安全）

建議使用 Script Properties 儲存敏感資訊：

1. 在 Apps Script 編輯器，點選「專案設定」
2. 在「指令碼屬性」區塊，點選「新增指令碼屬性」
3. 新增以下屬性：
   - `OAUTH_CLIENT_ID` = 您的 Client ID
   - `OAUTH_CLIENT_SECRET` = 您的 Client Secret
4. 修改 `Config_v1.2.0.gs`：

```javascript
OAUTH: {
  TOKEN_URL: 'https://api.cloudschool.tw/oauth?authorize',
  CLIENT_ID: PropertiesService.getScriptProperties().getProperty('OAUTH_CLIENT_ID'),
  CLIENT_SECRET: PropertiesService.getScriptProperties().getProperty('OAUTH_CLIENT_SECRET'),
  SCHOOL_API_URL: 'https://api.cloudschool.tw'
}
```

---

## 🔄 更新部署

### 從舊版本升級到 v1.2.0

#### 升級步驟

1. **備份現有資料**
   - 複製整個試算表（檔案 → 建立副本）
   - 下載備份到本機

2. **更新 Apps Script 檔案**
   - 建立新檔案 `Config_v1.2.0.gs` 和 `WebApp_v1.2.0.gs`
   - 或直接覆蓋舊檔案內容

3. **更新 HTML 檔案**
   - 更新 `Dashboard_v1.1.0.html`（支援登出功能）
   - 更新 `Attendance_v1.1.0.html`
   - 更新 `Sync_v1.1.0.html`（OAuth 2.0 同步）
   - 新增 `Login_v1.2.0.html`（教師登入頁面）

4. **更新部署**
   - 部署 → 管理部署
   - 選擇現有部署 → 編輯
   - 版本：新版本
   - 點選「部署」

5. **測試功能**
   - 測試所有主要功能
   - 確認資料正確

### 重新部署

如果需要重新部署（例如修改程式碼後）：

1. 點選「部署」→「管理部署」
2. 點選現有部署的「編輯」圖示
3. 在「版本」下拉選單選擇「新版本」
4. 點選「部署」
5. 複製新的 Web App URL（如果有變更）

---

## 🐛 疑難排解

### 問題 1：無法顯示教師清單

**症狀**：登入頁面下拉選單為空白

**解決方法**：
1. 確認已執行 `syncFromSchoolApi()` 函式
2. 檢查 Google 試算表是否有「教師資料」工作表
3. 確認「教師資料」工作表有資料
4. 檢查 OAuth 認證設定是否正確
5. 查看執行記錄（Apps Script 編輯器 → 執行 → 查看記錄）

### 問題 2：Email 驗證失敗

**症狀**：登入時顯示「Email 不正確」

**解決方法**：
1. 確認輸入的 Email 與首次登入時相同
2. 檢查試算表「教師資料」工作表中該教師的「帳號」欄位
3. 如需重設，清空該欄位後重新登入

### 問題 3：登入密碼錯誤

**症狀**：顯示「密碼錯誤」

**解決方法**：
1. 確認使用的密碼與 `Config_v1.2.0.gs` 中設定的 `DEFAULT_PASSCODE` 一致
2. 預設密碼為：`8888`
3. 檢查是否有修改過設定

### 問題 4：授權失敗

**症狀**：部署時無法授權

**解決方法**：
1. 確認您的 Google 帳號有效
2. 清除瀏覽器快取和 Cookie
3. 使用無痕模式重試
4. 檢查是否被組織政策限制

### 問題 5：Web App 無法開啟

**症狀**：點選 URL 後顯示錯誤

**解決方法**：
1. 確認 URL 正確完整
2. 檢查部署設定：
   - 執行身分：我
   - 存取權：任何人
3. 嘗試重新部署
4. 檢查 Apps Script 執行記錄（檢視 → 執行項目）

### 問題 6：無法載入資料

**症狀**：頁面開啟但無資料

**解決方法**：
1. 檢查試算表權限
2. 確認工作表名稱正確
3. 檢查 `Config_v1.2.0.gs` 中的 `SHEET_NAMES` 設定
4. 查看執行記錄（Apps Script 編輯器 → 執行）

### 問題 7：OAuth 2.0 連線失敗

**症狀**：同步時顯示 OAuth 錯誤

**解決方法**：
1. 確認 OAuth 設定正確：
   - `TOKEN_URL`
   - `CLIENT_ID`
   - `CLIENT_SECRET`
2. 測試 OAuth Token 取得：
   - 在 Apps Script 編輯器執行 `getOAuthAccessToken()`
   - 檢查回傳結果
3. 確認網路可連線到 `https://api.cloudschool.tw`
4. 檢查 Client ID 和 Secret 是否有效

### 問題 8：校務 API 呼叫失敗

**症狀**：同步按鈕顯示 API 錯誤

**解決方法**：
1. 確認 OAuth Token 已成功取得
2. 檢查 `SCHOOL_API_URL` 設定
3. 測試 API 連線：
   ```javascript
   // 在 Apps Script 編輯器執行
   const result = callSchoolApi('/semester-data');
   Logger.log(result);
   ```
4. 確認網路連線狀態
5. 查看詳細錯誤訊息

### 問題 9：Session 過期

**症狀**：使用中突然要求重新登入

**解決方法**：
1. Session 預設有效期為 1 小時
2. 如需延長，修改 `SESSION_DURATION`：
   ```javascript
   SECURITY: {
     SESSION_DURATION: 7200000  // 2 小時
   }
   ```
3. 重新登入即可

### 問題 10：權限錯誤

**症狀**：顯示「無權限」

**解決方法**：
1. 確認已成功登入
2. 檢查 Session 是否有效
3. 暫時停用驗證測試：
   ```javascript
   SECURITY: {
     ENABLE_AUTH: false
   }
   ```
4. 重新登入

### 問題 11：圖表不顯示

**症狀**：儀表板圖表空白

**解決方法**：
1. 確認網路可連線到 `cdn.jsdelivr.net`
2. 檢查瀏覽器 Console（F12）
3. 確認有出席記錄資料
4. 清除瀏覽器快取

---

## 📊 資料表結構

部署完成後，系統會自動建立以下工作表：

### 必要工作表

| 工作表名稱 | 說明 | 自動建立 | 資料來源 |
|----------|------|---------|---------|
| 系統設定 | 系統參數設定 | ✅ | 手動 |
| 學生基本資料 | 學生資訊 | ❌ | 手動或 API |
| 缺曠記錄 | 點名記錄 | ✅ | 系統 |
| 請假總表 | 請假申請 | ✅ | 系統 |
| 作業項目 | 作業清單 | ✅ | 系統 |
| 作業繳交狀態 | 作業進度 | ✅ | 系統 |

### 校務系統整合工作表（OAuth 2.0）

| 工作表名稱 | 說明 | 欄位 | 資料來源 |
|----------|------|------|---------|
| 教師資料 | 教師清單 | UID, UID2, 姓名, 處室, 職稱, 帳號, 性別, 任教科目 | 校務 API |
| 班級資料 | 班級清單 | 年級, 班序, 班名, 導師 | 校務 API |
| 班級學生對照 | 學生清單 | 學號, 姓名, 性別, 年級, 班名, 班序, 座號 | 校務 API |

**注意事項**：
- 「教師資料」中的「任教科目」欄位格式：`年級-班序:科目(時數)`
- 例如：`2-5:本土語文(1), 2-6:本土語文(1)` 表示任教 2 年 5 班和 2 年 6 班的本土語文
- 登入系統時會自動解析此欄位顯示教師的任教班級

---

## 🔐 安全性建議

### 生產環境設定

1. **修改預設密碼**
   ```javascript
   SECURITY: {
     DEFAULT_PASSCODE: 'your_strong_password'  // 改為強密碼
   }
   ```

2. **使用 Script Properties 儲存敏感資訊**
   - OAuth Client ID
   - OAuth Client Secret
   - 登入密碼（可選）

3. **啟用權限驗證**
   ```javascript
   SECURITY: {
     ENABLE_AUTH: true,
     ALLOWED_DOMAINS: ['your-school.edu.tw']
   }
   ```

4. **限制存取權**
   - 部署時選擇「僅限網域內的使用者」

5. **定期備份**
   - 設定每週自動備份試算表
   - 或使用 Google Drive 版本控制

6. **監控日誌**
   - 定期檢查執行記錄
   - 監控登入活動
   - 注意異常行為

7. **Session 時效管理**
   ```javascript
   SECURITY: {
     SESSION_DURATION: 3600000  // 建議 1-2 小時
   }
   ```

### 開發環境設定

1. **使用測試試算表**
   - 不要在生產環境直接測試

2. **停用權限驗證**
   ```javascript
   SECURITY: {
     ENABLE_AUTH: false
   }
   ```

3. **使用測試 OAuth 認證**
   - 使用測試環境的 Client ID 和 Secret
   - 避免影響生產環境資料

4. **使用簡單密碼**
   ```javascript
   SECURITY: {
     DEFAULT_PASSCODE: '8888'  // 開發測試用
   }
   ```

---

## 📞 技術支援

### 文件資源

- **v1.2.0 README**: 完整功能說明
- **專案總覽**: 系統架構說明
- **整合文件**: OAuth 2.0 校務系統整合指南
- **V1.2.0 整合摘要**: 版本更新與功能說明

### 重要功能更新 (v1.2.0)

1. **教師登入系統**
   - 從試算表選擇教師
   - Email 驗證機制
   - 密碼保護
   - Session 管理

2. **OAuth 2.0 整合**
   - 直接連接校務系統 API
   - 自動 Token 管理
   - 資料同步優化

3. **改進的使用者體驗**
   - 自動登入檢查
   - 顯示教師任教班級
   - 登出功能
   - 響應式設計

### 常見問題

參考本文件的「疑難排解」章節

### 聯絡方式

- **Email**: support@example.com
- **GitHub Issues**: https://github.com/your-repo/issues

---

## ✅ 部署檢查清單

完成後請確認：

- [ ] Apps Script 檔案全部建立（含 Config、WebApp）
- [ ] HTML 檔案全部建立（含 Login_v1.2.0.html）
- [ ] OAuth 設定已修改（如需使用校務系統整合）
- [ ] 登入密碼已設定
- [ ] Web App 成功部署
- [ ] Web App URL 已複製
- [ ] 已執行 `syncFromSchoolApi()` 同步資料
- [ ] 教師資料已同步到試算表
- [ ] 班級資料已同步到試算表
- [ ] 學生資料已同步到試算表
- [ ] 能成功登入系統
- [ ] 登入後顯示教師姓名和任教班級
- [ ] 登出功能正常
- [ ] 所有功能測試通過
- [ ] 權限設定正確
- [ ] 資料表結構完整

---

**🎉 恭喜！部署完成！**

立即開啟您的班級管理系統 Web App URL，開始使用！

**系統版本**: v1.2.0  
**文件版本**: v1.2.0  
**最後更新**: 2025-11-29

