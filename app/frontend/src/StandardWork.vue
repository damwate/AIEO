<template>
  <section>
    <h2>任务管理</h2>
    <button @click="load" :disabled="busy">刷新</button>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>

    <details>
      <summary>批准方案入池</summary>
      <form @submit.prevent="approvePlan">
        <label for="plan-json">批准版本与任务清单（JSON）</label>
        <textarea id="plan-json" v-model="plan" rows="8" required></textarea>
        <button :disabled="busy">批准并入池</button>
      </form>
    </details>

    <details>
      <summary>新增单项任务</summary>
      <form @submit.prevent="addTask">
        <label>项目 <select v-model="single.project_id" required>
          <option value="">选择项目</option>
          <option v-for="project in projects" :key="project.project_id" :value="project.project_id">
            {{ project.name }}
          </option>
        </select></label>
        <label>标题 <input v-model.trim="single.title" required maxlength="300" /></label>
        <label>验收条件 <input v-model.trim="single.criteria" required /></label>
        <label>工程规范版本 <input v-model.trim="single.engineering_standard_version" required /></label>
        <label>知识库 SHA <input v-model.trim="single.knowledge_base_commit" required pattern="[a-f0-9]{40}" /></label>
        <label>代码基线 SHA <input v-model.trim="single.base_commit" required pattern="[a-f0-9]{40}" /></label>
        <button :disabled="busy">新增并排队</button>
      </form>
    </details>

    <h3>执行名额 {{ work.occupied }}/{{ work.limit }}</h3>
    <table>
      <thead><tr><th>任务</th><th>阶段</th><th>当前状态</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-for="task in work.tasks" :key="task.task_id">
          <td>{{ task.task_id }} {{ task.title }}</td>
          <td>{{ task.phase === "WAITING" && task.dependency_commits === null ? "等待前置" : task.phase }}</td>
          <td>{{ task.status }}</td>
          <td><button v-if="task.phase === 'WAITING' && task.dependency_commits !== null"
                      :disabled="busy" @click="previewUrgent(task)">加急</button></td>
        </tr>
      </tbody>
    </table>
    <div v-if="urgent">
      <p>{{ urgent.victim ? `加急 ${urgent.task_id}，将请 ${urgent.victim} 交接让位。` : `加急 ${urgent.task_id} 可进入队首。` }}</p>
      <button :disabled="busy" @click="confirmUrgent">确认加急</button>
      <button :disabled="busy" @click="urgent = null">取消</button>
    </div>

    <h3>ChatGPT 审查队列</h3>
    <p v-if="!work.reviews.length">暂无待处理审查。</p>
    <ol><li v-for="job in work.reviews" :key="job.seq">{{ job.task_id }} / {{ job.round_id }} · {{ job.state }}</li></ol>
    <h3>方案批次</h3>
    <ul><li v-for="batch in work.batches" :key="batch.batch_id">
      {{ batch.plan_id }} / {{ batch.version }} · 已验收 {{ batch.accepted }}/{{ batch.total }}
    </li></ul>
  </section>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { api } from "./api.js";

defineProps({ projects: { type: Array, required: true } });
const work = ref({ occupied: 0, limit: 0, tasks: [], reviews: [], batches: [] });
const single = ref({});
const singleRequestId = ref(crypto.randomUUID());
const plan = ref("");
const urgent = ref(null);
const error = ref("");
const notice = ref("");
const busy = ref(false);

async function perform(operation) {
  busy.value = true;
  error.value = "";
  try {
    await operation();
  } catch (failure) {
    error.value = failure.message;
  } finally {
    busy.value = false;
  }
}

const load = () => perform(async () => { work.value = await api.standardWork(); });
const approvePlan = () => perform(async () => {
  const result = await api.approveStandardPlan(JSON.parse(plan.value));
  notice.value = `已入池 ${result.batch_id}`;
  work.value = await api.standardWork();
});
const addTask = () => perform(async () => {
  const { title, criteria, base_commit, project_id, engineering_standard_version, knowledge_base_commit } = single.value;
  const result = await api.approveStandardPlan({
    plan_id: singleRequestId.value, version: "1", requirement: title,
    project_id, engineering_standard_version, knowledge_base_commit,
    steps: [{ key: "task", title, acceptance_criteria: [criteria], base_commit }],
  });
  single.value = {};
  singleRequestId.value = crypto.randomUUID();
  notice.value = `已入池 ${result.task_ids[0]}`;
  work.value = await api.standardWork();
});
const previewUrgent = (task) => perform(async () => {
  urgent.value = await api.previewStandardUrgent(task.task_id);
});
const confirmUrgent = () => perform(async () => {
  await api.promoteStandardTask(urgent.value.task_id, urgent.value.victim);
  urgent.value = null;
  work.value = await api.standardWork();
});
onMounted(load);
</script>

<style scoped>
form, details { margin: 12px 0; }
form { display: grid; gap: 8px; max-width: 640px; }
textarea { width: 100%; }
</style>
