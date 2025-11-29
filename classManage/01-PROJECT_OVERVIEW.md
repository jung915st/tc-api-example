# 班級管理系統 Web App v1.0.0 - 專案總覽

## 📦 專案資訊

- **專案名稱**：班級管理系統 Web App
- **版本號**：v1.0.0
- **發布日期**：2025-11-18
- **開發方式**：完全使用 Google Apps Script
- **授權**：MIT License

---

## 🎯 專案目標

將原本依賴 AppSheet 的班級管理系統，**完全改用 Google Apps Script + Web App 實作**，實現：

✅ **無使用者限制** - 可供無限使用者存取  
✅ **完全免費** - 不需要 AppSheet 訂閱  
✅ **高度客製化** - 完全掌控程式碼  
✅ **安全性提升** - 敏感資訊全在後端  
✅ **響應式設計** - 手機、平板、電腦皆適用  
✅ **時區統一** - 所有時間統一 UTC+8  

---

## 📁 檔案結構

```
class-management-webapp-v1.0.0/
│
├── 📄 Google Apps Script 檔案 (.gs)
│   ├── Config_v1.0.0.gs          # 系統配置、時區、安全驗證
│   ├── WebApp_v1.0.0.gs          # Web App 路由和 API
│   ├── Code_v1.0.0.gs            # 業務邏輯（沿用舊版）
│   ├── MailHandler_v1.0.0.gs     # 郵件通知（沿用舊版）
│   └── DataHandler_v1.0.0.gs     # 資料查詢（沿用舊版）
│
├── 🌐 HTML 介面檔案 (.html)
│   ├── Common_v1.0.0.html        # 共用 CSS 和 JavaScript
│   ├── Dashboard_v1.0.0.html     # 儀表板頁面
│   ├── Attendance_v1.0.0.html    # 點名頁面
│   ├── Homework_v1.0.0.html      # 作業管理（待實作）
│   ├── Students_v1.0.0.html      # 學生管理（待實作）
│   ├── Leave_v1.0.0.html         # 請假管理（待實作）
│   └── ErrorPages_v1.0.0.html    # 錯誤和無權限頁面
│
└── 📚 文檔檔案 (.md)
    ├── VERSION_1.0.0_README.md   # 版本說明和功能介紹
    ├── DEPLOYMENT_GUIDE.md       # 快速部署指南（30分鐘）
    └── PROJECT_OVERVIEW.md       # 本檔案
```

---

## 🔑 核心檔案說明

### 1. Config_v1.0.0.gs

**用途**：系統配置中心

**內容**：
- ✅ 版本資訊管理
- ✅ **時區設定（UTC+8）**
- ✅ 系統常數定義
- ✅ **安全性驗證機制**
- ✅ 快取管理
- ✅ 工具函數

**重要設定**：
```javascript
// 必須修改的部分
TEACHER: {
  NAME: '您的姓名',           // ← 改這裡
  EMAIL: 'your@email.com',    // ← 改這裡  
  CLASS: '一年一班'           // ← 改這裡
}

// 安全性設定
SECURITY: {
  ENABLE_AUTH: true,                    // 是否啟用權限驗證
  ALLOWED_DOMAINS: ['school.edu.tw'],   // 允許的網域
}
```

**特色功能**：
- 🕐 **時區統一處理**：`formatDateTimeUTC8()` 確保所有時間為 UTC+8
- 🔒 **權限驗證**：`verifyUserPermission()` 檢查使用者權限
- 💾 **快取機制**：`getCache()` / `setCache()` 提升效能

---

### 2. WebApp_v1.0.0.gs

**用途**：Web App 核心引擎

**內容**：
- ✅ HTTP 請求路由（GET/POST）
- ✅ 頁面渲染函數
- ✅ **前端呼叫的 API 函數**
- ✅ 資料處理函數

**路由表**：
```javascript
GET ?page=dashboard  → 儀表板
GET ?page=attendance → 點名頁面
GET ?page=homework   → 作業管理
GET ?page=students   → 學生管理
GET ?page=leave      → 請假管理
```

**API 函數**（供前端呼叫）：
```javascript
getDashboardData()              // 取得儀表板資料
getSemesterDirectory(options)   // 從 TC-API 載入班級與教師資料
getStudentList()                // 取得學生清單
getTodayAttendanceData(params)  // 取得指定班級的今日點名資料
getHomeworkList()               // 取得作業清單
getLeaveList()                  // 取得請假清單
handleAddAttendance(data)       // 新增點名記錄
handleUpdateHomeworkStatus(data)// 更新作業狀態
handleApproveLeave(data)        // 審核請假
```

**重要**：所有敏感資訊（API keys, 設定）都在此檔案或 Config 中，**不會暴露到前端**。

---

### 3. Common_v1.0.0.html

**用途**：共用樣式和函數庫

**內容**：
- ✅ **響應式 CSS 樣式**
- ✅ 導航列樣式
- ✅ 卡片、表格、表單樣式
- ✅ 共用 JavaScript 函數
- ✅ 載入動畫、提示訊息

**CSS 變數**（可自訂主題）：
```css
:root {
  --primary-color: #667eea;      /* 主色 */
  --secondary-color: #764ba2;    /* 次色 */
  --success-color: #4caf50;      /* 成功 */
  --warning-color: #ff9800;      /* 警告 */
  --danger-color: #f44336;       /* 危險 */
}
```

**響應式斷點**：
```css
@media (max-width: 768px) {
  /* 手機版樣式 */
}
```

**共用函數**：
```javascript
showLoading(containerId)     // 顯示載入動畫
showError(containerId, msg)  // 顯示錯誤訊息
showSuccess(msg)             // 顯示成功訊息
formatDate(dateString)       // 格式化日期
formatDateTime(dateString)   // 格式化日期時間
getTodayString()             // 取得今天日期字串
```

---

### 4. Dashboard_v1.0.0.html

**用途**：系統首頁 / 儀表板

**功能**：
- ✅ 統計卡片（學生數、缺曠、作業、請假）
- ✅ 即時「班級出席圖表」顯示每班出席/請假/未記錄狀態
- ✅ 昨日缺曠記錄
- ✅ 逾期未交作業清單
- ✅ 待審核請假單
- ✅ **一鍵審核**請假功能
- ✅ 自動更新時間顯示

**資料來源**：
```javascript
google.script.run
  .withSuccessHandler(onDataLoaded)
  .getDashboardData();
```

**特色**：
- 📊 視覺化統計數字
- 🔄 支援「重新整理」功能
- ⚡ 使用快取提升載入速度
- 📱 響應式版面（手機/平板/電腦）

---

### 5. Attendance_v1.0.0.html

**用途**：每日點名介面

**功能**：
- ✅ 顯示所有學生名單
- ✅ 依年級/班級從 TC-API 載入導師與學生資料
- ✅ 內建班級切換、重新整理與資料來源提示
- ✅ 選擇出席狀態（出席/病假/事假/曠課/遲到）
- ✅ 備註欄位
- ✅ **快速操作**（全部出席、清除）
- ✅ 即時顯示已記錄數量
- ✅ 批次儲存

**操作流程**：
1. 系統載入今日學生名單
2. 教師逐一選擇出席狀態
3. 或使用「全部出席」快速設定
4. 點選「儲存點名記錄」
5. 系統批次寫入試算表

**資料處理**：
```javascript
handleAddAttendance({
  records: [
    { seatNumber, name, status, notes },
    // ...
  ]
})
```

---

## 🔐 安全性設計

### 三層安全機制

#### 第 1 層：權限驗證
```javascript
// 在 doGet() 和 doPost() 中驗證
const user = getCurrentUser();
if (!user.hasPermission) {
  return renderUnauthorized();
}
```

#### 第 2 層：網域限制
```javascript
SECURITY: {
  ALLOWED_DOMAINS: ['school.edu.tw']  // 只允許特定網域
}
```

#### 第 3 層：後端處理
- 所有敏感操作在後端執行
- 前端只能透過 `google.script.run` 呼叫
- 無法直接存取試算表

### 資料保護

✅ **不在 HTML 中存放**：
- ❌ API Keys
- ❌ 密碼
- ❌ Email 設定
- ❌ 系統設定

✅ **全部在 .gs 檔案中**：
- ✅ Config_v1.0.0.gs
- ✅ WebApp_v1.0.0.gs

---

## ⏰ 時區處理（UTC+8）

### 統一時區設定

```javascript
const TIMEZONE_CONFIG = {
  TIMEZONE: 'Asia/Taipei',
  UTC_OFFSET: 8,
  LOCALE: 'zh-TW'
};
```

### 時間處理函數

```javascript
// 格式化為 UTC+8
formatDateTimeUTC8(date, format)

// 取得當前時間（UTC+8）
getCurrentTime()
```

### 使用範例

```javascript
// 儲存時間時
const now = getCurrentTime();  // 自動 UTC+8

// 顯示時間時
const timeString = formatDateTimeUTC8(now, 'datetime');
// 輸出：2025-11-18 14:30:00
```

---

## 📱 響應式設計

### 三種版面模式

#### 電腦版（> 1024px）
- 完整導航列
- 多欄位版面
- 所有功能可見

#### 平板版（768px - 1024px）
- 自適應欄位
- 保留主要功能
- 觸控友善

#### 手機版（< 768px）
- 漢堡選單
- 單欄版面
- 大按鈕設計
- 觸控優化

### 實作方式

```css
@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;  /* 單欄 */
  }
  
  .navbar-menu {
    display: none;  /* 隱藏選單 */
  }
  
  .navbar-toggle {
    display: block;  /* 顯示選單按鈕 */
  }
}
```

---

## 🚀 部署流程

### 快速部署（30 分鐘）

#### 步驟 1：準備檔案（5 分鐘）
- 複製所有 .gs 和 .html 檔案
- 修改 Config_v1.0.0.gs 中的教師資訊

#### 步驟 2：建立專案（15 分鐘）
- 在 Apps Script 編輯器建立檔案
- 貼上程式碼
- 儲存

#### 步驟 3：部署 Web App（5 分鐘）
- 部署 → 新增部署
- 類型：Web 應用程式
- 存取權：任何人
- 複製 URL

#### 步驟 4：測試（5 分鐘）
- 開啟 Web App URL
- 測試各項功能
- 確認運作正常

### 詳細步驟

請參考：**DEPLOYMENT_GUIDE.md**

---

## 🎨 客製化指南

### 修改顏色主題

在 `Common_v1.0.0.html` 中：

```css
:root {
  --primary-color: #YOUR_COLOR;    /* 改成學校代表色 */
  --secondary-color: #YOUR_COLOR;  /* 次要顏色 */
}
```

### 修改版面配置

調整 grid 欄位：

```css
.stats-grid {
  grid-template-columns: repeat(4, 1fr);  /* 4欄 */
}
```

### 新增功能頁面

1. 建立新的 HTML 檔案
2. 在 `WebApp_v1.0.0.gs` 新增路由
3. 在導航列新增連結

---

## 📊 效能優化

### 快取策略

| 資料類型 | 快取時間 | 用途 |
|---------|---------|------|
| 儀表板摘要 | 5 分鐘 | 減少重複查詢 |
| 學生清單 | 30 分鐘 | 資料不常變動 |
| 作業清單 | 30 分鐘 | 減輕資料庫負擔 |

### 批次處理

```javascript
// 點名支援批次新增
const rows = records.map(r => [
  date, seatNumber, name, status, time, recorder, notes
]);

sheet.getRange(startRow, 1, rows.length, 7).setValues(rows);
```

### 載入優化

- 使用 `withSuccessHandler` 異步載入
- 顯示載入動畫提升使用者體驗
- 錯誤處理機制

---

## 🔄 版本管理

### 檔案命名規則

```
檔案名稱_v主版號.次版號.修訂號.副檔名

範例：
Config_v1.0.0.gs
Dashboard_v1.0.0.html
```

### 版本號意義

- **主版號（Major）**：重大架構變更
- **次版號（Minor）**：新增功能
- **修訂號（Patch）**：Bug 修復

### 更新流程

1. **建立新版本檔案**（不覆蓋舊檔）
2. **更新版本號**
3. **記錄變更日誌**
4. **測試新版本**
5. **部署上線**

---

## 📝 待完成功能

### v1.1.0 規劃

- [ ] Homework_v1.0.0.html - 作業管理完整介面
- [ ] Students_v1.0.0.html - 學生管理介面
- [ ] Leave_v1.0.0.html - 請假管理完整介面
- [ ] 批次匯入學生資料
- [ ] CSV 匯出功能

### v1.2.0 規劃

- [ ] 週報表自動產生
- [ ] 圖表統計強化
- [ ] LINE Notify 整合
- [ ] 手機推播通知

---

## 🐛 已知問題

### v1.0.0 限制

1. **部分頁面未完成**
   - Homework、Students、Leave 頁面為簡化版
   - 可使用試算表手動操作

2. **無離線功能**
   - 需要網路連線
   - 建議使用快取提升速度

3. **無原生 App**
   - 透過瀏覽器存取
   - 可加入手機桌面

---

## 📞 技術支援

### 問題排除

1. **查看文檔**
   - VERSION_1.0.0_README.md
   - DEPLOYMENT_GUIDE.md

2. **檢查執行記錄**
   - Apps Script 編輯器
   - 左側「執行」圖示

3. **測試環境**
   - 建立測試用試算表
   - 隔離問題

### 常見問題

參考 **DEPLOYMENT_GUIDE.md** 的疑難排解章節

---

## 📚 相關文檔

- **VERSION_1.0.0_README.md** - 完整功能說明和變更記錄
- **DEPLOYMENT_GUIDE.md** - 30分鐘快速部署指南
- **PROJECT_OVERVIEW.md** - 本檔案（專案總覽）

---

## 🎉 總結

**班級管理系統 Web App v1.0.0** 是一個：

✅ **完全免費**的解決方案  
✅ **高度客製化**的系統  
✅ **安全可靠**的架構  
✅ **響應式設計**的介面  
✅ **易於部署**的專案  

**無使用者限制，永久免費使用！**

---

**專案版本**：v1.0.0  
**文檔版本**：v1.0.0  
**最後更新**：2025-11-18  
**維護者**：班級管理系統開發團隊

**祝您使用愉快！** 🎊
