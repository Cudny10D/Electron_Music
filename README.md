# Electron Music

> 一个基于 Electron + Vue 3 的网易云音乐桌面客户端 · 当前版本 `1.0.1`

Electron Music 是网易云音乐的第三方桌面客户端。它把完整的在线音乐体验（发现、搜索、播放、评论、歌单、云盘）装进一个无边框桌面壳里，并附带一套本地资料库：下载队列、本地歌曲扫描、播放历史、多账号管理与桌面歌词。

界面视觉参照同目录的 **Mass**（塞壬唱片播放器）：暖白纸面叠 24px 细网格、橄榄绿强调色、1px 直角描边、等宽大写小标签；全界面唯一的圆形控件是播放键。功能结构与交互则参照 **Hydrogen Music** 的资料库布局。项目只保留网易云在线能力，桌面运行时（窗口 / 托盘 / 全局快捷键 / 内置 API）开箱即用。

| 首页 | 全屏播放页（暗色） |
| --- | --- |
| ![首页](shots/instance-home.png) | ![全屏播放页](shots/dark-nowplaying.png) |

| 我的音乐 | 云盘 |
| --- | --- |
| ![我的音乐](shots/chk-my-tabs.png) | ![云盘](shots/chk-cloud-dark.png) |

## 功能特性

**发现与搜索**

- 首页推荐歌单、最新歌曲；搜索覆盖单曲 / 歌单 / 歌手 / 专辑，带实时建议与最近 8 条搜索历史
- 歌单、专辑、歌手详情页；歌手专辑支持分页「加载更多」
- 四类内容（歌单 / 专辑 / 歌手 / 歌曲）一键复制分享外链

**播放器**

- Mini 播放条 + 全屏歌词页 + 右侧队列抽屉；顺序 / 列表 / 单曲 / 随机四种播放模式
- 自绘非线性歌词滚动、翻译与罗马音 / 拼音对照、隐藏制作人员信息
- 多歌手逐个可点，分别跳转对应歌手主页；切歌时封面与内容做模糊交叉淡入
- 右下角工具坞：方框 `T` / `译` / `音` + 聊天气泡（评论），带开关动画
- 独立桌面歌词窗口（可锁定 / 解锁）、亚克力托盘菜单、全局快捷键

**评论与互动**

- 歌曲 / 歌单 / 专辑详情页接入评论区：排序、发表、回复、删除、点赞、分页
- 喜欢、收藏、播放历史（最近 300 首，可清空）

**我的音乐（Hydrogen 风格资料库）**

- 两栏布局：歌单 / 收藏 / 下载管理 / 本地管理；收藏下含专辑 / 歌手 / MV 三类
- 左侧条目列表 + 右侧详情与歌曲表，选中态带竖线与滑杆过渡，空数据画框显示 `NONE`
- 歌单管理：新建、编辑名称 / 简介 / 标签 / 封面、搜索并添加歌曲；歌曲可「添加到歌单」
- 下载队列：批量入队、并发 1–5、逐首进度、取消 / 重试 / 移除、同名自动加序号
- 本地音乐：多目录扫描、文件名解析、`file://` 播放、定位文件
- 云盘：分类浏览、容量信息、上传 / 播放 / 下载 / 删除

**设置与账号**

- 外观：主题（跟随系统 / 浅 / 深）、主题色（预设 / 自定义 / 滑块）、网格纸背景、界面缩放、自定义背景图、低性能模式
- 播放 / 歌词 / 下载 / 存储 / 快捷键 / 关于分区；设置内关键词搜索
- 扫码登录、多账号保存与一键切换、头像下拉菜单
- 动态强调色前景对比（自动保证浅 / 深色背景上文字可读）

## 快速开始

```bash
npm install

# 开发：两个终端
npm run dev        # 启动 Vite 渲染服务（http://localhost:5273）
npm start          # 启动 Electron（主进程会自动拉起内置 API）

# 构建与打包
npm run build      # 构建渲染层到 dist/
npm run dist       # 构建 + electron-builder 打包
```

网易云 API 由 Electron 主进程内置启动（`src/electron/services.js`，端口 **36530**），无需额外开服务。

若希望加速打包、避免从 GitHub 下载 Electron，可使用国内镜像：

```bash
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/" \
npx electron-builder -p never
```

产物输出到 `release/<version>/`，包含 NSIS 安装包、免安装便携版与 `win-unpacked/` 目录。

> 只调渲染层样式时，也可以单独 `npm run dev` 后在浏览器打开 `http://localhost:5273`。`src/utils/windowApi.js` 在非 Electron 环境下提供 shim，窗口控制变成空实现、播放列表落到 localStorage，页面不会因缺少桥接而崩溃。

## 技术栈

- **桌面壳**：Electron 21（Chromium 106）、contextIsolation + preload 桥接
- **渲染层**：Vue 3、Vue Router、Pinia、Vite 3、SCSS / Dart Sass
- **播放与网络**：howler.js、axios、NeteaseCloudMusicApi
- **本地存储**：localStorage（显式持久化管理）、electron-store（主进程设置）
- **字体**：HarmonyOS Sans SC（400 / 500 / 700 三档子集，woff2）

## 目录结构

```
background.js              主进程入口：无边框窗口、单实例、托盘、快捷键、内置 API
src/
  main.js / App.vue        渲染层入口与全局挂载（弹窗、toast、桌面歌词状态）
  bootstrap.js             应用初始化与持久化挂载
  electron/                IPC / preload / 托盘 / 全局快捷键 / 桌面歌词窗口 / API 启动
  api/                     网易云接口封装（song / playlist / album / artist / cloud / comment / user / login / other）
  utils/
    request.js             axios 实例（36530 + 登录 cookie 注入）
    player.js              播放内核：howler、进度、歌词、播放模式、托盘同步
    lyric.js               LRC 解析、翻译与罗马音合并
    windowApi.js           Electron 桥 + 浏览器 shim
    downloadCore.js        取流（v1 → 旧接口兜底）+ 文件名清洗
    songStatus.js          版权 / 会员可播放性判断
    share.js               四类分享外链
    persist.js             显式 localStorage 持久化
  store/                   Pinia：player / library / home / search / user / history / settings / ui / download / local
  components/              TitleBar、MiniPlayer、NowPlaying、CommentPanel、QueuePanel、DownloadPanel、
                           SongTable、CoverCard、PlaylistManager、CloudView 相关组件等
  views/                   Home / Search / Detail / My / Cloud / History / Settings / Login
  router/router.js         路由表
  styles/main.scss         设计令牌、通用样式与主题
  assets/                  字体、图标、品牌字标
scripts/                    构建 / 截图 / 回归测试脚本
shots/                      界面截图与回归产物
```

## 设计约定

- **纸 + 墨 + 一点橄榄**：`--paper` 暖白纸面叠 24px 网格；`--ink` 负责文字与细线；`--accent`（默认 `#6f754d`）只出现在播放键、「播放全部」、当前段落等需要被指认的地方。
- **直角细线**：无圆角（`border-radius: 0`），全界面唯一的圆形是播放键；分隔统一用 1px 线，不用投影。
- **排版**：标题用 HarmonyOS Sans SC 700；拉丁小字（NO. / TRACKS / VOLUME / ESC / 版本号）走等宽字体并加字距；列表编号 `01 / 02 …` 与章节编号共用一套等宽数字。
- **歌词**：当前行不用反白块，而是左侧 2px 竖线 + 加粗；未播放行降到 `--muted`。翻译与罗马音同字号 `var(--trans-size)`、同色 `--faint`（激活态 `--ink-soft`）。
- **主题**：暗色不是简单反相，而是换掉整套纸 / 墨 / 线变量，并另设 `--hover` / `--panel-bg` / `--titlebar-bg` / `--player-bg` 等语义色；toast 有专用 `--toast-bg / --toast-fg / --toast-edge`，避免深浅色反转成「浅底深字」。
- **强调色**：改动同步刷新 `--accent` / `--accent-dark` / `--accent-weak`，并通过亮度计算得出 `--on-accent`，保证按钮文字在任意强调色上都可读。
- **亚克力**：顶栏 / 底栏 / 抽屉 `position: fixed` 浮在内容之上，`backdrop-filter: blur(30px) saturate(180%)` + 半透明底色 + SVG 噪点；`.body` 用上下 padding 留出可视区。全屏播放器打开时给 `<html>` 加 `.np-open` 关闭顶栏拖拽区，避免抢走播放器顶部点击。
- **全屏背景**：当前封面 `inset: -14%` + `blur(90px) saturate(150%)` + `scale(1.16)` 铺满，上盖一层 `--np-wash` 薄雾保证歌词可读。
- **动画**：路由切换 `translateY(12px) + blur(9px)` 滑入；全屏播放器进场 `translateY(28px) + scale(.982) + blur(18px)`，退场更快；歌词滚动由 `requestAnimationFrame` 跑三次缓出（`1-(1-t)³`），用户滚轮 / 触摸时立即让出控制权；切歌时背景、封面、底栏封面各自以封面 URL 为 key 做模糊交叉淡入。
- **居中**：各页面统一 `max-width: var(--page-max)`（1760px）居中；全屏控件区用 `grid-template-columns: minmax(0,1fr) auto minmax(0,1fr)` 保证播放键落在中轴，两侧各 2 个按钮。
- **兼容性**：锁在 Electron 21（Chromium 106），不支持 `color-mix()` / `oklch()` 等较新 CSS 颜色函数；半透明一律用 `rgba` 变量。低性能模式下 `html.low-perf` 全局关闭 animation / transition / backdrop-filter。

## 字体

界面统一用 **HarmonyOS Sans SC**，按三档真实字重加载：400 用于次要信息，500 为正文默认，700 用于标题与当前行歌词。渲染设定为 `font-synthesis: none`、`font-kerning: normal`、`-webkit-font-smoothing: antialiased`。

字体做了子集化（GBK 全部汉字 + 拉丁 / 标点 / 全角 / 假名 + 源码实际用字）后压成 woff2，每档约 3.1 MB。需要重新生成时：

```bash
pip install fonttools brotli
python scripts/build-fonts.py "<解压目录>/HarmonyOS Sans/HarmonyOS_Sans_SC"
```

HarmonyOS Sans 由华为提供，许可允许免费商用，原文见 `src/assets/fonts/LICENSE-HarmonyOS-Sans.txt`。

## 已知限制

- **网易云风控兜底**：`/song/url/v1` 在部分网络下返回 `-460`（网络环境风险）时，播放内核自动改用旧接口 `/song/url` 重试；两者都失败才提示。
- **VIP / 付费歌曲**：不在客户端拦截。会员权益只有带 cookie 的取流接口能判定，点击照常取流并按音质逐级降级（Hi-Res → 无损 → 极高 → 标准），仍无地址才提示。
- 只实现二维码登录；密码登录已被网易云盾拦截。界面仅简体中文，未做移动端适配（窗口最小 1060×680）。
- 持久化未用 `pinia-plugin-persistedstate`（模块加载顺序会导致部分 store 静默不落盘），改由 `utils/persist.js` 在 `bootstrap()` 里显式挂载。
- Pinia 的响应式 Proxy 不能直接过 IPC，传给 `ipcRenderer.invoke` 前需先转成普通对象 / 数组。

## 截图与回归脚本

`scripts/shot.js` 用 Electron 离屏渲染逐页截图到 `shots/`；`scripts/shot-one.js` 支持用环境变量截单页：

```bash
npm run dev
npx electron scripts/shot.js
MSYS_NO_PATHCONV=1 SHOT_HASH='#/settings' SHOT_NAME=settings npx electron scripts/shot-one.js
```

回归脚本大多用离屏窗口 + 替换 axios adapter 注入假 API，不依赖真实账号或网络，运行前需先 `npm run dev`（5273）：

- `test-download-queue.js` / `test-download-entry.js`：本地假 API + 慢速音频流，验证并发、进度、取消、失败重试
- `test-my-music.js` / `shot-my-dark.js`：资料库分区、详情、空态、歌单管理、暗色布局
- `test-np-controls.js`：全屏播放器控件在多种尺寸下的居中偏差
- `test-desktop-lyric.js` / `shot-comments.js` / `test-search-suggest.js` / `test-settings.js` 等：各自模块的交互回归

## 许可

界面重写部分基于 Hydrogen-Music 5.0（MIT）；视觉语言来自 Mass；字体为 HarmonyOS Sans。各项目版权行见其原始仓库与 `src/assets/fonts/LICENSE-HarmonyOS-Sans.txt`。本项目仅供学习交流，请遵守网易云音乐相关服务条款。
