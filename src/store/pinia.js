import { createPinia } from 'pinia'

// 持久化在 utils/persist.js 里显式挂载（见 bootstrap），
// 因为 player.js 在模块加载期就会创建 store，插件式注册来不及生效。
const pinia = createPinia()

export default pinia
