import Cookies from "js-cookie";

/** 取 `Key=Value` 的键与值：按第一个等号切，避免值里带 `=` 被截断 */
function splitCookie(raw) {
  const text = raw.trim()
  const eq = text.indexOf('=')
  if (eq <= 0) return null
  return [text.slice(0, eq), text.slice(eq + 1)]
}

function saveCookie(raw) {
  const pair = splitCookie(raw)
  if (!pair) return
  const [key, value] = pair

  // file:// 下 document.cookie 不可写，失败也无所谓，localStorage 才是主存储
  try {
    document.cookie = `${key}=${value}; path=/`
  } catch (err) {
    // 忽略
  }
  localStorage.setItem('cookie:' + key, value)
}

export function setCookies(data, type) {
  if (!data?.cookie) return

  if (type === 'account') {
    data.cookie.split(';;').forEach((cookie) => saveCookie(cookie.split(';')[0]))
  }

  if (type === 'qr') {
    data.cookie.split(';').forEach((cookie) => {
      const pair = splitCookie(cookie)
      if (!pair) return
      if (['MUSIC_U', 'MUSIC_A_T', 'MUSIC_R_T'].includes(pair[0])) saveCookie(cookie)
    })
  }
}

//获取Cookie
export function getCookie(key) {
  return Cookies.get(key) ?? localStorage.getItem('cookie:' + key)
}

//判断是否登录
export function isLogin() {
  return getCookie('MUSIC_U') != undefined
}
