<template>
  <el-card shadow="never" class="control-card">
    <template #header>
      <div class="schedule-header">
        <span class="card-title">自动扫描</span>
        <el-switch v-model="enabled" active-text="启用" />
      </div>
    </template>
    <el-form label-position="top">
      <el-form-item label="扫描间隔（小时）">
        <el-input-number v-model="intervalHours" :min="0.5" :max="720" :step="0.5" controls-position="right" style="width: 100%" />
      </el-form-item>
      <el-form-item label="扫描页数">
        <el-input-number v-model="maxPage" :min="1" :max="50" controls-position="right" style="width: 100%" />
      </el-form-item>
      <el-form-item label="长文帖字数阈值">
        <el-input-number v-model="textThreshold" :min="50" :max="5000" :step="50" controls-position="right" style="width: 100%" />
      </el-form-item>
      <div class="btn-row">
        <el-button type="primary" :icon="Timer" style="flex: 1" :loading="saving" @click="onSave">保存设置</el-button>
      </div>
    </el-form>
  </el-card>

  <el-card shadow="never" class="control-card">
    <template #header><span class="card-title">任务状态</span></template>
    <el-descriptions :column="1" size="small" border>
      <el-descriptions-item label="状态">
        <el-tag :type="enabled ? 'success' : 'info'" size="small" effect="light">{{ enabled ? '已启用' : '已停用' }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="下次执行">{{ nextRunText }}</el-descriptions-item>
      <el-descriptions-item label="上次执行">{{ lastRunText }}</el-descriptions-item>
      <el-descriptions-item label="累计执行">{{ runCount }} 次</el-descriptions-item>
    </el-descriptions>
    <p class="schedule-hint">保存后按设定间隔自动扫描；如需立即扫描，请到「扫描控制」页点击「开始扫描」。</p>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Timer } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getSchedule, setSchedule } from '../api'

const enabled = ref(false)
const intervalHours = ref(3)
const maxPage = ref(2)
const textThreshold = ref(300)
const nextRunAt = ref(null)
const lastRunAt = ref(null)
const runCount = ref(0)
const saving = ref(false)

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const nextRunText = computed(() => (enabled.value ? fmtTime(nextRunAt.value) : '—'))
const lastRunText = computed(() => fmtTime(lastRunAt.value))

async function load() {
  const s = await getSchedule()
  enabled.value = !!s.enabled
  intervalHours.value = Math.round(((s.intervalMinutes || 180) / 60) * 10) / 10
  maxPage.value = s.maxPage || 2
  textThreshold.value = s.textThreshold || 300
  nextRunAt.value = s.nextRunAt
  lastRunAt.value = s.lastRunAt
  runCount.value = s.runCount || 0
}

async function onSave() {
  saving.value = true
  const res = await setSchedule({
    enabled: enabled.value,
    intervalMinutes: Math.round(intervalHours.value * 60),
    maxPage: maxPage.value,
    textThreshold: textThreshold.value
  })
  saving.value = false
  nextRunAt.value = res.nextRunAt
  lastRunAt.value = res.lastRunAt
  runCount.value = res.runCount || 0
  ElMessage.success(enabled.value ? '定时任务已启用' : '定时任务已停用')
}

onMounted(load)
</script>
