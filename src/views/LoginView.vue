<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createQRcode, checkQRcodeStatus, getQRcode } from '../api/login'
import { getLikelist, getUserProfile } from '../api/user'
import { setCookies } from '../utils/authority'
import { useUserStore } from '../store/userStore'
import Icon from '../components/Icon.vue'

const router = useRouter()
const user = useUserStore()

const qrKey = ref('')
const qrImg = ref('')
const state = ref('loading') // loading | waiting | scanned | expired | success | error
let timer = null

const statusMap = {
  loading: { en: 'LOADING', cn: '正在生成二维码…' },
  waiting: { en: 'WAITING', cn: '等待扫码' },
  scanned: { en: 'CONFIRM', cn: '已扫码，请在手机上确认' },
  expired: { en: 'EXPIRED', cn: '二维码已过期' },
  success: { en: 'SUCCESS', cn: '登录成功，正在同步…' },
  error: { en: 'ERROR', cn: '二维码获取失败' }
}

const status = computed(() => statusMap[state.value])

async function loadQrcode() {
  state.value = 'loading'
  stopPolling()
  try {
    const res = await getQRcode()
    qrKey.value = res.data?.unikey
    if (!qrKey.value) throw new Error('no key')

    const img = await createQRcode(qrKey.value)
    qrImg.value = img.data?.qrimg || ''
    state.value = 'waiting'
    startPolling()
  } catch (err) {
    state.value = 'error'
  }
}

function startPolling() {
  stopPolling()
  timer = setInterval(async () => {
    if (!qrKey.value) return
    try {
      const res = await checkQRcodeStatus(qrKey.value)
      if (res.code === 800) {
        state.value = 'expired'
        stopPolling()
      } else if (res.code === 802) {
        state.value = 'scanned'
      } else if (res.code === 803) {
        stopPolling()
        state.value = 'success'
        setCookies(res, 'qr')
        const profile = await getUserProfile()
        user.setUser(profile.profile)
        try {
          const likes = await getLikelist(profile.profile.userId)
          user.setLikelist(likes.ids || [])
        } catch (err) {
          user.setLikelist([])
        }
        setTimeout(() => router.push('/my'), 600)
      }
    } catch (err) {
      // 轮询失败继续重试
    }
  }, 1500)
}

function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}

onMounted(loadQrcode)
onBeforeUnmount(stopPolling)
</script>

<template>
  <div class="login">
    <div class="login__intro">
      <span class="hb-label">ACCOUNT</span>
      <h1 class="login__title hb-display">扫码<br />登录</h1>
      <p class="login__note">
        用网易云音乐 App 扫描右侧二维码。<br />
        网易云盾会拦截密码登录，因此这里只保留扫码。
      </p>
      <span class="login__foot hb-mono">ELECTRON / AUTH MODULE</span>
    </div>

    <div class="card hb-frame">
      <div class="card__head">
        <span class="hb-mono">{{ status.en }}</span>
        <span class="card__dot" :class="`is-${state}`" />
      </div>

      <div class="card__qr" :class="`is-${state}`" @click="state === 'expired' && loadQrcode()">
        <img v-if="qrImg" :src="qrImg" alt="登录二维码" />
        <div v-else class="card__placeholder">
          <Icon :name="state === 'error' ? 'refresh' : 'disc'" :size="30" />
        </div>
        <div v-if="state === 'expired'" class="card__mask">
          <Icon name="refresh" :size="20" />
          <span>点击刷新</span>
        </div>
      </div>

      <p class="card__hint">{{ status.cn }}</p>

      <button v-if="state === 'expired' || state === 'error'" class="hb-btn card__retry" @click="loadQrcode">
        刷新二维码
      </button>

      <div class="card__rule" />
      <p class="card__note hb-mono">扫码后在手机端确认即可自动登录</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login {
  min-height: calc(100% - 40px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  align-items: center;
  gap: 80px;
  padding: 40px var(--gutter);
  max-width: 1180px;
  margin-inline: auto;

  &__intro {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 18px;
  }

  &__title {
    font-size: 76px;
    line-height: 1.02;
    letter-spacing: -0.01em;
  }

  &__note {
    font-size: 12px;
    line-height: 1.9;
    color: var(--muted);
    max-width: 380px;
  }

  &__foot {
    margin-top: 10px;
    font-size: 9px;
    color: var(--faint);
  }
}

.card {
  background: var(--panel-bg);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid var(--line-strong);
  padding: 22px;
  display: flex;
  flex-direction: column;
  align-items: stretch;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9px;
    color: var(--muted);
    letter-spacing: 0.2em;
    margin-bottom: 16px;
  }

  &__dot {
    width: 7px;
    height: 7px;
    background: var(--muted);

    &.is-waiting {
      background: var(--accent);
    }
    &.is-scanned {
      background: #d98b1f;
    }
    &.is-success {
      background: #2f8f4e;
    }
    &.is-expired,
    &.is-error {
      background: var(--danger);
    }
  }

  &__qr {
    position: relative;
    aspect-ratio: 1 / 1;
    background: #fff;
    border: 1px solid var(--line);
    display: grid;
    place-items: center;
    cursor: default;

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 10px;
    }

    &.is-expired {
      cursor: pointer;
    }
  }

  &__placeholder {
    color: var(--faint);
  }

  &__mask {
    position: absolute;
    inset: 0;
    background: var(--qr-mask);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 11px;
    color: var(--ink-soft);
    backdrop-filter: blur(2px);
  }

  &__hint {
    margin-top: 14px;
    font-size: 12px;
    color: var(--ink-soft);
    text-align: center;
  }

  &__retry {
    margin-top: 12px;
    height: 32px;
  }

  &__rule {
    height: 1px;
    background: var(--line);
    margin: 18px 0 12px;
  }

  &__note {
    font-size: 8px;
    color: var(--faint);
    text-align: center;
    letter-spacing: 0.14em;
  }
}
</style>
