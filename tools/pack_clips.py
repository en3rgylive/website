#!/usr/bin/env python3
"""Pack footage into the frame sheets that the page scrubs with the scroll bar.

Input is either one video that is cut at the scene changes, or a folder of clips (01.mp4, 02.mp4 ...).

    python3 tools/pack_clips.py movie.mp4 clips --auto-cuts          # find the cuts by itself
    python3 tools/pack_clips.py movie.mp4 clips --cuts 2.502,4.671   # or give the cut times in seconds
    python3 tools/pack_clips.py clips_src clips                      # a folder of clips, one per scene

Needs ffmpeg and Pillow. Output, which is what the page loads:

    clips/manifest.json         frame counts, sizes, scroll weight and settings per scene, cut report
    clips/d/01/0001.webp ...    desktop sheets: each file holds a grid of consecutive frames (2 x 2 by default)
    clips/m/01/0001.webp ...    phone sheets, smaller

Every source frame is kept by default, so scrubbing is as smooth as the footage. Use --fps to thin it out.
Each scene is one chapter of the film. For each chapter the page freezes the first and last frame for a short
scroll distance (--hold) so the caption can be read, and dissolves with a flash across a hard cut (--seam, --flash).
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
    # a cut is often seen on two neighbouring frames; keep the first
    kept = []
    for f in frames:
        if f > 0 and (not kept or f - kept[-1] > 3):
            kept.append(f)
    return kept


def build_sheet(job):
    srcs, dst, fw, fh, cols, rows, q = job
    sheet = Image.new('RGB', (fw * cols, fh * rows), (3, 4, 10))
    for k in range(cols * rows):
        im = Image.open(srcs[min(k, len(srcs) - 1)]).convert('RGB')     # the last sheet repeats its final frame
        if im.size != (fw, fh):
            im = im.resize((fw, fh), Image.LANCZOS)
        sheet.paste(im, ((k % cols) * fw, (k // cols) * fh))
    sheet.save(dst, 'WEBP', quality=q, method=5)
    return os.path.getsize(dst)


def small(path, w=192):
    im = Image.open(path).convert('RGB')
    return im.resize((w, max(1, round(w * im.height / im.width))), Image.BILINEAR)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src', help='a video file, or a folder with 01.mp4, 02.mp4 ...')
    ap.add_argument('out', help='output folder, normally clips/')
    ap.add_argument('--cuts', default='', help='cut times in seconds for a single video, e.g. 2.5,4.67,7.0')
    ap.add_argument('--auto-cuts', nargs='?', const=0.22, type=float, default=None, help='find the cuts automatically (optional scene threshold, default 0.22)')
    ap.add_argument('--grid', default='2x2', help='frames per sheet, columns x rows (default 2x2)')
    ap.add_argument('--fps', type=float, default=0, help='frames kept per second; 0 keeps every frame (default)')
    ap.add_argument('--dw', type=int, default=1280, help='desktop frame width (default 1280)')
    ap.add_argument('--mw', type=int, default=1024, help='phone frame width (default 1024)')
    ap.add_argument('--q', type=int, default=72, help='WebP quality, desktop (default 72)')
    ap.add_argument('--mq', type=int, default=66, help='WebP quality, phone (default 66)')
    ap.add_argument('--hold', default='0.12,0.06', help='share of each chapter that holds its first and last frame (default 0.12,0.06)')
    ap.add_argument('--seam', type=float, default=0.06, help='half-width of the dissolve over a hard cut, in chapters (default 0.06)')
    ap.add_argument('--flash', type=float, default=0.3, help='strength of the warm flash over a hard cut, 0 to 1 (default 0.3)')
    ap.add_argument('--kx', default='', help='phone crop focus per chapter as start:end, comma separated, e.g. 0.56:0.5,0.5:0.5')
    ap.add_argument('--weight-power', type=float, default=0.55, help='scroll length of a chapter grows with duration to this power (default 0.55)')
    a = ap.parse_args()

    cols, rows = [int(x) for x in a.grid.lower().split('x')]
    per = cols * rows
    hold = [float(x) for x in a.hold.split(',')]

    # 1. frames for every chapter
    tmp_root = tempfile.mkdtemp(prefix='pack_')
    chapters = []                                   # each: list of frame png paths
    try:
        if os.path.isdir(a.src):
            files = sorted(f for f in glob.glob(os.path.join(a.src, '*')) if f.lower().endswith(('.mp4', '.mov', '.webm', '.mkv')))
            if not files:
                sys.exit('no clips found in ' + a.src)
            src_fps = None
            for ci, f in enumerate(files):
                frames = decode(f, os.path.join(tmp_root, 'c%02d' % ci), a.dw)
                chapters.append(frames)
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
        if a.kx:
            for part in a.kx.split(','):
                s, e = part.split(':')
                kx.append([float(s), float(e)])
        while len(kx) < K:
            kx.append([0.5, 0.5])

        os.makedirs(a.out, exist_ok=True)
        for sub in ('d', 'm'):
            shutil.rmtree(os.path.join(a.out, sub), ignore_errors=True)
        for stale in ('poster.webp',):
            p = os.path.join(a.out, stale)
            if os.path.exists(p):
                os.remove(p)

        im0 = Image.open(chapters[0][0])
        dw, dh = im0.size
        dh -= dh % 2
        mw = a.mw
        mh = round(dh * mw / dw); mh -= mh % 2
        durs = [len(c) / (a.fps or src_fps or 24.0) for c in chapters]
        mean = sum(durs) / K
        weights = [round((d / mean) ** a.weight_power, 3) for d in durs]

        manifest = {'version': 2, 'ext': 'webp', 'fps': round(a.fps or src_fps or 24.0, 3), 'grid': {'cols': cols, 'rows': rows},
                    'd': {'w': dw, 'h': dh}, 'm': {'w': mw, 'h': mh}, 'clips': [], 'cuts': []}
        pool = ProcessPoolExecutor(max_workers=max(1, os.cpu_count() or 2))
        total = {'d': 0, 'm': 0}
        for ci, frames in enumerate(chapters):
            cid = '%02d' % (ci + 1)
            n = len(frames)
            units = math.ceil(n / per)
            jobs = []
            for sub, fw, fh, q in (('d', dw, dh, a.q), ('m', mw, mh, a.mq)):
                d = os.path.join(a.out, sub, cid)
                os.makedirs(d, exist_ok=True)
                for u in range(units):
                    jobs.append((frames[u * per:(u + 1) * per], os.path.join(d, '%04d.webp' % (u + 1)), fw, fh, cols, rows, q))
            sizes = list(pool.map(build_sheet, jobs, chunksize=2))
            ds, ms = sum(sizes[:units]), sum(sizes[units:])
            total['d'] += ds; total['m'] += ms
            manifest['clips'].append({'id': cid, 'n': n, 'units': units, 'dur': round(durs[ci], 3), 'w': weights[ci], 'hold': hold,
                                      'seam': 0, 'flash': 0, 'kx': kx[ci], 'dir': 'd/%s/' % cid, 'mdir': 'm/%s/' % cid})
            print('%s  %3d frames  %2d sheets  desktop %5.1f MB  phone %5.1f MB  (%.1fs, weight %.2f)' % (cid, n, units, ds / 1e6, ms / 1e6, durs[ci], weights[ci]))
        pool.shutdown()

        # how big is the jump from the last frame of one chapter to the first of the next; big jumps are hard cuts
        for i in range(K - 1):
            diff = ImageStat.Stat(ImageChops.difference(small(chapters[i][-1]), small(chapters[i + 1][0]))).mean
            v = round(sum(diff) / 3, 1)
            manifest['cuts'].append(v)
            cut = v > 9
            manifest['clips'][i + 1]['seam'] = a.seam if cut else 0
            manifest['clips'][i + 1]['flash'] = a.flash if cut else 0
            print('join %02d -> %02d: jump %.1f  %s' % (i + 1, i + 2, v, 'hard cut: dissolve and flash' if cut else 'continuous'))
        with open(os.path.join(a.out, 'manifest.json'), 'w') as fp:
            json.dump(manifest, fp, indent=1)
        print('desktop %.1f MB, phone %.1f MB, %d chapters -> %s' % (total['d'] / 1e6, total['m'] / 1e6, K, a.out))
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == '__main__':
    main()
