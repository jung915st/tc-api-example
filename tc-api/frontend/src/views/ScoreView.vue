<template>
  <el-card class="card">
    <div class="title-row">
      <h2 class="title">學期成績查詢</h2>
    </div>

    <!-- Filter Row -->
    <div class="filter-row">
      <!-- School Year -->
      <el-select
        v-model="selectedSchoolYear"
        placeholder="選擇學年度"
        @change="onFilterChange"
      >
        <el-option
          v-for="year in schoolYears"
          :key="year"
          :label="`${year} 學年度`"
          :value="year"
        />
      </el-select>

      <!-- Semester -->
      <el-select
        v-model="selectedSemester"
        placeholder="選擇學期"
        @change="onFilterChange"
      >
        <el-option label="第 1 學期" :value="1" />
        <el-option label="第 2 學期" :value="2" />
      </el-select>

      <!-- Grade -->
      <el-select
        v-model="selectedGrade"
        placeholder="選擇年級"
        @change="onGradeChange"
      >
        <el-option
          v-for="g in grades"
          :key="g"
          :label="`${g} 年級`"
          :value="g"
        />
      </el-select>

      <!-- Class -->
      <el-select
        v-model="selectedClassNo"
        placeholder="選擇班級"
        :disabled="!classList.length"
        @change="onFilterChange"
      >
        <el-option
          v-for="c in classList"
          :key="c.班序"
          :label="`${c.班名} 班`"
          :value="c.班序"
        />
      </el-select>

      <!-- Search Button -->
      <el-button
        type="primary"
        @click="loadScores"
        :disabled="!canSearch"
        :loading="loading"
      >
        查詢成績
      </el-button>
    </div>

    <!-- Scores Table -->
    <el-table
      v-if="scores.length"
      :data="scores"
      stripe
      border
      style="width: 100%"
    >
      <el-table-column prop="seat_no" label="座號" width="80" align="center" />
      <el-table-column prop="student_no" label="學號" width="120" />
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column label="學期成績" align="center">
        <el-table-column
          v-for="subject in subjects"
          :key="subject"
          :prop="subject"
          :label="subject"
          width="100"
          align="center"
        />
      </el-table-column>
      <el-table-column prop="average" label="平均" width="100" align="center" />
      <el-table-column prop="rank" label="排名" width="80" align="center" />
    </el-table>

    <el-empty v-else-if="!loading" description="請選擇條件後查詢成績" />
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import axios from "axios";
import { getCurrentSemester, getSemesterScores } from "../api/scores";

const apiBase = "http://localhost:3001/api";

// Data
const selectedSchoolYear = ref(null);
const selectedSemester = ref(null);
const selectedGrade = ref(null);
const selectedClassNo = ref(null);

const schoolYears = ref([]);
const grades = ref([]);
const classMap = ref({});
const classList = ref([]);
const scores = ref([]);
const subjects = ref([]);
const loading = ref(false);

// Computed
const canSearch = computed(() => {
  return (
    selectedSchoolYear.value &&
    selectedSemester.value &&
    selectedGrade.value &&
    selectedClassNo.value
  );
});

// Methods
function initializeSchoolYears() {
  const current = new Date().getFullYear() - 1911;
  schoolYears.value = [current - 1, current, current + 1];
}

async function loadCurrentSemester() {
  try {
    const current = await getCurrentSemester();
    selectedSchoolYear.value = current.year;
    selectedSemester.value = current.semester;
  } catch (error) {
    console.error("Failed to load current semester:", error);
  }
}

async function loadClasses() {
  try {
    const resp = await axios.get(`${apiBase}/classes`);
    grades.value = resp.data.grades;
    classMap.value = resp.data.classes;
  } catch (error) {
    ElMessage.error("載入班級資料失敗");
  }
}

function onGradeChange() {
  selectedClassNo.value = null;
  scores.value = [];
  classList.value = selectedGrade.value ? classMap.value[selectedGrade.value] : [];
}

function onFilterChange() {
  scores.value = [];
}

async function loadScores() {
  if (!canSearch.value) return;

  console.log('[ScoreView] Starting loadScores');
  console.log('[ScoreView] Selected values:', {
    year: selectedSchoolYear.value,
    semester: selectedSemester.value,
    grade: selectedGrade.value,
    class_no: selectedClassNo.value
  });

  loading.value = true;
  scores.value = [];
  subjects.value = [];

  try {
    const requestData = {
      year: selectedSchoolYear.value,
      semester: selectedSemester.value,
      grade: selectedGrade.value,
      class_no: selectedClassNo.value
    };
    
    console.log('[ScoreView] API request data:', requestData);
    
    const data = await getSemesterScores(requestData);
    
    console.log('[ScoreView] API response received:', {
      hasStudents: !!data?.students,
      studentCount: data?.students?.length || 0
    });

    // Process the response data
    if (data && data.students && data.students.length > 0) {
      console.log('[ScoreView] Processing student data...');
      console.log('[ScoreView] First student sample:', data.students[0]);
      
      // Extract subjects from the first student's scores
      const firstStudent = data.students[0];
      if (firstStudent.scores && firstStudent.scores.length > 0) {
        subjects.value = firstStudent.scores.map(s => s.subject);
        console.log('[ScoreView] Extracted subjects:', subjects.value);
      }

      // Transform data for table display
      console.log('[ScoreView] Transforming data for table display...');
      scores.value = data.students.map(student => {
        const scoreObj = {
          seat_no: student.seat_no,
          student_no: student.student_no,
          name: student.name
        };

        // Add each subject score
        if (student.scores) {
          student.scores.forEach(score => {
            scoreObj[score.subject] = score.score;
          });
        }

        // Calculate average
        const validScores = student.scores
          .map(s => s.score)
          .filter(s => typeof s === 'number' && !isNaN(s));
        
        scoreObj.average = validScores.length > 0
          ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2)
          : '-';

        return scoreObj;
      });

      // Calculate ranking based on average
      console.log('[ScoreView] Calculating rankings...');
      const sortedScores = [...scores.value]
        .filter(s => s.average !== '-')
        .sort((a, b) => parseFloat(b.average) - parseFloat(a.average));

      scores.value.forEach(score => {
        if (score.average !== '-') {
          const index = sortedScores.findIndex(
            s => s.student_no === score.student_no
          );
          score.rank = index + 1;
        } else {
          score.rank = '-';
        }
      });

      console.log('[ScoreView] Data processing complete. Total students:', scores.value.length);
      console.log('[ScoreView] Sample row:', scores.value[0]);
      ElMessage.success(`查詢成功，共 ${scores.value.length} 筆資料`);
    } else {
      console.log('[ScoreView] No student data in response');
      ElMessage.warning("查無成績資料");
    }
  } catch (error) {
    console.error('[ScoreView] Error loading scores:', error);
    console.error('[ScoreView] Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    ElMessage.error("查詢成績失敗：" + (error.response?.data?.message || error.message));
  } finally {
    console.log('[ScoreView] loadScores completed. Loading:', false);
    loading.value = false;
  }
}

// Lifecycle
onMounted(async () => {
  initializeSchoolYears();
  await loadCurrentSemester();
  await loadClasses();
});
</script>

<style scoped>
.card {
  padding: 20px;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.title {
  font-size: 26px;
  color: #303133;
  margin: 0;
}

.filter-row {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.el-select {
  min-width: 150px;
}
</style>
