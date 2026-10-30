#!/usr/bin/env python3
"""Export the film's scenes as separate 1080p clips, for an AI "reframe" tool that turns them into 9:16 (see tools/PHONE_FILM.md).

    python3 tools/export_scenes.py docs/clips scenes

Reads docs/clips/manifest.json and the desktop frames next to it, and writes scenes/01.mp4 ... 06.mp4 (H.264, 1920 x 1080,
no audio). Needs ffmpeg and Pillow with AVIF support (the packer uses the same).
"""
import json, os, subprocess, sys
from PIL import Image


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    m = json.load(open(os.path.join(src, 'manifest.json')))
    ext = m['d'].get('ext', 'webp')
    os.makedirs(out, exist_ok=True)
    for c in m['clips']:
        d = os.path.join(src, c['dir'])
        dst = os.path.join(out, c['id'] + '.mp4')
        p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1920x1080', '-r', str(m['fps']), '-i', '-',
                              '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', dst],
                             stdin=subprocess.PIPE)
        for k in range(c['n']):
            im = Image.open(os.path.join(d, '%04d.%s' % (k + 1, ext))).convert('RGB').resize((1920, 1080), Image.LANCZOS)
            p.stdin.write(im.tobytes())
        p.stdin.close()
        if p.wait():
            sys.exit('ffmpeg failed on chapter ' + c['id'])
        print(dst, c['n'], 'frames')


if __name__ == '__main__':
    main()
