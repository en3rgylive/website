#!/usr/bin/env python3
"""Pack footage into the frame files that the page scrubs with the scroll bar.

Input is one video that is cut at the scene changes, a folder of clips (01.mp4, 02.mp4 ...), or with --frames a
folder of numbered still frames (for footage that was cleaned or upscaled frame by frame).

    python3 tools/pack_clips.py movie.mp4 docs/clips --auto-cuts          # find the cuts by itself
    python3 tools/pack_clips.py movie.mp4 docs/clips --cuts 2.5,4.67      # or give the cut times in seconds
    python3 tools/pack_clips.py clips_src docs/clips                      # a folder of clips, one per scene

Needs ffmpeg and Pillow. Output, which is what the page loads:

    docs/clips/manifest.json         frame counts, sizes, and the scroll, zoom and transition settings per chapter
    docs/clips/d/01/0001.avif ...    desktop frames (one file per frame; AVIF by default, WebP with --dfmt webp)
    docs/clips/m/01/0001.avif ...    phone frames: the middle of the picture, cropped, at full phone-screen resolution
    docs/clips/p/01/0001.webp ...    tiny preview frames (every 2nd frame), loaded first so scrubbing is smooth from the start

Every source frame is kept by default, so scrubbing is as smooth as the footage. Use --fps to thin it out.
Each scene is one chapter of the film. For each chapter the page holds the first frame for a short scroll distance
(--hold) so the caption can be read, and a hard cut between scenes becomes a push through light (--seam, --push, --flash).
A chapter can start zoomed out (--zoom 1=0.72:1.0:0.3 means chapter 1 starts at 72% and reaches 100% by 30% of its footage).
"""
import argparse, glob, json, math, os, re, shutil, subprocess, sys, tempfile
from concurrent.futures import ProcessPoolExecutor
from PIL import Image, ImageChops, ImageStat


def run(cmd, both=False):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode:
        sys.exit('command failed: ' + ' '.join(cmd) + '\n' + p.stderr[-800:])
    return p.stdout + p.stderr if both else p.stdout


def probe(path):
    j = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,duration',
                        '-show_entries', 'format=duration', '-of', 'json', path]))
    s = j['streams'][0]
    num, den = [float(x) for x in s['r_frame_rate'].split('/')]
    dur = float(s.get('duration') or j['format']['duration'])
    return int(s['width']), int(s['height']), num / den, dur


def decode(path, tmp, width):
    os.makedirs(tmp, exist_ok=True)
    run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-an', '-vf', 'scale=%d:-2:flags=lanczos' % width, '-vsync', '0', os.path.join(tmp, '%05d.png')])
    return sorted(glob.glob(os.path.join(tmp, '*.png')))


def auto_cuts(path, fps, threshold):
    """Frame indices where a new scene starts, found with ffmpeg's scene score."""
    out = run(['ffmpeg', '-v', 'info', '-i', path, '-an', '-vf', "select='gt(scene,%s)',showinfo" % threshold, '-f', 'null', '-'], both=True)
    frames = sorted({round(float(m) * fps) for m in re.findall(r'pts_time:([\d.]+)', out)})
    kept = []
    for f in frames:                                  # a cut is often seen on two neighbouring frames; keep the first
        if f > 0 and (not kept or f - kept[-1] > 3):
            kept.append(f)
    return kept


def write_frame(job):
    src, dst, fw, fh, q, fmt, crop, speed = job
    im = Image.open(src).convert('RGB')
    if crop:                                          # keep only the middle band of the picture (phone sets)
        w = im.width
        im = im.crop((round(crop[0] * w), 0, round(crop[1] * w), im.height))
    if im.size != (fw, fh):
        im = im.resize((fw, fh), Image.LANCZOS)
    if fmt == 'avif':
        im.save(dst, 'AVIF', quality=q, speed=speed)
    else:
        im.save(dst, 'WEBP', quality=q, method=5)
    return os.path.getsize(dst)


def small(path, w=192):
    im = Image.open(path).convert('RGB')
    return im.resize((w, max(1, round(w * im.height / im.width))), Image.BILINEAR)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src', help='a video file, a folder with 01.mp4, 02.mp4 ..., or (with --frames) a folder of numbered frame images')
    ap.add_argument('--frames', action='store_true', help='src is a folder of frame images in order (png, jpg or webp)')
    ap.add_argument('--cut-frames', default='', help='with --frames: frame numbers where a new chapter starts, e.g. 60,112,168')
    ap.add_argument('--src-fps', type=float, default=23.976, help='with --frames: frame rate of the footage (default 23.976)')
    ap.add_argument('out', help='output folder, normally docs/clips/')
    ap.add_argument('--cuts', default='', help='cut times in seconds for a single video, e.g. 2.5,4.67,7.0')
    ap.add_argument('--auto-cuts', nargs='?', const=0.22, type=float, default=None, help='find the cuts automatically (optional scene threshold, default 0.22)')
    ap.add_argument('--fps', type=float, default=0, help='frames kept per second; 0 keeps every frame (default)')
    ap.add_argument('--dw', type=int, default=2560, help='desktop frame width (default 2560)')
    ap.add_argument('--mh', type=int, default=1080, help='phone frame height; the width follows from --mcrop (default 1080)')
    ap.add_argument('--mcrop', default='0.15:0.85', help='the band of the picture kept for phones, as start:end of the width (default 0.15:0.85)')
    ap.add_argument('--dfmt', default='avif', choices=['avif', 'webp'], help='format of the desktop and phone frames (default avif)')
    ap.add_argument('--speed', type=int, default=6, help='AVIF encoder speed, 0 slowest to 10 fastest (default 6)')
    ap.add_argument('--pw', type=int, default=560, help='preview frame width (default 560)')
    ap.add_argument('--pstep', type=int, default=2, help='keep every Nth frame in the preview set (default 2)')
    ap.add_argument('--q', type=int, default=52, help='desktop quality (AVIF default 52; use about 80 for WebP)')
    ap.add_argument('--mq', type=int, default=52, help='phone quality (AVIF default 52; use about 76 for WebP)')
    ap.add_argument('--pq', type=int, default=50, help='WebP quality, preview (default 50)')
    ap.add_argument('--hold', default='0.2,0.08', help='share of each chapter that holds its first and last frame (default 0.2,0.08)')
    ap.add_argument('--seam', type=float, default=0.14, help='half-width of the push through light over a hard cut, in chapters (default 0.14)')
    ap.add_argument('--push', type=float, default=0.12, help='how far the picture pushes in through a cut, as a fraction (default 0.12)')
    ap.add_argument('--flash', type=float, default=0.6, help='strength of the warm bloom at a hard cut, 0 to 1 (default 0.5)')
    ap.add_argument('--drift', type=float, default=0.05, help='slow zoom-in across every chapter so the picture never looks frozen (default 0.05)')
    ap.add_argument('--zoom', default='', help='chapters that start zoomed out, e.g. 1=0.72:1.0:0.3,4=0.9:1:0.4 (chapter=start:end:footage share)')
    ap.add_argument('--kx', default='', help='phone crop focus per chapter as start:end, comma separated, e.g. 0.56:0.5,0.5:0.5')
    ap.add_argument('--weight-power', type=float, default=0.55, help='scroll length of a chapter grows with duration to this power (default 0.55)')
    a = ap.parse_args()

    hold = [float(x) for x in a.hold.split(',')]
    zooms = {}
    for part in filter(None, a.zoom.split(',')):
        k, v = part.split('=')
        z0, z1, zt = [float(x) for x in v.split(':')]
        zooms[int(k) - 1] = [z0, z1, zt]

    tmp_root = tempfile.mkdtemp(prefix='pack_')
    chapters = []
    try:
        if a.frames:
            allf = sorted(f for f in glob.glob(os.path.join(a.src, '*')) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')))
            if not allf:
                sys.exit('no frames found in ' + a.src)
            src_fps = a.src_fps
            if a.cut_frames:
                cut_frames = [int(x) for x in a.cut_frames.split(',') if x.strip()]
            elif a.cuts:
                cut_frames = [round(float(t) * src_fps) for t in a.cuts.split(',') if t.strip()]
            else:
                cut_frames = []
            edges = [0] + [c for c in cut_frames if 0 < c < len(allf)] + [len(allf)]
            for i in range(len(edges) - 1):
                chapters.append(allf[edges[i]:edges[i + 1]])
            print('frames:', len(allf), 'cuts at', edges[1:-1])
        elif os.path.isdir(a.src):
            files = sorted(f for f in glob.glob(os.path.join(a.src, '*')) if f.lower().endswith(('.mp4', '.mov', '.webm', '.mkv')))
            if not files:
                sys.exit('no clips found in ' + a.src)
            src_fps = None
            for ci, f in enumerate(files):
                chapters.append(decode(f, os.path.join(tmp_root, 'c%02d' % ci), a.dw))
                src_fps = src_fps or probe(f)[2]
        else:
            w, h, src_fps, dur = probe(a.src)
            frames = decode(a.src, os.path.join(tmp_root, 'all'), a.dw)
            if a.cuts:
                cut_frames = [round(float(t) * src_fps) for t in a.cuts.split(',') if t.strip()]
            elif a.auto_cuts is not None:
                cut_frames = auto_cuts(a.src, src_fps, a.auto_cuts)
            else:
                cut_frames = []
            cut_frames = [c for c in cut_frames if 0 < c < len(frames)]
            edges = [0] + cut_frames + [len(frames)]
            for i in range(len(edges) - 1):
                chapters.append(frames[edges[i]:edges[i + 1]])
            print('cuts at frames', cut_frames, '(%s s)' % ', '.join('%.2f' % (c / src_fps) for c in cut_frames))
        if a.fps and src_fps:
            step = src_fps / a.fps
            chapters = [[c[min(len(c) - 1, round(i * step))] for i in range(max(2, round(len(c) / step)))] for c in chapters]

        K = len(chapters)
        kx = []
        for part in filter(None, a.kx.split(',')):
            s, e = part.split(':')
            kx.append([float(s), float(e)])
        while len(kx) < K:
            kx.append([0.5, 0.5])

        os.makedirs(a.out, exist_ok=True)
        for sub in ('d', 'm', 'p'):
            shutil.rmtree(os.path.join(a.out, sub), ignore_errors=True)
        for stale in ('poster.webp',):
            p = os.path.join(a.out, stale)
            if os.path.exists(p):
                os.remove(p)

        sw, sh = Image.open(chapters[0][0]).size
        dw = a.dw if a.dw < sw else sw
        dh = round(sh * dw / sw) // 2 * 2
        c0, c1 = [float(x) for x in a.mcrop.split(':')]
        mh = a.mh // 2 * 2
        mw = round((c1 - c0) * sw * mh / sh) // 2 * 2
        sizes = {'d': (dw, dh), 'm': (mw, mh), 'p': (a.pw, round(dh * a.pw / dw) // 2 * 2)}
        qual = {'d': a.q, 'm': a.mq, 'p': a.pq}
        fmts = {'d': a.dfmt, 'm': a.dfmt, 'p': 'webp'}
        durs = [len(c) / (a.fps or src_fps or 24.0) for c in chapters]
        mean = sum(durs) / K
        weights = [round((d / mean) ** a.weight_power, 3) for d in durs]

        manifest = {'version': 4, 'fps': round(a.fps or src_fps or 24.0, 3), 'drift': a.drift, 'pstep': a.pstep,
                    'd': dict(zip('wh', sizes['d']), ext=fmts['d']), 'm': dict(zip('wh', sizes['m']), ext=fmts['m'], crop=[c0, c1]),
                    'p': dict(zip('wh', sizes['p']), ext='webp'), 'clips': [], 'cuts': []}
        pool = ProcessPoolExecutor(max_workers=max(1, os.cpu_count() or 2))
        total = {'d': 0, 'm': 0, 'p': 0}
        for ci, frames in enumerate(chapters):
            cid = '%02d' % (ci + 1)
            n = len(frames)
            jobs = []
            for sub in ('d', 'm', 'p'):
                d = os.path.join(a.out, sub, cid)
                os.makedirs(d, exist_ok=True)
                fw, fh = sizes[sub]
                keep = (lambda k: k % a.pstep == 0 or k == n - 1) if sub == 'p' else (lambda k: True)
                crop = (c0, c1) if sub == 'm' else None
                jobs += [(src, os.path.join(d, '%04d.%s' % (k + 1, fmts[sub])), fw, fh, qual[sub], fmts[sub], crop, a.speed) for k, src in enumerate(frames) if keep(k)]
            out = list(pool.map(write_frame, jobs, chunksize=4))
            npv = sum(1 for k in range(n) if k % a.pstep == 0 or k == n - 1)
            ds, ms, ps = sum(out[:n]), sum(out[n:2 * n]), sum(out[2 * n:])
            total['d'] += ds; total['m'] += ms; total['p'] += ps
            clip = {'id': cid, 'n': n, 'dur': round(durs[ci], 3), 'w': weights[ci], 'hold': hold, 'seam': 0, 'flash': 0, 'push': a.push,
                    'kx': kx[ci], 'dir': 'd/%s/' % cid, 'mdir': 'm/%s/' % cid, 'pdir': 'p/%s/' % cid}
            if ci in zooms:
                clip['zoom'] = zooms[ci][:2]; clip['zoomT'] = zooms[ci][2]
            manifest['clips'].append(clip)
            print('%s  %3d frames  desktop %5.1f MB  phone %5.1f MB  preview %4.1f MB  (%.1fs, weight %.2f)' % (cid, n, ds / 1e6, ms / 1e6, ps / 1e6, durs[ci], weights[ci]))
        pool.shutdown()

        # how big is the jump from the last frame of one chapter to the first of the next; big jumps are hard cuts
        for i in range(K - 1):
            diff = ImageStat.Stat(ImageChops.difference(small(chapters[i][-1]), small(chapters[i + 1][0]))).mean
            v = round(sum(diff) / 3, 1)
            manifest['cuts'].append(v)
            cut = v > 9
            manifest['clips'][i + 1]['seam'] = a.seam if cut else 0
            manifest['clips'][i + 1]['flash'] = a.flash if cut else 0
            print('join %02d -> %02d: jump %.1f  %s' % (i + 1, i + 2, v, 'hard cut: push through light' if cut else 'continuous'))
        with open(os.path.join(a.out, 'manifest.json'), 'w') as fp:
            json.dump(manifest, fp, indent=1)
        print('desktop %.1f MB, phone %.1f MB, preview %.1f MB, %d chapters -> %s' % (total['d'] / 1e6, total['m'] / 1e6, total['p'] / 1e6, K, a.out))
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == '__main__':
    main()
