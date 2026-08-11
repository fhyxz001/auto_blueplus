<template>
  <el-card shadow="never" class="control-card">
    <template #header><span class="card-title">扫描参数</span></template>
    <el-form label-position="top">
      <el-form-item label="扫描页数">
        <el-input-number v-model="maxPage" :min="1" :max="50" controls-position="right" style="width: 100%" />
      </el-form-item>
      <el-form-item label="长文帖字数阈值">
        <el-input-number v-model="textThreshold" :min="50" :max="5000" :step="50" controls-position="right" style="width: 100%" />
      </el-form-item>
      <div class="btn-row">
        <el-button type="primary" :icon="VideoPlay" :loading="starting" :disabled="store.running" style="flex: 1" @click="onStart">开始扫描</el-button>
        <el-button type="danger" :icon="VideoPause" :disabled="!store.running" style="flex: 1" @click="onStop">停止</el-button>
      </div>
    </el-form>
  </el-card>

  <el-card shadow="never" class="control-card">
    <template #header><span class="card-title">扫描日志</span></template>
    <div class="log-area" ref="logArea">
      <div v-if="store.log.length === 0" class="log-empty">等待扫描开始...</div>
      <div v-for="(l, i) in store.log" :key="i" :class="['log-line', logClass(l.text)]">{{ l.text }}</div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { VideoPlay, VideoPause } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { store, startScan, stopScan } from '../store'

const maxPage = ref(2)
const textThreshold = ref(300)
const starting = ref(false)
const logArea = ref(null)

watch(() => store.log, async () => {
  await nextTick()
  if (logArea.value) logArea.value.scrollTop = logArea.value.scrollHeight
})

function logClass(text) {
  if (text.startsWith('[ERR]') || text.includes('❌')) return 'error'
  if (text.includes('⚠️') || text.includes('⏭️')) return 'warn'
  return ''
}

async function onStart() {
  starting.value = true
  const res = await startScan(maxPage.value, textThreshold.value)
  starting.value = false
  if (res.error) ElMessage.error(res.error)
  else ElMessage.success('扫描已启动')
}

async function onStop() {
  await stopScan()
  ElMessage.info('已请求停止扫描')
}
</script>
