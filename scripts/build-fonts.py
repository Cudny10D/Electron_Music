#!/usr/bin/env python3
"""
把 HarmonyOS Sans SC 的 TTF 切成项目用的 woff2 子集。

用法：
    python scripts/build-fonts.py <字体目录> [输出目录]

<字体目录> 里需要有：
    HarmonyOS_Sans_SC_Regular.ttf
    HarmonyOS_Sans_SC_Medium.ttf
    HarmonyOS_Sans_SC_Bold.ttf
（官方 HarmonyOS-Sans.zip 解压后的 "HarmonyOS Sans/HarmonyOS_Sans_SC" 即可）

字符集 = GBK 能编码的全部汉字（含繁体，约 2.1 万字）
        + 拉丁 / 标点 / 全角 / 假名
        + src/ 里实际出现过的字符（防止 UI 文案用到生僻字）

依赖：pip install fonttools brotli
"""

import pathlib
import subprocess
import sys

WEIGHTS = ['Regular', 'Medium', 'Bold']

# 基础区段：拉丁、拉丁补充、通用标点、中日韩标点、全角字符、假名
RANGES = [
    (0x20, 0x7E),
    (0xA0, 0xFF),
    (0x2000, 0x206F),
    (0x3000, 0x303F),
    (0xFF00, 0xFFEF),
    (0x3040, 0x30FF),
]


def build_charset(src_dir: pathlib.Path) -> str:
    chars = set()

    for lo, hi in RANGES:
        for cp in range(lo, hi + 1):
            chars.add(chr(cp))

    # GBK 覆盖的汉字（简体 + 常见繁体 + 部分生僻字）
    for cp in range(0x3400, 0xA000):
        ch = chr(cp)
        try:
            ch.encode('gbk')
            chars.add(ch)
        except UnicodeEncodeError:
            pass

    # 界面里真的用到的字符
    for p in src_dir.rglob('*'):
        if p.suffix in {'.vue', '.js', '.scss', '.html'}:
            for ch in p.read_text(encoding='utf-8', errors='ignore'):
                if ord(ch) > 0x2000:
                    chars.add(ch)

    return ''.join(sorted(chars))


def main():
    root = pathlib.Path(__file__).resolve().parent.parent
    src = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else root / 'src' / 'assets' / 'fonts'

    if not src or not src.is_dir():
        print(__doc__)
        sys.exit(1)

    out.mkdir(parents=True, exist_ok=True)
    work = root / '.font-work'
    work.mkdir(exist_ok=True)

    charset = build_charset(root / 'src')
    chars_file = work / 'chars.txt'
    chars_file.write_text(charset, encoding='utf-8')
    print(f'字符集 {len(charset)} 个字符')

    for weight in WEIGHTS:
        ttf = src / f'HarmonyOS_Sans_SC_{weight}.ttf'
        if not ttf.exists():
            print(f'跳过（找不到 {ttf.name}）')
            continue
        target = out / f'HarmonyOS_Sans_SC_{weight}.woff2'
        subprocess.run(
            [
                sys.executable, '-m', 'fontTools.subset', str(ttf),
                f'--text-file={chars_file}',
                '--flavor=woff2',
                '--layout-features=*',
                '--name-IDs=*',
                f'--output-file={target}',
            ],
            check=True,
        )
        print(f'{target.name}  {target.stat().st_size / 1024 / 1024:.1f} MB')


if __name__ == '__main__':
    main()
