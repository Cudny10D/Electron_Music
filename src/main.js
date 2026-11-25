import { createApp } from 'vue'
import 'normalize.css'
import './styles/main.scss'

import App from './App.vue'
import router from './router/router'
import pinia from './store/pinia'
import { bootstrap } from './bootstrap'

const app = createApp(App)

app.use(pinia)
app.use(router)
app.mount('#app')

bootstrap()

// 开发期调试出口：浏览器控制台里可以直接看播放状态
if (import.meta.env.DEV) {
  window.__pinia = pinia
  import('./store/playerStore').then(({ usePlayerStore }) => {
    window.__player = usePlayerStore(pinia)
  })
  import('./store/searchStore').then(({ useSearchStore }) => { window.__search = useSearchStore(pinia) })
  import('./store/settingsStore').then(({ useSettingsStore }) => {
    window.__settings = useSettingsStore(pinia)
  })
  import('./store/downloadStore').then(({ useDownloadStore }) => {
    window.__download = useDownloadStore(pinia)
  })
  import('./store/uiStore').then(({ useUiStore }) => {
    window.__ui = useUiStore(pinia)
  })
  import('./store/localStore').then(({ useLocalStore }) => {
    window.__local = useLocalStore(pinia)
  })
}
