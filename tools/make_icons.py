# -*- coding: utf-8 -*-
"""홈 화면 아이콘 — 암기장 전용 한 벌.

허브(변호사시험 대비.zip)와 암기장을 둘 다 홈 화면에 두면 그림이 똑같아
이름을 읽어야 구분이 됐다. 같은 집안으로 보이되 한눈에 갈리게,
금색 저울은 그대로 두고 **바탕만** 암기장 색(민사법 분홍)으로 바꾼다.

바탕만 바꾸는 방법 — 허브 make_icons.py 와 같은 수를 쓴다.
전체를 그냥 물들이면 금색까지 분홍으로 떠서 그림이 바랜다. 화소마다
「금색인 정도」(R-B 가 클수록 금색)를 재서, 그 반대만큼만 새 바탕색을 섞는다.

원본: hub_site/icon-512.png (사용자 원본 그림에서 허브가 이미 만들어 둔 것)
"""
from PIL import Image
import numpy as np
import os

SRC   = r'C:\Users\82109\hub_site\icon-512.png'
OUT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAPER = (246, 244, 240)     # 허브 아이콘의 바탕(기준)
PINK  = (240, 226, 230)     # 암기장 민사법 --soft 에서 채도를 30% 뺀 값.
                            # 홈 화면 60px 에서 허브와는 갈리되 너무 분홍하지 않게

def tinted():
    a = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
    warmth = a[:, :, 0] - a[:, :, 2]
    gold = np.clip((warmth - 10) / 40.0, 0, 1)[:, :, None]      # 0=바탕, 1=금색
    shift = (np.array(PINK, np.float32) - np.array(PAPER, np.float32))
    return Image.fromarray(np.clip(a + shift * (1 - gold), 0, 255).astype(np.uint8))

def make(base, name, size, scale=1.0):
    if scale == 1.0:
        img = base
    else:                                                        # 안드로이드 원형 마스크용 여백
        s = int(base.size[0] * scale)
        img = Image.new('RGB', base.size, PINK)
        img.paste(base.resize((s, s), Image.LANCZOS), ((base.size[0] - s) // 2,) * 2)
    p = os.path.join(OUT, name)
    img.resize((size, size), Image.LANCZOS).save(p, optimize=True)
    print('  %s  %dx%d' % (name, size, size))

if __name__ == '__main__':
    b = tinted()
    make(b, 'apple-touch-icon.png', 180)
    make(b, 'icon-192.png', 192)
    make(b, 'icon-256.png', 256)          # 파비콘
    make(b, 'icon-512.png', 512)
    make(b, 'icon-maskable-512.png', 512, .80)
