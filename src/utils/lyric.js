const TIME_TAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/** 解析 LRC 文本为 [{ time, text }] */
export function parseLyric(text) {
  if (!text) return []
  const lines = []

  text.split(/\r?\n/).forEach((raw) => {
    const tags = Array.from(raw.matchAll(TIME_TAG))
    if (!tags.length) return
    const content = raw.replace(TIME_TAG, '').trim()
    if (!content) return
    tags.forEach((match) => {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0
      lines.push({ time: minutes * 60 + seconds + fraction, text: content })
    })
  })

  return lines.sort((a, b) => a.time - b.time)
}

/** 把翻译歌词合并进原文（按 0.1s 精度对齐） */
export function mergeTranslation(lines, translationText) {
  const translation = parseLyric(translationText)
  if (!translation.length) return lines

  const dict = new Map(translation.map((item) => [Math.round(item.time * 10), item.text]))
  return lines.map((line) => ({
    ...line,
    trans: dict.get(Math.round(line.time * 10)) || ''
  }))
}

/** 把罗马音 / 拼音歌词合并进原文（按 0.1s 精度对齐） */
export function mergeRoma(lines, romaText) {
  const roma = parseLyric(romaText)
  if (!roma.length) return lines

  const dict = new Map(roma.map((item) => [Math.round(item.time * 10), item.text]))
  return lines.map((line) => ({
    ...line,
    roma: dict.get(Math.round(line.time * 10)) || ''
  }))
}

/** 根据播放进度找出当前行 */
export function findLyricIndex(lines, time) {
  if (!lines.length) return -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (time >= lines[i].time) return i
  }
  return -1
}

/* ------------------------------------------------------------------
   制作人员信息识别

   网易云的纯音乐 / OST 常把一屏制作名单塞进歌词，形如：
     作曲：xxx
     音乐设计/监制：MSR Studio
     吉他 Guitar：宫崎 大介
     鼓手：蒋之珏

   旧实现按行首关键字匹配，组合标签（音乐设计/监制）和带后缀的
   英文标签（吉他 Guitar）都会漏。现在取第一个冒号前的标签，
   按 / 、 & 等切成若干段，判断每段是否以常见职务词结尾。
   单字标签（词 / 曲 / 鼓）只接受完全相等，避免把「夜曲：…」
   这类正常歌词当成制作人员。 */
const CREDIT_WORDS = [
  '作词', '作曲', '编曲', '编曲人', '制作人', '制作', '监制', '音乐设计',
  '出品', '出品人', '发行', '发行公司', '混音', '混音师', '母带', '母带师',
  '录音', '录音师', '吉他', '贝斯', '贝司', '鼓手', '键盘', '钢琴', '和声',
  '弦乐', '弦乐编写', '人声', '演唱', '原唱', '配唱', '统筹', '企划', '策划',
  '美术', '设计', '封面', '插画', '摄影', '演奏', '编写', '词曲', '谱曲',
  '填词', '版权', '助理', '制作统筹', '执行制作', '音乐制作',
  'producer', 'composer', 'arranger', 'arrangement', 'lyricist', 'lyrics', 'lyric',
  'guitar', 'bass', 'drums', 'piano', 'keys', 'keyboard', 'strings',
  'vocals', 'vocal', 'mixing', 'mix', 'mastering', 'master',
  'recorded', 'recording', 'written', 'songwriter', 'engineer', 'studio',
  'label', 'production', 'music'
]

const CREDIT_SINGLE = ['词', '曲', '鼓', 'op', 'sp']

export function isCreditLine(text) {
  const line = String(text || '').trim()
  const colon = line.search(/[:：]/)
  if (colon <= 0) return false

  // 标签过长就不是职务名了，多半是正文里的冒号
  const prefix = line.slice(0, colon)
  if (prefix.length > 24) return false

  return prefix
    .split(/[/／、,，&·|]/)
    .map((seg) =>
      seg
        .replace(/\s+/g, '')
        .toLowerCase()
        .replace(/by$/, '')
    )
    .some(
      (seg) =>
        seg &&
        (CREDIT_SINGLE.includes(seg) || CREDIT_WORDS.some((word) => seg.endsWith(word)))
    )
}
