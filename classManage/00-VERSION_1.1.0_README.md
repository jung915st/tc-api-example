# 班級管理系統 v1.1.0 - 功能總覽

## 📦 版本資訊

- **版本號**: v1.1.0
- **發布日期**: 2025-11-29
- **基於版本**: v1.0.0
- **開發方式**: Google Apps Script with tc-api Integration

---

## 🎯 核心更新

### 1. tc-api 整合 ✨

**功能說明**:
完整整合校務系統 API（tc-api），實現自動化資料同步

**主要特色**:
- 📡 HTTP API 呼叫（使用 `UrlFetchApp`）
- 🔄 一鍵同步教師、班級、學生資料
- 💾 智慧快取機制（30 分鐘）
- ⚙️ 可設定同步間隔與逾時
- 📊 即時同步日誌顯示

**技術實作**:
```javascript
// Config_v1.1.0.gs
function callTcApi(endpoint, method = 'GET', payload = null) {
  const url = CONFIG.TC_API.BASE_URL + endpoint;
  const options = {
    method: method,
    contentType: 'application/json',
    muteHttpExceptions: true,
    timeout: CONFIG.TC_API.TIMEOUT
  };
  
  const response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText());
}
```

**支援的 API 端點**:
- `/sync-school` - 觸發 tc-api 同步
- `/teachers` - 取得教師清單
- `/classes` - 取得班級清單
- `/students` - 取得學生清單
- `/semester-data` - 取得學期完整資料

---

### 2. 多班級點名系統 🎓

**功能說明**:
全新設計的點名介面，支援跨年級、跨班級的靈活點名操作

**操作流程**:
1. **年級選擇** → 顯示所有年級按鈕（7, 8, 9 年級）
2. **班級選擇** → 顯示該年級所有班級卡片
3. **學生點名** → 視覺化學生卡片，快速點選狀態
4. **批次儲存** → 一次儲存所有點名記錄

**UI/UX 特色**:
- 🎨 視覺化學生卡片設計
- 🎯 快速狀態按鈕（5 種狀態）
- 📝 每位學生可填寫備註
- ⚡ 快速操作（全部出席、清除全部）
- 📊 即時顯示已記錄數量（5/30）

**出席狀態**:
- ✓ 出席（綠色）
- 🏥 病假（橙色）
- 📋 事假（藍色）
- ❌ 曠課（紅色）
- ⏰ 遲到（紫色）

**響應式設計**:
- 桌面版：3 欄網格佈局
- 平板版：2 欄網格佈局
- 手機版：1 欄佈局

---

### 3. 即時出席統計儀表板 📊

**功能說明**:
使用 Chart.js 實現的即時互動式圖表系統

**圖表類型**:
- **圓餅圖**：各班級出席狀況分佈
- **統計卡片**：詳細數據顯示
- **出席率計算**：自動計算百分比

**即時更新機制**:
- 手動更新：點選「更新圖表」按鈕
- 自動更新：每 5 分鐘自動刷新
- 快取優化：5 分鐘快取減少查詢

**資料展示**:
```javascript
// 每個班級顯示
{
  className: "701",
  present: 28,    // 出席人數
  absent: 1,      // 曠課人數
  sick: 1,        // 病假人數
  personal: 0,    // 事假人數
  late: 0,        // 遲到人數
  attendanceRate: 93%  // 自動計算出席率
}
```

**視覺化效果**:
- 顏色編碼（出席=綠、曠課=紅、病假=橙）
- 懸浮提示（顯示人數與百分比）
- 圖例說明（底部顯示）
- 響應式圖表（自動調整大小）

---

### 4. 資料同步管理頁面 🔄

**功能說明**:
專門的同步管理介面，提供完整的資料同步控制

**主要功能**:
- 📡 連線狀態檢查
- 🔄 一鍵同步所有資料
- 📊 資料數量統計
- 📝 即時同步日誌
- ⏰ 上次同步時間顯示

**同步流程**:
1. 檢查 tc-api 連線狀態
2. 觸發 tc-api 後端同步
3. 依序取得：
   - 教師資料 → 存入「教師資料」表
   - 班級資料 → 存入「班級資料」表
   - 學生資料 → 存入「班級學生對照」表
4. 更新系統設定（記錄同步時間）
5. 清除相關快取

**日誌系統**:
- 時間戳記（HH:MM:SS）
- 訊息分類（資訊/成功/錯誤）
- 顏色編碼（綠=成功、紅=錯誤、藍=資訊）
- 自動捲動到最新訊息

**狀態指示器**:
- ⏰ 等待同步（黃色）
- 🔄 同步中...（黃色，動畫）
- ✓ 同步成功（綠色）
- ✗ 同步失敗（紅色）

---

## 📁 檔案結構

### Google Apps Script 檔案 (.gs)

```
classManage/code/
├── Config_v1.1.0.gs          # 系統配置（含 tc-api 整合）
└── WebApp_v1.1.0.gs          # Web App 主程式（含新 API）
```

### HTML 介面檔案 (.html)

```
classManage/html/
├── Common_v1.0.0.html        # 共用樣式（未變更）
├── Dashboard_v1.1.0.html     # 儀表板（新增圖表）
├── Attendance_v1.1.0.html    # 點名頁面（全新設計）
├── Sync_v1.1.0.html          # 同步頁面（全新）
└── ErrorPages_v1.0.0.html    # 錯誤頁面（未變更）
```

### 文件檔案 (.md)

```
classManage/
├── 02-DEPLOYMENT_GUIDE_v1.1.0.md    # v1.1.0 部署指南
└── 00-VERSION_1.1.0_README.md       # 本檔案
```

---

## 🔧 技術架構

### 資料流程

```
tc-api 伺服器
    ↓
【HTTP GET】
    ↓
Google Apps Script
    ↓
【解析 JSON】
    ↓
Google 試算表
    ↓
【查詢資料】
    ↓
Web App 前端
    ↓
【Chart.js 渲染】
    ↓
即時圖表顯示
```

### 資料表結構

#### 1. 教師資料表
```
| UID | UID2 | 姓名 | 處室 | 職稱 | 是否導師 | Email | 任教班級 |
```

#### 2. 班級資料表
```
| 年級 | 班序 | 班名 |
```

#### 3. 班級學生對照表
```
| 學號 | 姓名 | 性別 | 年級 | 班名 | 班序 | 座號 |
```

#### 4. 缺曠記錄表（新增欄位）
```
| 日期 | 座號 | 姓名 | 狀態 | 記錄時間 | 記錄者 | 備註 | 年級 | 班序 |
                                                        ↑新增  ↑新增
```

### API 函數（供前端呼叫）

#### 新增的函數

```javascript
// 取得教師清單
getTeachersListForUI()

// 取得班級清單（可依年級篩選）
getClassesListForUI(grade = null)

// 取得班級學生（含今日點名狀態）
getStudentsByClassForAttendance(grade, classSeq)

// 取得各班出席統計
getAttendanceStatsByClass()

// 執行 tc-api 同步
syncFromTcApi()
```

#### 更新的函數

```javascript
// 新增點名記錄（新增 grade、classSeq 參數）
handleAddAttendance(attendanceData)
// attendanceData = { records, grade, classSeq }

// 取得儀表板資料（新增 attendanceStats）
getDashboardData()
// 回傳包含 attendanceStats 欄位
```

---

## 🎨 UI/UX 改進

### 1. 導航列更新

新增「同步」選單項目：

```html
<li><a href="?page=sync"><i class="fas fa-sync"></i> 同步</a></li>
```

### 2. 顏色系統

```css
出席：#4caf50（綠色）
曠課：#f44336（紅色）
病假：#ff9800（橙色）
事假：#2196f3（藍色）
遲到：#9c27b0（紫色）
```

### 3. 響應式設計

- **桌面版** (> 1024px)：完整佈局
- **平板版** (768px - 1024px)：2 欄佈局
- **手機版** (< 768px)：1 欄佈局，漢堡選單

### 4. 載入動畫

```css
.spinner {
  border: 4px solid rgba(102, 126, 234, 0.3);
  border-top: 4px solid var(--primary-color);
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 1s linear infinite;
}
```

---

## ⚙️ 設定選項

### tc-api 設定

在 `Config_v1.1.0.gs` 中：

```javascript
TC_API: {
  BASE_URL: 'http://localhost:3001/api',  // 修改為您的 tc-api 位址
  ENDPOINTS: {
    SYNC: '/sync-school',
    STUDENTS: '/students',
    TEACHERS: '/teachers',
    CLASSES: '/classes',
    SEMESTER_DATA: '/semester-data'
  },
  SYNC_INTERVAL: 3600000,  // 1 小時（毫秒）
  CACHE_DURATION: 1800,     // 30 分鐘（秒）
  TIMEOUT: 30000            // 30 秒
}
```

### 快取設定

```javascript
CACHE_CONFIG: {
  DURATION: {
    SHORT: 300,      // 5 分鐘（儀表板）
    MEDIUM: 1800,    // 30 分鐘（教師、班級）
    LONG: 3600       // 1 小時
  }
}
```

### 安全性設定

```javascript
SECURITY: {
  ENABLE_AUTH: true,                    // 啟用權限驗證
  ALLOWED_DOMAINS: ['school.edu.tw'],   // 允許的 Email 網域
  MAX_LOGIN_ATTEMPTS: 5,
  SESSION_COOKIE_NAME: 'class_mgmt_session'
}
```

---

## 🚀 效能優化

### 1. 快取策略

| 資料類型 | 快取時間 | 更新時機 |
|---------|---------|---------|
| 儀表板摘要 | 5 分鐘 | 手動刷新 / 自動刷新 |
| 教師清單 | 30 分鐘 | 同步後清除 |
| 班級清單 | 30 分鐘 | 同步後清除 |
| 學生清單 | 30 分鐘 | 同步後清除 |

### 2. 批次處理

```javascript
// 點名記錄批次寫入
const rows = records.map(r => [
  date, seatNumber, name, status, time, recorder, notes, grade, classSeq
]);

sheet.getRange(startRow, 1, rows.length, 9).setValues(rows);
```

### 3. 條件式載入

只在需要時載入 Chart.js：

```html
<!-- 僅在 Dashboard 載入 -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

---

## 🔒 安全性增強

### 1. API 呼叫安全

```javascript
function callTcApi(endpoint, method = 'GET', payload = null) {
  try {
    const options = {
      method: method,
      contentType: 'application/json',
      muteHttpExceptions: true,  // 捕捉 HTTP 錯誤
      timeout: CONFIG.TC_API.TIMEOUT
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    
    if (code >= 200 && code < 300) {
      return JSON.parse(response.getContentText());
    } else {
      return { error: `API錯誤: ${code}` };
    }
  } catch (error) {
    return { error: error.toString() };
  }
}
```

### 2. 權限驗證

```javascript
function verifyUserPermission(userEmail) {
  if (!CONFIG.SECURITY.ENABLE_AUTH) {
    return true;
  }
  
  // 檢查是否為導師
  const teacherInfo = getTeacherInfo();
  if (userEmail === teacherInfo.email) {
    return true;
  }
  
  // 檢查網域
  const domain = userEmail.split('@')[1];
  if (CONFIG.SECURITY.ALLOWED_DOMAINS.includes(domain)) {
    return true;
  }
  
  return false;
}
```

### 3. 資料驗證

```javascript
// 檢查 tc-api 回傳資料格式
if (!data || data.error) {
  return { success: false, message: '資料格式錯誤' };
}
```

---

## 📊 使用統計

### 預期效能

- **同步時間**: 30 秒 - 2 分鐘（取決於資料量）
- **頁面載入**: < 2 秒（首次）、< 0.5 秒（快取命中）
- **點名操作**: < 1 秒（30 位學生）
- **圖表渲染**: < 0.5 秒

### 資料容量

- **教師數量**: 無限制（建議 < 500）
- **班級數量**: 無限制（建議 < 100）
- **學生數量**: 無限制（建議 < 5000）
- **點名記錄**: 無限制（Google 試算表上限：500 萬列）

---

## 🆕 與 v1.0.0 的差異

### 新增功能

| 功能 | v1.0.0 | v1.1.0 |
|-----|--------|--------|
| tc-api 整合 | ❌ | ✅ |
| 多班級點名 | ❌ | ✅ |
| 即時圖表 | ❌ | ✅ |
| 資料同步頁面 | ❌ | ✅ |
| 年級選擇器 | ❌ | ✅ |
| 班級選擇器 | ❌ | ✅ |
| 視覺化點名卡片 | ❌ | ✅ |

### 資料結構變更

| 工作表 | v1.0.0 | v1.1.0 |
|-------|--------|--------|
| 教師資料 | ❌ | ✅ 新增 |
| 班級資料 | ❌ | ✅ 新增 |
| 班級學生對照 | ❌ | ✅ 新增 |
| 缺曠記錄 | ✅ | ✅ 新增欄位（年級、班序） |
| 學生基本資料 | ✅ | ✅ 保留相容 |

---

## 🎯 使用場景

### 場景 1：開學初設定

1. 部署 Web App
2. 設定 tc-api 連線
3. 執行首次同步
4. 驗證資料正確性
5. 設定自動同步（選用）

### 場景 2：每日點名

1. 登入系統
2. 前往「點名」頁面
3. 選擇年級 → 選擇班級
4. 快速點選學生狀態
5. 儲存點名記錄

### 場景 3：查看統計

1. 前往「儀表板」
2. 查看即時圖表
3. 檢視各班出席率
4. 識別異常班級
5. 必要時聯繫導師

### 場景 4：學生異動

1. 在 tc-api 中更新學生資料
2. 前往「同步」頁面
3. 執行手動同步
4. 確認資料已更新

---

## 🔮 未來規劃 (v1.2.0)

### 計劃新增功能

- [ ] LINE Notify 整合
- [ ] 自動缺曠通知家長
- [ ] 匯出 Excel 報表
- [ ] 批次匯入作業
- [ ] 多教師協作模式
- [ ] 權限角色管理
- [ ] 行動裝置 PWA
- [ ] 離線模式支援

### 計劃改進

- [ ] 更多圖表類型（長條圖、折線圖）
- [ ] 歷史資料分析
- [ ] 效能優化（大數據）
- [ ] 資料庫整合（取代試算表）

---

## 📝 已知限制

### 技術限制

1. **Google Apps Script 配額**
   - URL Fetch 呼叫：20,000 次/天
   - 執行時間：6 分鐘/次
   - 觸發條件：90 分鐘/天

2. **試算表限制**
   - 最大列數：500 萬列
   - 儲存格：1000 萬個

3. **tc-api 連線**
   - 需確保網路連線
   - 無法在企業防火牆後使用（除非 tc-api 可公開存取）

### 功能限制

1. **即時性**
   - 圖表更新有 5 分鐘延遲（快取）
   - 非真正的即時（WebSocket）

2. **並行性**
   - 無法多人同時點名同一班級
   - 後寫入會覆蓋先寫入

3. **離線功能**
   - 無離線模式
   - 需要網路連線

---

## 🎉 總結

**班級管理系統 v1.1.0** 成功整合 tc-api 校務系統 API，實現了：

✅ **自動化資料同步** - 一鍵取得最新資料  
✅ **多班級管理** - 支援跨年級、跨班級操作  
✅ **即時視覺化** - 互動式圖表呈現  
✅ **友善操作介面** - 視覺化卡片設計  
✅ **響應式設計** - 手機、平板、電腦皆適用  

這是一個**完全免費、高度客製化、安全可靠**的班級管理解決方案！

---

**專案版本**: v1.1.0  
**文檔版本**: v1.1.0  
**最後更新**: 2025-11-29  
**維護者**: 班級管理系統開發團隊

**立即開始使用！** 🚀 參閱 `02-DEPLOYMENT_GUIDE_v1.1.0.md`

