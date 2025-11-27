<template>
  <el-card>
    <h2 class="title">教師名單</h2>

    <el-table :data="teachers" border stripe>

    <el-table-column label="資訊" width="260">
  <template #default="scope">
    <el-tag type="warning" style="margin-right:5px;">{{ scope.row.title }}</el-tag>

    <!-- ★ 導師特別註記 -->
    <el-tag v-if="scope.row.isHomeroom" type="success">導師</el-tag>
  </template>
</el-table-column>

      <el-table-column prop="name" label="姓名" width="120" />

      <el-table-column label="任教班級與科目" min-width="400">
        <template #default="scope">

          <div v-for="cls in scope.row.classes" :key="cls.grade + '-' + cls.class_seq" class="class-block">

            <div class="class-title">
              {{ cls.grade }}年{{ cls.class_seq }}班：
            </div>

            <div class="subject-tags">
              <el-tag
                v-for="sub in cls.subjects"
                :key="sub.科目"
                type="success"
                style="margin-right:6px;"
              >
                {{ sub.科目 }}（{{ sub.時數 }}）
              </el-tag>
            </div>

          </div>
        </template>
      </el-table-column>

    </el-table>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from "vue";
import axios from "axios";

const teachers = ref([]);

async function loadTeachers() {
  const resp = await axios.get("http://localhost:3001/api/teachers");
  teachers.value = resp.data;
}

onMounted(loadTeachers);
</script>

<style scoped>
.title {
  font-size: 24px;
  margin-bottom: 15px;
}
.class-block {
  margin-bottom: 10px;
}
.class-title {
  font-weight: bold;
  margin-bottom: 4px;
}
.subject-tags {
  display: flex;
  flex-wrap: wrap;
}
</style>
