"""Cut the nine source images down to 16:9 start/end frames for video generation.

Run from a folder that holds plates/p{n}.png (the original images, numbered as supplied).
Writes keyframes/kf{order}_{name}.jpg at 1920x1080, in story order.
"""
import os, sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else 'plates'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'keyframes'
os.makedirs(OUT, exist_ok=True)

# story order -> (source number, name, horizontal bias 0 = keep left edge, 1 = keep right edge, vertical bias 0 = keep top)
STORY = [
    (1, 6, 'sun',         0.5, 0.5),
    (2, 7, 'atmosphere',  0.5, 0.5),
    (3, 8, 'clouds',      0.5, 0.5),
    (4, 9, 'roof',        0.5, 0.5),
    (5, 1, 'module',      0.5, 0.5),
    (6, 4, 'inverter',    0.5, 0.0),   # panel runs to the top edge, so trim the floor instead
    (7, 2, 'entrance',    0.15, 0.5),  # the power stream enters from the left edge
    (8, 3, 'house',       0.30, 0.5),  # keep the car at the right and a sliver of the sun at the left
]
TW, TH = 1920, 1080
for order, n, name, bx, by in STORY:
    im = Image.open(f'{SRC}/p{n}.png').convert('RGB')
    w, h = im.size
    if w / h > TW / TH:                       # too wide: trim the sides
        cw = round(h * TW / TH); x0 = round((w - cw) * bx); box = (x0, 0, x0 + cw, h)
    else:                                     # too tall: trim top and bottom
        ch = round(w * TH / TW); y0 = round((h - ch) * by); box = (0, y0, w, y0 + ch)
    out = im.crop(box).resize((TW, TH), Image.LANCZOS)
    path = f'{OUT}/kf{order}_{name}.jpg'
    out.save(path, quality=95, subsampling=0)
    print(path, 'from', (w, h), 'crop', box)
