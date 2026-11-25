import { createRouter, createWebHashHistory } from 'vue-router'

import HomeView from '../views/HomeView.vue'
import SearchView from '../views/SearchView.vue'
import DetailView from '../views/DetailView.vue'
import MyView from '../views/MyView.vue'
import CloudView from '../views/CloudView.vue'
import SettingsView from '../views/SettingsView.vue'
import LoginView from '../views/LoginView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/search', name: 'search', component: SearchView },
  {
    path: '/playlist/:id',
    name: 'playlist',
    component: DetailView,
    props: (route) => ({ kind: 'playlist', id: route.params.id })
  },
  {
    path: '/album/:id',
    name: 'album',
    component: DetailView,
    props: (route) => ({ kind: 'album', id: route.params.id })
  },
  {
    path: '/artist/:id',
    name: 'artist',
    component: DetailView,
    props: (route) => ({ kind: 'artist', id: route.params.id })
  },
  { path: '/likes', name: 'likes', component: DetailView, props: { kind: 'likes' } },
  { path: '/daily', name: 'daily', component: DetailView, props: { kind: 'daily' } },
  { path: '/my', name: 'my', component: MyView },
  { path: '/cloud', name: 'cloud', component: CloudView },
  // 「历史」已并入「我的音乐」成为资料库分区；旧路由重定向过来，避免两处重复
  { path: '/history', redirect: '/my?tab=history' },
  { path: '/settings', name: 'settings', component: SettingsView },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

export default createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})
