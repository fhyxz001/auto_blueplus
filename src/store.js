import { reactive } from 'vue'
import { getData, getScanStatus, startScan as apiStartScan, stopScan as apiStopScan, clearCache as apiClearCache, deleteCacheTid as apiDeleteCacheTid } from './api'

export const store = reactive({
  analysis: null,
  scannedCache: null,
  running: false,
  elapsed: 0,
  log: []
})

let pollTimer = null
let prevRunning = false

async function poll() {
  const data = await getScanStatus()
  store.running = data.running
  store.elapsed = data.elapsed
  if (data.running) {
    store.log = data.log || []
    prevRunning = true
    pollTimer = setTimeout(poll, 500)
  } else {
    if (prevRunning) {
      prevRunning = false
      store.log = data.log || []
      refreshData()
    }
    pollTimer = setTimeout(poll, 2000)
  }
}

export async function refreshData() {
  const data = await getData()
  store.analysis = data.analysis
  store.scannedCache = data.scannedCache
}

export async function startScan(maxPage, textThreshold) {
  const res = await apiStartScan({ maxPage, textThreshold })
  if (res.error) return { error: res.error }
  store.running = true
  store.elapsed = 0
  store.log = []
  prevRunning = true
  poll()
  return { ok: true }
}

export async function stopScan() {
  await apiStopScan()
}

export async function clearAllCache() {
  await apiClearCache()
  await refreshData()
}

export async function removeCacheTid(tid) {
  await apiDeleteCacheTid(tid)
  await refreshData()
}

export function init() {
  refreshData()
  poll()
}
