<template>
  <div>
    <el-row :gutter="20" style="margin-bottom:20px;">
      <el-col :span="8">
        <el-select v-model="selectedGrade" placeholder="選擇年級" @change="loadClasses" style="width:100%;">
          <el-option
            v-for="g in grades"
            :key="g"
            :label="g + ' 年級'"
            :value="g"
          />
        </el-select>
      </el-col>

      <el-col :span="8">
        <el-select 
          v-model="selectedClass" 
          placeholder="選擇班級" 
          :disabled="!classList.length" 
          @change="loadStudents" 
          style="width:100%;">
          
          <el-option
            v-for="c in classList"
            :key="c.班序"
            :label="c.班名 + ' 班'"
            :value="c.班序"
          />
        </el-select>
      </el-col>
    </el-row>

    <el-table :data="students" stripe border>
      <el-table-column prop="seat_no" label="座號" width="80" />
      <el-table-column prop="name" label="姓名" />
      <el-table-column prop="gender" label="性別" width="80" />
      <el-table-column prop="student_no" label="學號" />
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import axios from "axios";

const grades = ref([]);
const classMap = ref({});
const classList = ref([]);

const selectedGrade = ref(null);
const selectedClass = ref(null);

const students = ref([]);

// 載入所有年級 & 班級資料
async function loadGrades() {
  const resp = await axios.get("http://localhost:3001/api/classes");
  grades.value = resp.data.grades;
  classMap.value = resp.data.classes;
}

// 年級改變，更新班級選單
function loadClasses() {
  selectedClass.value = null;
  students.value = [];

  if (selectedGrade.value) {
    classList.value = classMap.value[selectedGrade.value] || [];
  } else {
    classList.value = [];
  }
}

// 班級改變，載入該班學生
async function loadStudents() {
  if (!selectedGrade.value || !selectedClass.value) return;

  const resp = await axios.get(
    `http://localhost:3001/api/students?grade=${selectedGrade.value}&class_seq=${selectedClass.value}`
  );

  students.value = resp.data;
}

onMounted(() => {
  loadGrades();
});
</script>

<style>
</style>
