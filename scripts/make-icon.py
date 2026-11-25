#!/usr/bin/env python3
"""
从设计稿生成品牌资源。

输入（默认在桌面）：
  title.png  黑字 ELECTRON wordmark（RGBA）
  icon.png   黑色徽标（白底）

输出：
  src/assets/brand/electron-wordmark.png   裁边后的透明 wordmark（给 CSS mask 用）
  src/assets/icon/icon.ico                 应用图标：纸色圆角底 + 黑徽标（16–256）
  src/assets/icon/tray-black.ico           托盘图标（浅色任务栏用）
  src/assets/icon/tray-white.ico           托盘图标（深色任务栏用）
  src/assets/icon/icon-512.png             预览

用法：python scripts/make-icon.py [title.png] [icon.png]
"""

import pathlib
import sys

from PIL import Image, ImageDraw

PAPER = (246, 243, 234, 255)
ICON_SIZES = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]


def trim(im, pad=2):
    """按 alpha 裁掉四周空白"""
    bbox = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    return im.crop((
        max(0, x0 - pad),
        max(0, y0 - pad),
        min(im.width, x1 + pad),
        min(im.height, y1 + pad),
    ))


def make_wordmark(src, out):
    im = Image.open(src).convert('RGBA')
    # 只保留黑色笔画：RGB 压成纯黑，alpha 取原 alpha
    black = Image.new('RGBA', im.size, (0, 0, 0, 255))
    black.putalpha(im.getchannel('A'))
    trimmed = trim(black, 4)
    out.parent.mkdir(parents=True, exist_ok=True)
    trimmed.save(out)
    print('wordmark', trimmed.size, '->', out)


def make_glyph(src):
    """白底黑标 -> 黑色透明底；返回裁边后的 RGBA"""
    im = Image.open(src).convert('RGB')
    gray = im.convert('L')
    # 亮度越低越不透明，边缘保留半透明做抗锯齿
    alpha = gray.point(lambda v: 255 - v)
    glyph = Image.new('RGBA', im.size, (0, 0, 0, 255))
    glyph.putalpha(alpha)
    return trim(glyph, 2)


def split_mark(glyph):
    """徽标下方还有一行小字 ELECTRON，托盘 16px 下会糊成一团，这里切掉。
    从图高 60% 处往下找第一段连续空白行，作为分割线。"""
    alpha = glyph.getchannel('A')
    w, h = glyph.size
    empty = [alpha.crop((0, y, w, y + 1)).getbbox() is None for y in range(h)]

    y = int(h * 0.6)
    while y < h and not empty[y]:
        y += 1
    gap_start = y
    while y < h and empty[y]:
        y += 1

    if gap_start >= h - 4 or y >= h:
        return glyph
    return glyph.crop((0, 0, w, gap_start))


def glyph_variant(glyph, color, size):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inner = int(size * 0.94)
    scaled = glyph.copy().resize((inner, inner), Image.LANCZOS)
    tinted = Image.new('RGBA', scaled.size, color)
    tinted.putalpha(scaled.getchannel('A'))
    offset = ((size - inner) // 2, (size - inner) // 2)
    canvas.paste(tinted, offset, tinted)
    return canvas


def make_tray(glyph, color, out):
    # 用最大尺寸作为源，让 PIL 逐档下采样；用最小的那帧会被放大糊掉
    master = glyph_variant(glyph, color, 256)
    master.save(out, sizes=[(s, s) for s, _ in ICON_SIZES])
    print('tray', out.name)


def make_app_icon(glyph, out, preview):
    size = 512
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=PAPER)

    inner = int(size * 0.6)
    scaled = glyph.copy().resize((inner, inner), Image.LANCZOS)
    black = Image.new('RGBA', scaled.size, (17, 16, 12, 255))
    black.putalpha(scaled.getchannel('A'))
    canvas.paste(black, ((size - inner) // 2, (size - inner) // 2), black)

    canvas.save(preview)
    canvas.save(out, sizes=ICON_SIZES)
    print('app icon', out.name)


def main():
    root = pathlib.Path(__file__).resolve().parent.parent
    desktop = pathlib.Path.home() / 'Desktop'
    title = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else desktop / 'title.png'
    icon = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else desktop / 'icon.png'

    make_wordmark(title, root / 'src' / 'assets' / 'brand' / 'electron-wordmark.png')

    glyph = make_glyph(icon)
    mark = split_mark(glyph)
    out = root / 'src' / 'assets' / 'icon'
    out.mkdir(parents=True, exist_ok=True)

    make_app_icon(glyph, out / 'icon.ico', out / 'icon-512.png')
    make_tray(mark, (17, 16, 12, 255), out / 'tray-black.ico')
    make_tray(mark, (246, 243, 234, 255), out / 'tray-white.ico')


if __name__ == '__main__':
    main()
