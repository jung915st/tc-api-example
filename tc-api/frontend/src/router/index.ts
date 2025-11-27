import { createRouter, createWebHistory } from "vue-router";
import StudentList from "../views/StudentList.vue";

const routes = [
  { path: "/", component: StudentList },
  {
    path: "/students",
    component: () => import("../views/StudentList.vue")
  },
  {
    path: "/teachers",
    component: () => import("../views/TeacherList.vue")
  },
  {
    path: "/scores",
    component: () => import("../views/ScoreView.vue")
  }
];

export default createRouter({
  history: createWebHistory(),
  routes
});
