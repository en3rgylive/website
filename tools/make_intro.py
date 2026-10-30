#!/usr/bin/env python3
"""Make the clean sun for the landing screen from the first frame of the film.

The first frame shows the sun with a corona, a starfield and the ray leaving it. The landing screen should show only the
sun, so this tool:
  1. fits a circle to the sun's outer rim,
  2. paints out the ray and its hot spot on the disc by copying the opposite side of the disc over it (a 180 degree
     turn about the centre keeps the limb darkening and the rim continuous),
  3. cuts everything outside the rim (corona, stars) to transparent,
and writes sun.webp (same size as the frame) plus the numbers the player needs for docs/clips/manifest.json.

    python3 tools/make_intro.py first_frame.png docs/clips/sun.webp --hot 1570,757 --beam 1100,915

--hot is the ray's hot spot and --beam a point where the ray crosses the rim, both in pixels of the frame.
"""
import argparse, json, sys
import cv2, numpy as np

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('frame'); ap.add_argument('out')
ap.add_argument('--hot', required=True, help='x,y of the ray hot spot')
ap.add_argument('--beam', required=True, help='x,y of the ray where it crosses the rim')
ap.add_argument('--centre', default='', help='x,y of the sun centre (default: fitted)')
ap.add_argument('--radius', type=float, default=0, help='rim radius in pixels (default: fitted)')
ap.add_argument('--hot-r', type=float, default=125, help='radius of the hot spot patch')
ap.add_argument('--w0', type=float, default=120, help='half-width of the ray patch at the hot spot')
ap.add_argument('--w1', type=float, default=165, help='half-width of the ray patch at the rim')
ap.add_argument('--feather', type=float, default=30)
ap.add_argument('--trim', type=float, default=0.985, help='cut the disc at this share of the fitted rim radius')
ap.add_argument('--debug', default='', help='write a picture of the patch mask here')
a = ap.parse_args()

im = cv2.imread(a.frame)
H, W = im.shape[:2]
g = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 2)
hot = np.array([float(v) for v in a.hot.split(',')]); beam = np.array([float(v) for v in a.beam.split(',')])

if a.centre and a.radius:
    cx, cy = [float(v) for v in a.centre.split(',')]; R = a.radius
else:
    c0 = np.array([W * 0.63, H * 0.49])                    # rough start; fitted on the side away from the ray
    pts = []
    for ang in np.deg2rad(np.arange(-75, 76, 3)):
        rs = np.arange(int(H * 0.2), int(H * 0.5))
        xs = (c0[0] + rs * np.cos(ang)).astype(int); ys = (c0[1] + rs * np.sin(ang)).astype(int)
        ok = (xs >= 0) & (xs < W) & (ys >= 0) & (ys < H)
        prof = g[ys[ok], xs[ok]]; pk = int(np.argmax(prof)); below = np.where(prof[pk:] < 0.35 * prof[pk])[0]
        if len(below):
            r = rs[ok][pk + below[0]]; pts.append((c0[0] + r * np.cos(ang), c0[1] + r * np.sin(ang)))
    pts = np.array(pts)
    A = np.c_[2 * pts[:, 0], 2 * pts[:, 1], np.ones(len(pts))]
    cx, cy, k = np.linalg.lstsq(A, (pts ** 2).sum(1), rcond=None)[0]
    R = float(np.sqrt(k + cx ** 2 + cy ** 2))
print('centre %.1f,%.1f radius %.1f' % (cx, cy, R))

# the patch to paint over: a thickening capsule from the hot spot through the rim, plus a round patch on the hot spot
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
d = (beam - hot); L = np.linalg.norm(d); u = d / L
end = hot + u * (L + R * 0.5)                               # run it past the rim
seg = end - hot; sl = float(np.dot(seg, seg))
t = np.clip(((xx - hot[0]) * seg[0] + (yy - hot[1]) * seg[1]) / sl, 0, 1)
dist = np.hypot(xx - (hot[0] + t * seg[0]), yy - (hot[1] + t * seg[1]))
half = a.w0 + (a.w1 - a.w0) * t
patch = np.clip((half - dist) / a.feather, 0, 1)
patch = np.maximum(patch, np.clip((a.hot_r - np.hypot(xx - hot[0], yy - hot[1])) / a.feather, 0, 1))
patch = cv2.GaussianBlur(patch, (0, 0), a.feather / 3)

# fill: the opposite side of the disc, turned 180 degrees about the centre
rot = cv2.remap(im, (2 * cx - xx).astype(np.float32), (2 * cy - yy).astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
src_overlap = cv2.remap(patch, (2 * cx - xx).astype(np.float32), (2 * cy - yy).astype(np.float32), cv2.INTER_LINEAR)
if a.debug:
    dbg = im.copy(); dbg[..., 2] = np.clip(dbg[..., 2] + 120 * patch, 0, 255).astype(np.uint8); dbg[..., 0] = np.clip(dbg[..., 0] + 120 * src_overlap, 0, 255).astype(np.uint8)
    cv2.circle(dbg, (int(cx), int(cy)), int(R), (0, 255, 0), 3)
    cv2.imwrite(a.debug, cv2.resize(dbg, None, fx=0.5, fy=0.5))
    print('overlap of source with patch (should be small): %.4f' % float((patch * src_overlap).sum() / patch.sum()))
filled = (im.astype(np.float32) * (1 - patch[..., None]) + rot.astype(np.float32) * patch[..., None])

# cut everything outside the rim to transparent, with a soft edge
rr = np.hypot(xx - cx, yy - cy)
alpha = np.clip((a.trim * R - rr) / 6.0 + 0.5, 0, 1)
out = np.dstack([np.clip(filled, 0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)])
x0, y0, x1, y1 = [int(v) for v in (cx - R * 1.02, cy - R * 1.02, cx + R * 1.02, cy + R * 1.02)]
cv2.imwrite('/tmp/_sun.png', out)
from PIL import Image
Image.open('/tmp/_sun.png').save(a.out, 'WEBP', quality=94, method=6, alpha_quality=100)
info = {'cx': round(cx / W, 4), 'cy': round(cy / H, 4), 'r': round(R * a.trim / H, 4), 'w': W, 'h': H}
print(json.dumps(info))
