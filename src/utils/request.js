import axios from 'axios'
import { getCookie, isLogin } from './authority'

const request = axios.create({
  baseURL: 'http://localhost:36530',
  withCredentials: true,
  timeout: 15000
})

request.interceptors.request.use((config) => {
  if (config.url !== '/login/qr/check' && isLogin()) {
    config.params = config.params || {}
    config.params.cookie = `MUSIC_U=${getCookie('MUSIC_U')};`
  }
  return config
})

request.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error)
)

export default request
