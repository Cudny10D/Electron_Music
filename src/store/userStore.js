import { defineStore } from 'pinia'

/** 账号切换需要一并带走的登录态字段 */
const COOKIE_KEYS = ['MUSIC_U', 'MUSIC_A_T', 'MUSIC_R_T', 'MUSIC_R_TT', '__csrf', 'NMTID']

function readCookies() {
  const out = {}
  for (const key of COOKIE_KEYS) {
    const value = localStorage.getItem('cookie:' + key)
    if (value) out[key] = value
  }
  return out
}

function writeCookies(cookies = {}) {
  for (const key of COOKIE_KEYS) {
    const value = cookies[key]
    try {
      document.cookie = value
        ? `${key}=${value}; path=/`
        : `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    } catch (err) {
      // file:// 下不可写，localStorage 才是主存储
    }
    if (value) localStorage.setItem('cookie:' + key, value)
    else localStorage.removeItem('cookie:' + key)
  }
}

function toAccount(profile, cookies) {
  return {
    userId: profile.userId,
    nickname: profile.nickname || '未命名账号',
    avatarUrl: profile.avatarUrl || '',
    signature: profile.signature || '',
    vipType: profile.vipType || 0,
    redVipLevel: profile.redVipLevel || 0,
    cookies: { ...cookies }
  }
}

export const useUserStore = defineStore('userStore', {
  state: () => ({
    user: null,
    likelist: [],
    // 已登录过的账号，含各自 cookie，可在设置页直接切换
    accounts: []
  }),
  getters: {
    loggedIn: (state) => !!state.user,
    // vipType 有 0/10/11 多种取值，新接口还会给 redVipLevel；
    // 只用于界面展示，不再参与“能不能播”的判断
    isVip: (state) => Number(state.user?.vipType) > 0 || Number(state.user?.redVipLevel) > 0,
    currentAccount: (state) => state.accounts.find((a) => String(a.userId) === String(state.user?.userId)) || null
  },
  actions: {
    setUser(user) {
      this.user = user
      if (user?.userId) this.upsertAccount(user)
    },
    setLikelist(ids) {
      this.likelist = ids || []
    },
    /** 登录成功后把当前 cookie 记到该账号名下；重复登录则更新资料 */
    upsertAccount(profile) {
      if (!profile?.userId) return
      const entry = toAccount(profile, readCookies())
      const index = this.accounts.findIndex((a) => String(a.userId) === String(profile.userId))
      if (index >= 0) this.accounts.splice(index, 1, entry)
      else this.accounts.push(entry)
    },
    /** 切换账号：先存当前 cookie，再把目标账号 cookie 写回请求层使用的存储 */
    switchAccount(userId) {
      const target = this.accounts.find((a) => String(a.userId) === String(userId))
      if (!target) return false
      if (this.user?.userId) this.upsertAccount(this.user)
      writeCookies(target.cookies)
      this.user = {
        userId: target.userId,
        nickname: target.nickname,
        avatarUrl: target.avatarUrl,
        signature: target.signature,
        vipType: target.vipType,
        redVipLevel: target.redVipLevel
      }
      this.likelist = []
      return true
    },
    /** 移除已保存账号。正在使用的账号被移除时同步登出 */
    removeAccount(userId) {
      const index = this.accounts.findIndex((a) => String(a.userId) === String(userId))
      if (index < 0) return false
      this.accounts.splice(index, 1)
      if (String(this.user?.userId) === String(userId)) {
        writeCookies({})
        this.user = null
        this.likelist = []
      }
      return true
    },
    reset() {
      writeCookies({})
      this.user = null
      this.likelist = []
    }
  },
  persist: {
    storage: localStorage,
    paths: ['user', 'accounts']
  }
})
