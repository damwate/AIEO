<template>
  <div class="shell">
    <header class="topbar">
      <h1>AIEO 平台基座</h1>
      <nav>
        <button
          v-for="tab in tabs"
          :key="tab"
          :class="{ active: currentTab === tab }"
          @click="currentTab = tab"
        >
          {{ tab }}
        </button>
      </nav>
      <div class="session">
        <span v-if="username">{{ username }}</span>
        <button v-if="username" @click="logout">退出</button>
        <form v-else class="login" @submit.prevent="login">
          <input v-model="loginForm.username" placeholder="用户名" />
          <input v-model="loginForm.password" type="password" placeholder="密码" />
          <button type="submit">登录</button>
        </form>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </header>

    <main v-if="username">
      <section v-if="currentTab === '项目'">
        <h2>项目列表</h2>
        <table>
          <thead>
            <tr><th>项目 ID</th><th>名称</th><th>状态</th><th>创建时间</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in projects" :key="p.project_id">
              <td>{{ p.project_id }}</td>
              <td>{{ p.name }}</td>
              <td>{{ p.status }}</td>
              <td>{{ p.created_at }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-else-if="currentTab === '任务'">
        <h2>任务列表</h2>
        <table>
          <thead>
            <tr>
              <th>任务 ID</th><th>标题</th><th>批次</th><th>状态</th>
              <th>权重</th><th>父任务</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tasks" :key="t.task_id">
              <td>{{ t.task_id }}</td>
              <td>{{ t.title }}</td>
              <td>{{ t.batch_id }}</td>
              <td><span class="badge" :data-status="t.status">{{ t.status }}</span></td>
              <td>{{ t.weight }}</td>
              <td>{{ t.parent_id || "-" }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-else>
        <h2>进度看板（完成率只统计 ACCEPTED 任务权重，04-规范 §4）</h2>
        <div v-for="item in board" :key="item.project_id" class="board-card">
          <h3>{{ item.project_name }}（{{ item.project_id }}）</h3>
          <div class="bar-outer">
            <div class="bar-inner" :style="{ width: (item.completion_percent || 0) + '%' }"></div>
          </div>
          <p>
            完成率 {{ item.completion_percent === null ? "无有效任务" : item.completion_percent + "%" }}
            ｜ 任务 {{ item.total_tasks }}（有效 {{ item.valid_tasks }}，已取消 {{ item.cancelled_tasks }}）
            ｜ ACCEPTED 权重 {{ item.accepted_weight }} / 有效权重 {{ item.valid_weight }}
          </p>
          <p v-if="item.blocked_tasks.length" class="blocked">
            阻塞任务：{{ item.blocked_tasks.join("、") }}
          </p>
          <ul>
            <li v-for="b in item.batches" :key="b.batch_id">
              {{ b.batch_id }}：{{ b.accepted_tasks }}/{{ b.total_tasks }} ACCEPTED，
              完成率 {{ b.completion_percent === null ? "-" : b.completion_percent + "%" }}
            </li>
          </ul>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { api, setCsrfToken } from "./api.js";

const tabs = ["项目", "任务", "看板"];
const currentTab = ref("看板");
const username = ref("");
const error = ref("");
const loginForm = ref({ username: "OWNER", password: "" });
const projects = ref([]);
const tasks = ref([]);
const board = ref([]);

async function refresh() {
  error.value = "";
  try {
    projects.value = (await api.projects()).items;
    tasks.value = (await api.tasks()).items;
    board.value = (await api.board()).items;
  } catch (e) {
    error.value = String(e.message || e);
  }
}

async function login() {
  error.value = "";
  try {
    const data = await api.login(loginForm.value.username, loginForm.value.password);
    setCsrfToken(data.csrf_token);
    username.value = data.username;
    await refresh();
  } catch (e) {
    error.value = String(e.message || e);
  }
}

async function logout() {
  try {
    await api.logout();
  } finally {
    username.value = "";
  }
}

onMounted(async () => {
  try {
    username.value = (await api.session()).username;
    await refresh();
  } catch {
    /* not logged in yet */
  }
});
</script>

<style>
body { margin: 0; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; background: #f5f6f8; }
.shell { max-width: 1080px; margin: 0 auto; padding: 16px; }
.topbar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.topbar h1 { font-size: 20px; margin: 0; }
nav { display: flex; gap: 8px; }
nav button, .login button, .session > button { cursor: pointer; }
button.active { background: #2563eb; color: #fff; border-color: #2563eb; }
.session { margin-left: auto; }
.login { display: inline-flex; gap: 6px; }
table { width: 100%; border-collapse: collapse; background: #fff; }
th, td { border: 1px solid #d8dbe0; padding: 6px 10px; text-align: left; font-size: 14px; }
.badge { padding: 2px 8px; border-radius: 10px; background: #e5e7eb; font-size: 12px; }
.badge[data-status="ACCEPTED"] { background: #d1fae5; color: #065f46; }
.badge[data-status="BLOCKED"] { background: #fee2e2; color: #991b1b; }
.badge[data-status="IN_PROGRESS"] { background: #dbeafe; color: #1e40af; }
.badge[data-status="CANCELLED"] { background: #f3f4f6; color: #6b7280; }
.board-card { background: #fff; border: 1px solid #d8dbe0; padding: 12px 16px; margin-bottom: 12px; }
.bar-outer { height: 10px; background: #e5e7eb; border-radius: 6px; overflow: hidden; }
.bar-inner { height: 100%; background: #16a34a; }
.error { color: #b91c1c; }
.blocked { color: #991b1b; }
</style>
