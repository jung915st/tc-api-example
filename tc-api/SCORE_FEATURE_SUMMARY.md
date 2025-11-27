# 學期成績查詢功能實作說明

## 功能概述

新增學期成績查詢頁面，可根據學年度、學期、年級、班級查詢學生成績。

## 實作內容

### 1. Backend 後端實作

#### 新增檔案

- **`backend/routes/scores.js`** - 成績路由
  - `GET /api/scores/current-semester` - 取得當前學期資訊
  - `POST /api/scores/semester` - 查詢學期成績

- **`backend/services/scoreSemester.js`** - 成績服務
  - `getSemesterScores()` - 呼叫 API 取得成績
  - `getCurrentSemester()` - 計算當前學年度和學期

#### 修改檔案

- **`backend/app.js`** - 註冊成績路由
  ```javascript
  app.use("/api/scores", scoreRoutes);
  ```

### 2. Frontend 前端實作

#### 新增檔案

- **`frontend/src/api/scores.js`** - 成績 API 介面
  - `getCurrentSemester()` - 取得當前學期
  - `getSemesterScores()` - 查詢學期成績

- **`frontend/src/views/ScoreView.vue`** - 成績查詢頁面
  - 學年度、學期、年級、班級選單
  - 成績表格顯示（含科目、平均、排名）
  - 自動計算平均分數和班級排名

#### 修改檔案

- **`frontend/src/router/index.ts`** - 新增路由
  ```typescript
  { path: "/scores", component: () => import("../views/ScoreView.vue") }
  ```

- **`frontend/src/layouts/SidebarMenu.vue`** - 新增選單項目
  ```vue
  <el-menu-item index="/scores">
    <i class="el-icon-document"></i>
    <span>學期成績</span>
  </el-menu-item>
  ```

## 功能特點

### 學期自動判斷邏輯
- 民國年 = 西元年 - 1911
- 8月-1月：第1學期
- 2月-7月：第2學期
- 預設選擇當前學期

### 成績顯示功能
- 座號、學號、姓名
- 各科目成績（動態欄位）
- 自動計算平均分數
- 自動計算班級排名

### 使用者體驗
- 年級變更時自動清除班級選擇
- 查詢按鈕在條件不完整時禁用
- 載入中顯示 loading 狀態
- 成功/失敗訊息提示

## API 規格

根據 SwaggerHub API 文件：

**Endpoint:** `POST /score-semester`

**Request Body:**
```json
{
  "school_year": 114,
  "semester": 1,
  "grade": 7,
  "class_no": 1
}
```

**Response:**
```json
{
  "students": [
    {
      "seat_no": 1,
      "student_no": "1140101",
      "name": "王小明",
      "scores": [
        {"subject": "國文", "score": 85},
        {"subject": "英文", "score": 90},
        {"subject": "數學", "score": 88}
      ]
    }
  ]
}
```

## 使用方式

1. 啟動後端服務：
   ```bash
   node backend/app.js
   ```

2. 啟動前端開發伺服器：
   ```bash
   cd frontend
   npm run dev
   ```

3. 瀏覽器開啟應用，點選側邊欄「學期成績」
4. 依序選擇學年度、學期、年級、班級
5. 點擊「查詢成績」按鈕

## 注意事項

- 需要先設定 `.env` 檔案中的 API 連線資訊
- 確保 OAuth token 有效
- API 需要有正確的授權才能查詢成績資料
