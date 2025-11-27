<template>
  <div class="common-layout">
  <el-container >

    <!-- Sidebar -->
    <SidebarMenu />

    <el-container direction="vertical">

      <!-- Header -->
      <el-header class="header">
        校務系統管理平台
      </el-header>

      <!-- Main Content -->
      <el-main class="main-container">
        <div class="content-wrapper">
          <router-view />
        </div>
      </el-main>

    </el-container>

  </el-container>
  </div>
</template>

<script setup>
import SidebarMenu from "./layouts/SidebarMenu.vue";
</script>

<style>

.header {
  background: #409EFF;
  color: #fff;
  font-size: 20px;
  display: flex;
  align-items: center;
  padding-left: 20px;
  height: 60px;
}

.main-container {
  background-color: #f0f2f5;
  padding: 30px;
}

/* 主要內容區寬度與置中 */
.content-wrapper {
  max-width: 1100px;
  min-width: 800px;
  margin: 0 auto;
}
</style>
