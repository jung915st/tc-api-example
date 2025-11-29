# Google Apps Script 部署指南 - 班級管理系統 v1.2.0

## 📋 部署資訊

- **系統版本**：v1.2.0
- **部署時間**：約 30-40 分鐘
- **技術需求**：Google 帳號、網頁瀏覽器
- **tc-api 需求**：選用（如需整合校務系統）

---

## 🎯 部署前準備

### 必要條件

1. **Google 帳號**
   - 有效的 Google 帳號
   - 存取 Google Drive 與 Google Sheets 的權限

2. **試算表準備**
   - 準備一個 Google 試算表
   - 或使用現有的班級管理試算表

3. **tc-api 設定**（選用）
   - 如需整合校務系統，需先設定 tc-api 後端
   - tc-api 後端 URL
   - 確保網路可連線

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
// 修改 tc-api 連線位址（如需使用）
TC_API: {
  BASE_URL: 'http://your-server:3001/api',  // ← 改成您的 tc-api 位址
  ENABLED: true  // 或設為 false 停用整合
}

// 修改安全性設定
SECURITY: {
  ENABLE_AUTH: true,
  ALLOWED_DOMAINS: ['your-school.edu.tw'],  // ← 改成您學校的網域
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

5. **ErrorPages_v1.0.0.html**
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

#### 5.1 開啟 Web App

1. 在瀏覽器中開啟剛複製的 Web 應用程式 URL
2. 系統會顯示班級管理系統首頁

#### 5.2 設定教師資訊

1. 回到 Google 試算表
2. 檢查是否有「系統設定」工作表
   - 如果沒有，會在首次執行時自動建立
3. 在「系統設定」工作表中新增：

| 設定項目 | 設定值 | 說明 |
|---------|--------|------|
| 導師姓名 | 您的姓名 | 教師姓名 |
| 導師Email | your@email.com | 您的 Email |
| 班級名稱 | 701 | 您的班級名稱 |

#### 5.3 同步 tc-api 資料（如有整合）

如果您有設定 tc-api 整合：

1. 前往 Web App 的「同步」頁面
2. 確認 API 位址正確
3. 點選「開始同步資料」
4. 等待同步完成（30 秒 - 2 分鐘）
5. 確認資料已同步：
   - 檢查「教師資料」工作表
   - 檢查「班級資料」工作表
   - 檢查「班級學生對照」工作表

---

## ✅ 驗證部署

### 測試清單

完成部署後，請測試以下功能：

- [ ] **儀表板**
  - [ ] 能正常開啟
  - [ ] 統計卡片顯示數字
  - [ ] 圖表正常顯示

- [ ] **點名功能**
  - [ ] 能選擇年級
  - [ ] 能選擇班級
  - [ ] 學生名單正確載入
  - [ ] 能儲存點名記錄

- [ ] **同步功能**（如有）
  - [ ] tc-api 連線正常
  - [ ] 資料同步成功
  - [ ] 資料表正確更新

- [ ] **權限驗證**
  - [ ] 正確的使用者可以存取
  - [ ] 未授權使用者被拒絕（如有啟用）

---

## ⚙️ 進階設定

### 自動同步設定

設定定時觸發條件，自動同步 tc-api 資料：

1. 在 Apps Script 編輯器中，點選左側「觸發條件」（時鐘圖示）
2. 點選「新增觸發條件」
3. 設定：
   - 選擇函式：`syncFromTcApi`
   - 部署作業應執行：`Head`
   - 選取活動來源：`時間驅動`
   - 選取時間型觸發條件類型：`每天計時器`
   - 選取時段：`上午 6 時至 7 時`
4. 點選「儲存」

### 權限設定

#### 啟用網域限制

在 `Config_v1.2.0.gs` 中：

```javascript
SECURITY: {
  ENABLE_AUTH: true,
  ALLOWED_DOMAINS: ['your-school.edu.tw'],
  MAX_LOGIN_ATTEMPTS: 5,
  SESSION_COOKIE_NAME: 'class_mgmt_session'
}
```

#### 停用網域限制（開發測試）

```javascript
SECURITY: {
  ENABLE_AUTH: false,
  // ...
}
```

### tc-api 整合設定

#### 啟用 tc-api

```javascript
TC_API: {
  BASE_URL: 'http://your-server:3001/api',
  ENABLED: true,
  TIMEOUT: 30000
}
```

#### 停用 tc-api

```javascript
TC_API: {
  ENABLED: false
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
   - 更新 `Dashboard_v1.1.0.html`
   - 更新 `Attendance_v1.1.0.html`
   - 新增 `Sync_v1.1.0.html`

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

### 問題 1：授權失敗

**症狀**：部署時無法授權

**解決方法**：
1. 確認您的 Google 帳號有效
2. 清除瀏覽器快取和 Cookie
3. 使用無痕模式重試
4. 檢查是否被組織政策限制

### 問題 2：Web App 無法開啟

**症狀**：點選 URL 後顯示錯誤

**解決方法**：
1. 確認 URL 正確完整
2. 檢查部署設定：
   - 執行身分：我
   - 存取權：任何人
3. 嘗試重新部署
4. 檢查 Apps Script 執行記錄（檢視 → 執行項目）

### 問題 3：無法載入資料

**症狀**：頁面開啟但無資料

**解決方法**：
1. 檢查試算表權限
2. 確認工作表名稱正確
3. 檢查 `Config_v1.2.0.gs` 中的 `SHEET_NAMES` 設定
4. 查看執行記錄（Apps Script 編輯器 → 執行）

### 問題 4：tc-api 連線失敗

**症狀**：同步按鈕顯示錯誤

**解決方法**：
1. 確認 tc-api 後端運行：
   ```bash
   curl http://localhost:3001/api/teachers
   ```
2. 檢查 `BASE_URL` 設定
3. 確認網路連線
4. 檢查防火牆設定
5. 查看 tc-api 後端日誌

### 問題 5：權限錯誤

**症狀**：顯示「無權限」

**解決方法**：
1. 檢查 Email 網域設定
2. 暫時停用驗證：
   ```javascript
   SECURITY: {
     ENABLE_AUTH: false
   }
   ```
3. 確認「系統設定」工作表中的 Email 正確

### 問題 6：圖表不顯示

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

| 工作表名稱 | 說明 | 自動建立 |
|----------|------|---------|
| 系統設定 | 系統參數設定 | ✅ |
| 學生基本資料 | 學生資訊 | ❌ 手動 |
| 缺曠記錄 | 點名記錄 | ✅ |
| 請假總表 | 請假申請 | ✅ |
| 作業項目 | 作業清單 | ✅ |
| 作業繳交狀態 | 作業進度 | ✅ |

### tc-api 整合工作表

| 工作表名稱 | 說明 | 來源 |
|----------|------|------|
| 教師資料 | 教師清單 | tc-api |
| 班級資料 | 班級清單 | tc-api |
| 班級學生對照 | 學生清單 | tc-api |

---

## 🔐 安全性建議

### 生產環境設定

1. **啟用權限驗證**
   ```javascript
   SECURITY: {
     ENABLE_AUTH: true,
     ALLOWED_DOMAINS: ['your-school.edu.tw']
   }
   ```

2. **限制存取權**
   - 部署時選擇「僅限網域內的使用者」

3. **定期備份**
   - 設定每週自動備份試算表
   - 或使用 Google Drive 版本控制

4. **監控日誌**
   - 定期檢查執行記錄
   - 監控異常活動

### 開發環境設定

1. **使用測試試算表**
   - 不要在生產環境直接測試

2. **停用權限驗證**
   ```javascript
   SECURITY: {
     ENABLE_AUTH: false
   }
   ```

3. **使用本機 tc-api**
   ```javascript
   TC_API: {
     BASE_URL: 'http://localhost:3001/api'
   }
   ```

---

## 📞 技術支援

### 文件資源

- **v1.2.0 README**: 完整功能說明
- **專案總覽**: 系統架構說明
- **tc-api 整合文件**: API 整合指南

### 常見問題

參考本文件的「疑難排解」章節

### 聯絡方式

- **Email**: support@example.com
- **GitHub Issues**: https://github.com/your-repo/issues

---

## ✅ 部署檢查清單

完成後請確認：

- [ ] Apps Script 檔案全部建立
- [ ] HTML 檔案全部建立
- [ ] Config 設定已修改
- [ ] Web App 成功部署
- [ ] Web App URL 已複製
- [ ] 系統參數已設定
- [ ] tc-api 已同步（如有）
- [ ] 所有功能測試通過
- [ ] 權限設定正確
- [ ] 資料表結構完整

---

**🎉 恭喜！部署完成！**

立即開啟您的班級管理系統 Web App URL，開始使用！

**系統版本**: v1.2.0  
**文件版本**: v1.2.0  
**最後更新**: 2025-11-29

