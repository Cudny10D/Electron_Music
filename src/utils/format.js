/** 秒 -> m:ss */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 12345 -> 1.2万 */
export function formatCount(count) {
  const n = Number(count) || 0
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

/** 字节 -> 1.2 MB / 340 KB */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0
  if (n <= 0) return ''
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

/** 2026-11-20 -> 11.20 */
export function formatDate(date = new Date()) {
  const d = new Date(date)
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function dayOfMonth(date = new Date()) {
  return String(new Date(date).getDate()).padStart(2, '0')
}
