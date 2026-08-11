<template>
  <el-container class="app">
    <el-header class="app-header" height="60px">
      <div class="header-left">
        <el-icon :size="22" color="#409eff"><Monitor /></el-icon>
        <h1>南+ 扫描控制台</h1>
      </div>
      <div class="header-right">
        <el-tag v-if="store.running" type="warning" effect="dark" round>
          <el-icon class="el-icon--left"><Loading /></el-icon>
          扫描中 · {{ elapsedText }}
        </el-tag>
        <el-tag v-else type="success" effect="dark" round>空闲</el-tag>
      </div>
    </el-header>

    <el-container class="app-body">
      <el-aside width="380px" class="app-aside">
        <el-tabs v-model="tab" stretch>
          <el-tab-pane label="扫描控制" name="control">
            <ScanControl />
          </el-tab-pane>
          <el-tab-pane label="定时任务" name="schedule">
            <SchedulePanel />
          </el-tab-pane>
          <el-tab-pane label="缓存管理" name="cache">
            <CachePanel />
          </el-tab-pane>
        </el-tabs>
      </el-aside>

      <el-main class="app-main">
        <ResultsPanel />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Monitor, Loading } from '@element-plus/icons-vue'
import { store, init } from './store'
import ScanControl from './components/ScanControl.vue'
import ResultsPanel from './components/ResultsPanel.vue'
import CachePanel from './components/CachePanel.vue'
import SchedulePanel from './components/SchedulePanel.vue'

const tab = ref('control')

const elapsedText = computed(() => {
  const m = Math.floor(store.elapsed / 60)
  const s = store.elapsed % 60
  return m + 'm ' + s + 's'
})

onMounted(init)
</script>
