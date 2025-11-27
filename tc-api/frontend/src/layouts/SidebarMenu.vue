<template>
  <el-aside width="200px" class="sidebar">
    <el-menu
      :default-active="active"
      class="el-menu-vertical-demo"
      @select="onSelect"
    >
      <el-menu-item index="/students">
        <i class="el-icon-user"></i>
        <span>學生名單</span>
      </el-menu-item>

      <el-menu-item index="/teachers">
        <i class="el-icon-notebook-2"></i>
        <span>教師名單</span>
      </el-menu-item>

      <el-menu-item index="/scores">
        <i class="el-icon-document"></i>
        <span>學期成績</span>
      </el-menu-item>

      <!-- 之後可以加更多項目 -->
      <!--
      <el-menu-item index="/teachers">
        <i class="el-icon-s-custom"></i>
        <span>導師名單</span>
      </el-menu-item>
      -->
    </el-menu>
  </el-aside>
</template>

<script setup>
import { useRoute, useRouter } from "vue-router";

const router = useRouter();
const route = useRoute();

const active = route.path;

function onSelect(path) {
  router.push(path);
}
</script>

<style scoped>
.sidebar {
  background: #ffffff;
  border-right: 1px solid #dcdfe6;
  height: 100vh;
}
</style>
