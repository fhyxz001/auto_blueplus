async function request(path, options) {
  const res = await fetch(path, options)
  return res.json()
}

export function getData() {
  return request('/api/data')
}

export function startScan(params) {
  return request('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
}

export function stopScan() {
  return request('/api/stop-scan', { method: 'POST' })
}

export function getScanStatus() {
  return request('/api/scan-status')
}

export function clearCache() {
  return request('/api/clear-cache', { method: 'POST' })
}

export function deleteCacheTid(tid) {
  return request('/api/cache/' + tid, { method: 'DELETE' })
}

export function getSchedule() {
  return request('/api/schedule')
}

export function setSchedule(params) {
  return request('/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
}
