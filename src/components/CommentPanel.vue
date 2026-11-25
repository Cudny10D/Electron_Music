<script setup>
import { computed, ref, watch } from 'vue'
import {
  getComments,
  postComment,
  likeComment,
  COMMENT_SORT
} from '../api/comment'
import { useUserStore } from '../store/userStore'
import { useUiStore } from '../store/uiStore'
import { formatCount } from '../utils/format'
import Icon from './Icon.vue'

const props = defineProps({
  /** 资源类型：0 歌曲 / 2 歌单 / 3 专辑 */
  type: { type: Number, required: true },
  /** 资源 id */
  id: { type: [String, Number], required: true },
  /** 每次加载条数 */
  pageSize: { type: Number, default: 20 }
})

const user = useUserStore()
const ui = useUiStore()

const comments = ref([])
const total = ref(0)
const hasMore = ref(false)
const cursor = ref('')
const loading = ref(false)
const moreLoading = ref(false)
const error = ref('')

const sort = ref(COMMENT_SORT.RECOMMEND)
const SORTS = [
  { value: COMMENT_SORT.RECOMMEND, label: '推荐' },
  { value: COMMENT_SORT.HOT, label: '热门' },
  { value: COMMENT_SORT.TIME, label: '最新' }
]

const draft = ref('')
const sending = ref(false)
// 当前正在回复的评论（null 表示发表新评论）
const replyingTo = ref(null)
const replyDraft = ref('')

const title = computed(() => (total.value ? `${formatCount(total.value)} 条评论` : '评论'))

function reset() {
  comments.value = []
  total.value = 0
  hasMore.value = false
  cursor.value = ''
  error.value = ''
  replyingTo.value = null
  draft.value = ''
  replyDraft.value = ''
}

async function load({ append = false } = {}) {
  if (!props.id) return
  const pageNo = append ? Math.floor(comments.value.length / props.pageSize) + 1 : 1
  if (append) moreLoading.value = true
  else loading.value = true
  error.value = ''

  try {
    const res = await getComments({
      type: props.type,
      id: props.id,
      pageNo,
      pageSize: props.pageSize,
      sortType: sort.value,
      ...(append && cursor.value ? { cursor: cursor.value } : {})
    })
    const data = res?.data || {}
    const list = Array.isArray(data.comments) ? data.comments : []
    comments.value = append ? comments.value.concat(list) : list
    total.value = Number(data.totalCount) || 0
    hasMore.value = !!data.hasMore
    cursor.value = data.cursor || ''
  } catch (err) {
    error.value = '评论加载失败，请稍后重试'
    if (!append) comments.value = []
  } finally {
    loading.value = false
    moreLoading.value = false
  }
}

function changeSort(value) {
  if (sort.value === value) return
  sort.value = value
  reset()
  load()
}

/** 发表新评论 */
async function send() {
  const content = draft.value.trim()
  if (!content) return
  if (!user.loggedIn) return ui.toast('登录后才能发表评论', 'error')
  sending.value = true
  try {
    const res = await postComment({ type: props.type, id: props.id, content, t: 1 })
    if (res?.code === 200) {
      draft.value = ''
      ui.toast('评论发表成功', 'success')
      reset()
      await load()
    } else {
      ui.toast(res?.message || '发表失败，请重试', 'error')
    }
  } catch (err) {
    ui.toast('发表失败，请检查网络或登录状态', 'error')
  } finally {
    sending.value = false
  }
}

/** 回复某条评论 */
function startReply(comment) {
  if (!user.loggedIn) return ui.toast('登录后才能回复评论', 'error')
  replyingTo.value = comment
  replyDraft.value = ''
}

async function sendReply() {
  const content = replyDraft.value.trim()
  const target = replyingTo.value
  if (!content || !target) return
  sending.value = true
  try {
    const res = await postComment({
      type: props.type,
      id: props.id,
      content,
      t: 2,
      commentId: target.commentId
    })
    if (res?.code === 200) {
      replyingTo.value = null
      replyDraft.value = ''
      ui.toast('回复成功', 'success')
      // 回复不一定顶到列表前，简单重新拉取当前排序
      await load()
    } else {
      ui.toast(res?.message || '回复失败，请重试', 'error')
    }
  } catch (err) {
    ui.toast('回复失败，请检查网络或登录状态', 'error')
  } finally {
    sending.value = false
  }
}

/** 点赞 / 取消点赞（本地即时反馈） */
async function toggleLike(comment) {
  if (!user.loggedIn) return ui.toast('登录后才能点赞', 'error')
  const next = !comment.liked
  const delta = next ? 1 : -1
  comment.liked = next
  comment.likedCount = Math.max(0, (comment.likedCount || 0) + delta)
  try {
    const res = await likeComment({
      type: props.type,
      id: props.id,
      cid: comment.commentId,
      t: next ? 1 : 0
    })
    if (res?.code !== 200) throw new Error('like failed')
  } catch (err) {
    // 失败回滚
    comment.liked = !next
    comment.likedCount = Math.max(0, (comment.likedCount || 0) - delta)
    ui.toast('点赞失败，请重试', 'error')
  }
}

/** 删除自己的评论 */
async function remove(comment) {
  try {
    const res = await postComment({
      type: props.type,
      id: props.id,
      t: 0,
      commentId: comment.commentId
    })
    if (res?.code === 200) {
      comments.value = comments.value.filter((c) => c.commentId !== comment.commentId)
      total.value = Math.max(0, total.value - 1)
      ui.toast('评论已删除', 'success')
    } else {
      ui.toast(res?.message || '删除失败', 'error')
    }
  } catch (err) {
    ui.toast('删除失败，请重试', 'error')
  }
}

function isMine(comment) {
  return user.loggedIn && comment?.user?.userId === user.user?.userId
}

function timeText(comment) {
  return comment?.timeStr || (comment?.time ? new Date(comment.time).toLocaleDateString() : '')
}

watch(
  () => [props.type, props.id],
  () => {
    reset()
    load()
  },
  { immediate: true }
)
</script>

<template>
  <section class="comments">
    <div class="hb-section comments__head">
      <span class="hb-label">COMMENTS</span>
      <h2 class="hb-section__title">评论</h2>
      <span class="hb-section__line" />
      <span class="hb-mono hb-muted">{{ title }}</span>
    </div>

    <!-- 发表评论 -->
    <div class="comments__composer">
      <img
        v-if="user.loggedIn && user.user?.avatarUrl"
        class="comments__avatar comments__avatar--me"
        :src="`${user.user.avatarUrl}?param=80y80`"
        alt=""
      />
      <div v-else class="comments__avatar comments__avatar--guest"><Icon name="user" :size="16" /></div>
      <div class="comments__composer-body">
        <textarea
          v-model="draft"
          class="comments__input hb-acrylic"
          rows="2"
          :placeholder="user.loggedIn ? '说点什么…' : '登录后即可发表评论'"
          :disabled="!user.loggedIn || sending"
          @keydown.ctrl.enter.prevent="send"
        />
        <div class="comments__composer-foot">
          <span class="hb-mono comments__hint">Ctrl + Enter 发表</span>
          <button
            class="hb-btn hb-btn--solid comments__send"
            :disabled="!user.loggedIn || !draft.trim() || sending"
            @click="send"
          >
            {{ sending ? '发表中…' : '发表' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 排序切换 -->
    <div class="comments__sort">
      <button
        v-for="s in SORTS"
        :key="s.value"
        class="comments__sort-btn hb-mono"
        :class="{ 'is-active': sort === s.value }"
        @click="changeSort(s.value)"
      >
        {{ s.label }}
      </button>
    </div>

    <!-- 骨架 -->
    <div v-if="loading" class="comments__skeleton">
      <div v-for="n in 3" :key="n" class="comments__sk-row">
        <div class="comments__sk-avatar" />
        <div class="comments__sk-lines">
          <div class="comments__sk-line" style="width: 28%" />
          <div class="comments__sk-line" style="width: 82%" />
          <div class="comments__sk-line" style="width: 50%" />
        </div>
      </div>
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="comments__state hb-mono">
      <span>{{ error }}</span>
      <button class="hb-btn" @click="load()">重试</button>
    </div>

    <!-- 空态 -->
    <div v-else-if="!comments.length" class="comments__state hb-mono">
      还没有评论，来抢占沙发吧
    </div>

    <!-- 评论列表 -->
    <ul v-else class="comments__list">
      <li v-for="c in comments" :key="c.commentId" class="comment">
        <img
          v-if="c.user?.avatarUrl"
          class="comments__avatar"
          :src="`${c.user.avatarUrl}?param=100y100`"
          alt=""
        />
        <div v-else class="comments__avatar comments__avatar--guest"><Icon name="user" :size="16" /></div>

        <div class="comment__body">
          <div class="comment__meta">
            <span class="comment__name">{{ c.user?.nickname || '匿名用户' }}</span>
            <span v-if="c.user?.vipType" class="comment__vip hb-mono">VIP</span>
            <span class="comment__time hb-mono">{{ timeText(c) }}</span>
          </div>

          <p class="comment__content">{{ c.content }}</p>

          <!-- 被回复内容 -->
          <div v-if="c.beReplied?.length" class="comment__replied">
            <p v-for="r in c.beReplied" :key="r.commentId || r.beRepliedCommentId">
              <span class="comment__replied-name">{{ r.user?.nickname }}：</span>{{ r.content }}
            </p>
          </div>

          <div class="comment__actions">
            <button
              class="comment__action hb-mono"
              :class="{ 'is-liked': c.liked }"
              @click="toggleLike(c)"
            >
              <Icon name="heart" :size="12" :weight="1.8" />
              {{ formatCount(c.likedCount) }}
            </button>
            <button class="comment__action hb-mono" @click="startReply(c)">
              <Icon name="more" :size="12" />
              回复
            </button>
            <button v-if="isMine(c)" class="comment__action hb-mono" @click="remove(c)">
              <Icon name="trash" :size="12" />
              删除
            </button>
          </div>

          <!-- 回复输入框 -->
          <div v-if="replyingTo?.commentId === c.commentId" class="comment__reply-box">
            <input
              v-model="replyDraft"
              class="comment__reply-input hb-acrylic"
              type="text"
              :placeholder="`回复 ${c.user?.nickname || ''}`"
              @keydown.enter.prevent="sendReply"
            />
            <button class="hb-btn hb-btn--solid" :disabled="!replyDraft.trim() || sending" @click="sendReply">
              发送
            </button>
            <button class="hb-btn" @click="replyingTo = null">取消</button>
          </div>
        </div>
      </li>
    </ul>

    <!-- 加载更多 -->
    <div v-if="hasMore && !loading" class="comments__more">
      <button class="hb-btn" :disabled="moreLoading" @click="load({ append: true })">
        {{ moreLoading ? '加载中…' : '加载更多评论' }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.comments {
  &__head {
    align-items: center;
  }

  &__composer {
    display: flex;
    gap: 12px;
    margin: 20px 0 16px;
  }

  &__composer-body {
    flex: 1;
    min-width: 0;
  }

  &__input {
    width: 100%;
    min-height: 62px;
    padding: 11px 13px;
    border: 1px solid var(--line-strong);
    border-radius: 2px;
    /* textarea 默认白底会盖掉 hb-acrylic 的毛玻璃，显式用半透明面板色 */
    background: var(--glass-panel);
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    line-height: 1.6;
    resize: vertical;
    outline: none;
    transition: border-color 0.16s, background 0.16s;

    &::placeholder {
      color: var(--faint);
    }

    &:focus {
      border-color: var(--accent);
      background: var(--surface-2);
    }

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }

  &__composer-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 8px;
  }

  &__hint {
    color: var(--faint);
    font-size: 9px;
  }

  &__send {
    min-width: 84px;
  }

  &__avatar {
    width: 36px;
    height: 36px;
    flex: none;
    border-radius: 50%;
    object-fit: cover;
    background: var(--hover-surface);

    &--me {
      border: 1px solid var(--accent);
    }

    &--guest {
      display: grid;
      place-items: center;
      color: var(--muted);
    }
  }

  &__sort {
    display: flex;
    gap: 4px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--line);
  }

  &__sort-btn {
    padding: 5px 12px;
    border: none;
    border-radius: 2px;
    background: transparent;
    color: var(--muted);
    font-size: 10px;
    cursor: pointer;
    transition: color 0.16s, background 0.16s;

    &:hover {
      color: var(--ink);
      background: var(--hover);
    }

    &.is-active {
      color: var(--on-accent, var(--ink));
      background: var(--accent);
    }
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  &__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 48px 0;
    color: var(--muted);
    font-size: 11px;
  }

  &__more {
    display: flex;
    justify-content: center;
    padding: 22px 0 6px;
  }

  &__skeleton {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-top: 20px;
  }

  &__sk-row {
    display: flex;
    gap: 12px;
  }

  &__sk-avatar {
    width: 36px;
    height: 36px;
    flex: none;
    border-radius: 50%;
    background: var(--hover-surface);
    animation: c-pulse 1.4s infinite ease-in-out;
  }

  &__sk-lines {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__sk-line {
    height: 11px;
    background: var(--hover-surface);
    animation: c-pulse 1.4s infinite ease-in-out;
  }
}

.comment {
  display: flex;
  gap: 12px;
  padding: 18px 0;
  border-bottom: 1px solid var(--line);

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__name {
    font-size: 12px;
    color: var(--accent);
    font-weight: 500;
  }

  &__vip {
    padding: 1px 5px;
    border: 1px solid var(--accent);
    border-radius: 2px;
    font-size: 8px;
    color: var(--accent);
  }

  &__time {
    font-size: 9px;
    color: var(--faint);
  }

  &__content {
    margin: 7px 0 0;
    font-size: 12px;
    line-height: 1.75;
    color: var(--ink);
    word-break: break-word;
    /* 在半透明亚克力 + 封面模糊底上，文字边缘容易被背景带走，补一点对比 */
    text-shadow: 0 0 1px currentColor;
  }

  &__replied {
    margin-top: 8px;
    padding: 8px 12px;
    background: var(--hover-surface);
    border-left: 2px solid var(--accent);
    font-size: 11px;
    line-height: 1.7;
    color: var(--muted);

    p {
      margin: 0;
    }
  }

  &__replied-name {
    color: var(--accent);
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-top: 10px;
  }

  &__action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--muted);
    font-size: 10px;
    cursor: pointer;
    transition: color 0.16s;

    &:hover {
      color: var(--ink);
    }

    &.is-liked {
      color: var(--accent);
    }
  }

  &__reply-box {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  &__reply-input {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid var(--line-strong);
    border-radius: 2px;
    background: var(--glass-panel);
    color: var(--ink);
    font: inherit;
    font-size: 11px;
    outline: none;

    &::placeholder {
      color: var(--faint);
    }

    &:focus {
      border-color: var(--accent);
      background: var(--surface-2);
    }
  }
}

@keyframes c-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}
</style>
