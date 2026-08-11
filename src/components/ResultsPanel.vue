<template>
  <div class="summary-grid">
    <div class="stat-card"><div class="num c1">{{ a?.summary?.longTextCount ?? 0 }}</div><div class="lbl">长文帖</div></div>
    <div class="stat-card"><div class="num c2">{{ a?.summary?.paywallCount ?? 0 }}</div><div class="lbl">付费帖</div></div>
    <div class="stat-card"><div class="num c3">{{ a?.summary?.gofileCount ?? 0 }}</div><div class="lbl">含gofile链接</div></div>
    <div class="stat-card"><div class="num c4">{{ a?.summary?.cachedTotal ?? 0 }}</div><div class="lbl">缓存tid</div></div>
  </div>

  <div class="filter-bar">
    <el-radio-group v-model="filter">
      <el-radio-button v-for="f in filters" :key="f.value" :value="f.value">{{ f.label }}</el-radio-button>
    </el-radio-group>
  </div>

  <el-table
    :data="results"
    :default-sort="{ prop: 'tid', order: 'ascending' }"
    height="calc(100vh - 320px)"
    empty-text="暂无数据，运行扫描或加载已有结果"
    class="results-table"
  >
    <el-table-column type="expand">
      <template #default="{ row }">
        <div class="expand-detail">
          <el-descriptions :column="2" border size="small" class="expand-desc">
            <el-descriptions-item v-if="row.paywallStatus" label="付费状态">{{ row.paywallStatus }}</el-descriptions-item>
            <el-descriptions-item v-if="row.price !== undefined && row.price !== -1" label="售价">{{ row.price }} SP</el-descriptions-item>
            <el-descriptions-item v-if="row.charCount" label="字数">{{ row.charCount }}</el-descriptions-item>
            <el-descriptions-item label="页码">{{ row.page }}</el-descriptions-item>
          </el-descriptions>
          <template v-if="row.gofileLinks && row.gofileLinks.length">
            <div class="expand-links-title">Gofile 链接：</div>
            <div class="gofile-link" v-for="(l, i) in row.gofileLinks" :key="i">
              <el-link type="primary" :href="l" target="_blank">{{ l }}</el-link>
            </div>
          </template>
        </div>
      </template>
    </el-table-column>

    <el-table-column prop="tid" label="TID" width="110" sortable :sort-method="(a, b) => Number(a.tid) - Number(b.tid)">
      <template #default="{ row }">
        <el-link type="primary" :href="row.url || '#'" target="_blank">{{ row.tid }}</el-link>
      </template>
    </el-table-column>

    <el-table-column prop="title" label="标题" min-width="240" show-overflow-tooltip sortable />

    <el-table-column prop="charCount" label="字数" width="90" sortable :sort-method="(a, b) => (a.charCount || 0) - (b.charCount || 0)">
      <template #default="{ row }">{{ row.charCount || 0 }}</template>
    </el-table-column>

    <el-table-column label="标签" width="150">
      <template #default="{ row }">
        <el-tag v-if="hasTag(row, 'longText')" size="small" type="primary" effect="light">长文</el-tag>
        <el-tag v-if="hasTag(row, 'paywall')" size="small" type="warning" effect="light">付费</el-tag>
        <el-tag v-if="hasTag(row, 'gofile')" size="small" type="success" effect="light">gofile</el-tag>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { ref, computed } from 'vue'
import { store } from '../store'

const filters = [
  { value: 'all', label: '全部' },
  { value: 'longText', label: '长文帖' },
  { value: 'paywall', label: '付费帖' },
  { value: 'gofile', label: '含gofile' }
]

const filter = ref('all')
const a = computed(() => store.analysis)

const merged = computed(() => {
  if (!a.value) return []
  const seen = new Set()
  const all = []
  function add(list, tag) {
    for (const item of list) {
      const key = item.tid
      if (!seen.has(key)) {
        seen.add(key)
        all.push({ ...item, _tag: tag })
      } else {
        const existing = all.find(x => x.tid === key)
        if (existing && existing._tag !== tag) existing._tag += '|' + tag
      }
    }
  }
  add(a.value.longTextPosts || [], 'longText')
  add(a.value.paywallPosts || [], 'paywall')
  add(a.value.gofilePosts || [], 'gofile')
  return all
})

const results = computed(() => {
  let r = merged.value
  if (filter.value !== 'all') r = r.filter(x => x._tag && x._tag.includes(filter.value))
  return r
})

function hasTag(row, tag) {
  return row._tag && row._tag.includes(tag)
}
</script>
