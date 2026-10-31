#!/usr/bin/env python3
"""Make the landing sun from a first frame in which the sun is only partly in the picture (the 9:16 phone film).

make_intro.py needs the whole sun inside the frame. In the 9:16 film the sun is cut off by the right edge of the picture, so a
zoomed-out landing screen needs the rest of the sun to be built. This tool:
  1. fits a circle to the visible rim (the part of the rim that the ray does not cross),
  2. paints out the ray (a thickening capsule from its hot spot to the left edge) and everything it lights up,
  3. fills the ray patch and everything outside the picture by turning the sun about its centre: every missing pixel is copied
     from another angle at the same distance from the centre, so the limb darkening, the rim and the glow stay continuous,
  4. fades everything beyond the corona to transparent,
and writes sun.webp, a square picture around the sun that is bigger than the frame (the player draws it with the same
transform as the frame), plus the numbers for the "intro" block of docs/clips-m/manifest.json.

    python3 tools/make_intro_partial.py first_frame.png docs/clips-m/sun.webp --hot 910,1010 --beam 410,1170

--hot is the hot spot of the ray on the disc and --beam a point on the ray left of the disc, both in pixels of the frame.
"""
import argparse, json
import cv2, numpy as np

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('frame'); ap.add_argument('out')
ap.add_argument('--hot', required=True, help='x,y of the ray hot spot')
ap.add_argument('--beam', required=True, help='x,y of a point on the ray, left of the sun')
ap.add_argument('--w0', type=float, default=125, help='half-width of the ray patch at the hot spot')
ap.add_argument('--w1', type=float, default=330, help='half-width of the ray patch at the left edge')
ap.add_argument('--hot-r', type=float, default=170, help='radius of the round patch on the hot spot')
ap.add_argument('--feather', type=float, default=80)
ap.add_argument('--side', type=int, default=2200, help='side of the square picture, in frame pixels (default 2200)')
ap.add_argument('--px', type=int, default=1280, help='size of the written picture in pixels (default 1280)')
ap.add_argument('--keep', type=float, default=1.08, help='corona kept up to this multiple of the rim radius (default 1.08)')
ap.add_argument('--fade', type=float, default=0.26, help='how far beyond that the corona fades out, in rim radii (default 0.26)')
ap.add_argument('--debug', default='', help='write a picture of the patch here')
a = ap.parse_args()

im = cv2.imread(a.frame)
H, W = im.shape[:2]
g = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 3)
hot = np.array([float(v) for v in a.hot.split(',')]); beam = np.array([float(v) for v in a.beam.split(',')])
u = (beam - hot) / np.linalg.norm(beam - hot)                 # the way the ray leaves the sun

# 1. the circle: rim points on the rays from a rough centre, away from the ray's own glow
c = np.array([W * 0.93, H * 0.49])
ang_ray = np.degrees(np.arctan2(u[1], u[0])) % 360
degs = [d for d in range(90, 271, 3) if abs(((d - ang_ray + 180) % 360) - 180) > 42]
for _ in range(4):
    P = []
    for deg in degs:
        t = np.deg2rad(deg); rs = np.arange(450, 950)
        xs = (c[0] + rs * np.cos(t)).astype(int); ys = (c[1] + rs * np.sin(t)).astype(int)
        ok = (xs >= 0) & (xs < W - 4) & (ys >= 0) & (ys < H)
        if ok.sum() < 60: continue
        prof = g[ys[ok], xs[ok]]; rr = rs[ok]; pk = int(np.argmax(prof)); b = np.where(prof[pk:] < 0.45 * prof[pk])[0]
        if len(b): P.append((c[0] + rr[pk + b[0]] * np.cos(t), c[1] + rr[pk + b[0]] * np.sin(t)))
    P = np.array(P)
    A = np.c_[2 * P[:, 0], 2 * P[:, 1], np.ones(len(P))]
    cx, cy, k = np.linalg.lstsq(A, (P ** 2).sum(1), rcond=None)[0]
    c = np.array([cx, cy]); R = float(np.sqrt(k + cx ** 2 + cy ** 2))
print('centre %.1f,%.1f radius %.1f (from %d rim points)' % (cx, cy, R, len(P)))
R_cut = 0.975 * R                                             # the bright rim ends a little inside the fitted circle

# 2. where the ray is, in frame pixels: a thickening capsule from the hot spot out through the left edge, plus a round patch
S = a.side; px = a.px
x0 = cx - S / 2; y0 = cy - S / 2                              # the square picture is centred on the sun
sc = px / S
gx, gy = np.meshgrid(np.arange(px, dtype=np.float32), np.arange(px, dtype=np.float32))
fx = x0 + (gx + 0.5) / sc; fy = y0 + (gy + 0.5) / sc          # frame-pixel position of every output pixel
L = float(hot[0] / max(-u[0], 1e-3)) + 200                    # long enough to leave the frame
seg = u * L; sl = float(np.dot(seg, seg))

def ray_mask(X, Y):
    t = np.clip(((X - hot[0]) * seg[0] + (Y - hot[1]) * seg[1]) / sl, 0, 1)
    dist = np.hypot(X - (hot[0] + t * seg[0]), Y - (hot[1] + t * seg[1]))
    half = a.w0 + (a.w1 - a.w0) * np.clip(t * L / max(hot[0] / max(-u[0], 1e-3), 1), 0, 1)
    m = np.clip((half - dist) / a.feather, 0, 1)
    return np.maximum(m, np.clip((a.hot_r - np.hypot(X - hot[0], Y - hot[1])) / a.feather, 0, 1))

# 3. which frame pixels can be trusted: inside the picture (a margin from its edge) and clear of the ray
def valid_at(X, Y):
    inside = ((X >= 6) & (X <= W - 8) & (Y >= 6) & (Y <= H - 8)).astype(np.float32)
    return inside * (1 - (ray_mask(X, Y) > 0.0015)).astype(np.float32)

base = cv2.remap(im, fx.astype(np.float32), fy.astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
rel_x, rel_y = fx - cx, fy - cy
er = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(2 * 18 * sc) | 1, int(2 * 18 * sc) | 1))
def soft(v):                                                  # a trusted area, pulled in from its edge and feathered, so pieces melt into each other
    return cv2.GaussianBlur(cv2.erode(v.astype(np.float32), er), (0, 0), 30 * sc)
out = np.zeros_like(base); wsum = np.zeros(base.shape[:2], np.float32)
def add(src, w):
    global wsum
    w = np.minimum(w, np.clip(1 - wsum, 0, 1)); out[...] += src * w[..., None]; wsum += w
add(base, soft(valid_at(fx, fy)))
cands = [(0, 0)]                                              # translation fallbacks come last (for the middle of the disc, which every turn maps back onto the ray)
for deg in [180, 60, -60, 120, -120, 90, -90, 30, -30, 150, -150, 45, -45, 135, -135, 15, -15]:
    th = np.deg2rad(deg); ct, st = np.cos(th), np.sin(th)
    sx = cx + rel_x * ct - rel_y * st; sy = cy + rel_x * st + rel_y * ct      # the same distance from the centre, another angle
    add(cv2.remap(im, sx.astype(np.float32), sy.astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE).astype(np.float32), soft(valid_at(sx, sy)))
for dx, dy in [(-300, -330), (-330, 300), (-80, -420), (330, -300), (-420, 80), (0, -480), (-480, -100)]:
    sx = fx + dx; sy = fy + dy
    add(cv2.remap(im, sx.astype(np.float32), sy.astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE).astype(np.float32), soft(valid_at(sx, sy)))
rest = np.clip(1 - wsum, 0, 1)                                # whatever is still open (should be almost nothing): the blurred surroundings
if rest.max() > 0.01:
    blur = cv2.GaussianBlur(out / np.maximum(wsum, 1e-3)[..., None], (0, 0), 20 * sc)
    out += blur * rest[..., None]; wsum += rest
out = out / np.maximum(wsum, 1e-3)[..., None]

# 4. fade the far corona out, so the picture melts into the page background
rr = np.hypot(rel_x, rel_y) / R
alpha = 1 - np.clip((rr - a.keep) / a.fade, 0, 1); alpha = alpha * alpha * (3 - 2 * alpha)
res = np.dstack([np.clip(out, 0, 255).astype(np.uint8), np.clip(alpha * 255, 0, 255).astype(np.uint8)])
cv2.imwrite(a.out, res, [cv2.IMWRITE_WEBP_QUALITY, 88])
if a.debug:
    d = im.copy(); m = ray_mask(*np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32)))
    d[..., 2] = np.clip(d[..., 2] + 130 * m, 0, 255).astype(np.uint8); cv2.circle(d, (int(cx), int(cy)), int(R), (0, 255, 0), 4)
    cv2.imwrite(a.debug, cv2.resize(d, None, fx=0.5, fy=0.5))

intro = {'img': 'sun.webp', 'cx': round(cx / W, 4), 'cy': round(cy / H, 4), 'r': round(R / W, 4), 'w': W, 'h': H,
         'box': [round(x0 / W, 4), round(y0 / H, 4), round(S / W, 4), round(S / H, 4)]}
print(json.dumps(intro))
