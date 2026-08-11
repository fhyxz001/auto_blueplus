<template>
  <el-card shadow="never" class="control-card">
    <template #header><span class="card-title">缓存统计</span></template>
    <div class="cache-stats">
      <el-statistic title="缓存 TID 数量" :value="store.scannedCache?.count ?? 0" />
      <p class="cache-desc">已扫描且不符合标准的帖子 tid</p>
    </div>
    <el-popconfirm title="确定清除全部缓存？此操作不可撤销。" width="240" @confirm="onClear">
      <template #reference>
        <el-button type="danger" :icon="Delete" plain>清除全部缓存</el-button>
      </template>
    </el-popconfirm>
  </el-card>

  <el-card shadow="never" class="control-card">
    <template #header><span class="card-title">缓存 TID 列表</span></template>
    <div class="cache-list">
      <div v-if="tids.length === 0" class="log-empty">缓存为空</div>
      <div v-for="tid in visibleTids" :key="tid" class="cache-item">
        <span class="cache-tid">{{ tid }}</span>
        <el-button type="danger" link size="small" @click="onDelete(tid)">删除</el-button>
      </div>
      <div v-if="tids.length > 200" class="cache-more">...还有 {{ tids.length - 200 }} 条未显示</div>
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { store, clearAllCache, removeCacheTid } from '../store'

const tids = computed(() => store.scannedCache?.tids || [])
const visibleTids = computed(() => tids.value.slice(0, 200))

async function onClear() {
  await clearAllCache()
  ElMessage.success('缓存已清除')
}

async function onDelete(tid) {
  await removeCacheTid(tid)
  ElMessage.success(`已删除 tid ${tid}`)
}
</script>
