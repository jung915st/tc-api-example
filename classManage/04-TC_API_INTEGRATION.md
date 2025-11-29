# tc-api 整合說明文件

## 📋 概述

本文檔說明如何將 `tc-api` 模組整合到 `classManage` 班級管理系統中，實現從校務系統 API 載入教師和學生資料，並增強點名和儀表板功能。

---

## 🆕 新增功能

### 1. 從 tc-api 載入教師和學生資料

- **功能**：透過 `GET /semester-data` 端點從 tc-api 同步學期資料
- **位置**：`Config_v1.0.0.gs` → `CONFIG.TC_API` 設定區塊
- **函數**：`syncSemesterDataFromTcApi()` 在 `WebApp_v1.0.0.gs`

### 2. 班級選擇功能（點名頁面）

- **功能**：教師可以選擇年級和班級，查看對應的學生列表進行點名
- **位置**：`Attendance_v1.0.0.html`
- **API 端點**：
  - `GET /classes` - 取得所有班級列表
  - `GET /students?grade=X&class_seq=Y` - 取得指定班級的學生列表

### 3. 即時出席統計圖表（儀表板）

- **功能**：顯示所有班級的即時出席狀況，包含圖表和統計表格
- **位置**：`Dashboard_v1.0.0.html`
- **函數**：`getAllClassesAttendanceStats()` 在 `WebApp_v1.0.0.gs`
- **圖表庫**：Google Charts

---

## ⚙️ 設定步驟

### 步驟 1：設定 tc-api 後端 URL

在 `Config_v1.0.0.gs` 中修改：

```javascript
TC_API: {
  BASE_URL: 'http://localhost:3001/api', // 開發環境
  // BASE_URL: 'https://your-domain.com/api', // 生產環境
  ENDPOINTS: {
    SEMESTER_DATA: '/sync-school',
    STUDENTS: '/students',
    TEACHERS: '/teachers',
    CLASSES: '/classes'
  },
  TIMEOUT: 30000,
  ENABLED: true  // 設為 false 可停用整合
}
```

### 步驟 2：確保 tc-api 後端運行

1. 啟動 tc-api 後端服務：
   ```bash
   cd tc-api
   node backend/app.js
   ```

2. 確認後端運行在 `http://localhost:3001`

3. 確保後端已同步學期資料（執行一次 `/api/sync-school`）

### 步驟 3：部署 Google Apps Script

1. 在 Apps Script 編輯器中更新所有檔案
2. 部署 Web App（或更新現有部署）
3. 測試功能是否正常

---

## 📝 API 函數說明

### WebApp_v1.0.0.gs 新增函數

#### `syncSemesterDataFromTcApi()`
- **用途**：從 tc-api 同步學期資料
- **回傳**：`{ success: boolean, message: string, data: object }`
- **使用**：前端可透過 `google.script.run.syncSemesterDataFromTcApi()` 呼叫

#### `getTeachersFromTcApi()`
- **用途**：取得教師列表
- **回傳**：教師陣列或 `{ error: string }`
- **快取**：30 分鐘

#### `getClassesFromTcApi()`
- **用途**：取得所有年級和班級列表
- **回傳**：`{ grades: [], classes: {} }` 或 `{ error: string }`
- **快取**：30 分鐘

#### `getStudentsByClassFromTcApi(grade, classSeq)`
- **用途**：取得指定班級的學生列表
- **參數**：
  - `grade` (number): 年級
  - `classSeq` (number): 班序
- **回傳**：學生陣列或 `{ error: string }`
- **快取**：30 分鐘（依班級）

#### `getAllClassesAttendanceStats()`
- **用途**：取得所有班級的今日出席統計
- **回傳**：統計陣列，每個元素包含：
  ```javascript
  {
    grade: number,
    classSeq: number,
    className: string,
    total: number,
    present: number,
    absent: number,
    sick: number,
    personal: number,
    late: number,
    attendanceRate: string
  }
  ```

#### `getTodayAttendanceData(grade, classSeq)` (已更新)
- **用途**：取得今日點名資料
- **參數**（選填）：
  - `grade` (number): 年級，如果提供則從 tc-api 取得學生
  - `classSeq` (number): 班序
- **回傳**：學生陣列（含出席狀態）

---

## 🎨 前端功能說明

### 點名頁面 (Attendance_v1.0.0.html)

#### 新增 UI 元素：
1. **年級選擇器**：下拉選單選擇年級
2. **班級選擇器**：選擇年級後啟用，顯示該年級的所有班級
3. **同步資料按鈕**：手動觸發資料同步

#### 使用流程：
1. 點選「同步資料」按鈕（首次使用或需要更新資料時）
2. 選擇年級
3. 選擇班級
4. 系統自動載入該班級的學生列表
5. 進行點名操作
6. 儲存點名記錄

### 儀表板頁面 (Dashboard_v1.0.0.html)

#### 新增區塊：
- **各班級今日出席統計**：顯示所有班級的出席狀況

#### 功能特點：
1. **圖表顯示**：使用 Google Charts 顯示堆疊柱狀圖
2. **統計表格**：顯示詳細數字和出席率
3. **依年級分組**：每個年級獨立顯示
4. **即時更新**：可手動重新整理

---

## 🔧 錯誤處理

### 常見問題

#### 1. tc-api 連線失敗
- **症狀**：顯示「API 請求失敗」
- **解決**：
  - 確認 tc-api 後端是否運行
  - 檢查 `BASE_URL` 設定是否正確
  - 確認網路連線

#### 2. 資料同步失敗
- **症狀**：同步按鈕顯示錯誤訊息
- **解決**：
  - 檢查 tc-api 後端日誌
  - 確認 OAuth 設定正確
  - 確認校務系統 API 可正常存取

#### 3. 班級列表為空
- **症狀**：選擇年級後沒有班級選項
- **解決**：
  - 先執行「同步資料」
  - 確認 `school.json` 檔案存在且格式正確

#### 4. 學生列表載入失敗
- **症狀**：選擇班級後沒有學生資料
- **解決**：
  - 確認該班級在 `school.json` 中有學生資料
  - 檢查 API 回應格式是否正確

---

## 📊 資料流程

### 同步流程
```
前端 → google.script.run.syncSemesterDataFromTcApi()
     → UrlFetchApp.fetch(tc-api /sync-school)
     → tc-api 後端 → 校務系統 API
     → 儲存至 school.json
     → 清除快取
     → 回傳成功訊息
```

### 查詢流程
```
前端 → google.script.run.getClassesFromTcApi()
     → UrlFetchApp.fetch(tc-api /classes)
     → 讀取 school.json
     → 回傳班級列表
     → 前端顯示年級/班級選單
     
前端 → google.script.run.getStudentsByClassFromTcApi(grade, classSeq)
     → UrlFetchApp.fetch(tc-api /students?grade=X&class_seq=Y)
     → 讀取 school.json
     → 篩選並回傳學生列表
     → 前端顯示點名表格
```

### 統計流程
```
前端 → google.script.run.getAllClassesAttendanceStats()
     → 取得所有班級列表
     → 對每個班級取得學生列表
     → 查詢今日出席記錄
     → 計算統計數據
     → 回傳統計陣列
     → 前端繪製圖表
```

---

## 🔐 安全性注意事項

1. **API URL 設定**：
   - 開發環境可使用 `localhost`
   - 生產環境應使用 HTTPS
   - 避免在程式碼中硬編碼敏感資訊

2. **錯誤處理**：
   - 所有 API 呼叫都包含錯誤處理
   - 失敗時會回退到本地資料（如果可用）

3. **快取機制**：
   - 使用快取減少 API 請求
   - 快取時間：30 分鐘（可調整）

4. **權限驗證**：
   - 維持原有的權限驗證機制
   - tc-api 整合不影響安全性設定

---

## 🚀 部署檢查清單

- [ ] 設定 `Config_v1.0.0.gs` 中的 `TC_API.BASE_URL`
- [ ] 確認 `TC_API.ENABLED` 為 `true`
- [ ] 測試 tc-api 後端連線
- [ ] 執行一次資料同步
- [ ] 測試班級選擇功能
- [ ] 測試點名功能
- [ ] 測試儀表板圖表顯示
- [ ] 確認錯誤處理正常運作

---

## 📚 相關文件

- [tc-api README.md](../../tc-api/README.md) - tc-api 專案說明
- [classManage 01-PROJECT_OVERVIEW.md](01-PROJECT_OVERVIEW.md) - 專案總覽
- [Swagger API 文件](https://app.swaggerhub.com/apis/st993/api/1.0.0) - API 規格

---

## 📝 版本資訊

- **整合版本**：v1.0.0
- **更新日期**：2025-01-XX
- **相容性**：classManage v1.0.0+

---

## 🎉 總結

透過整合 tc-api，班級管理系統現在可以：

✅ 自動從校務系統載入教師和學生資料  
✅ 支援多班級點名功能  
✅ 即時顯示所有班級的出席統計  
✅ 提供視覺化的圖表分析  

所有功能都與現有系統無縫整合，並維持原有的安全性和穩定性。

