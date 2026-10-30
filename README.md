# EN3RGY website

Source for https://en3rgy.live, a one-page rooftop-solar site. Scrolling or swiping plays a short film, frame by frame, forwards and backwards: one ray of light travels from the sun to a lit-up home, in six chapters (the star, the journey, the roof, the module, the inverter, the whole house). The landing screen is only a small sun; the ray, the stars and the corona appear as you start to scroll. After the film: a statement, a gallery, a 3-step process, a bill estimate and an enquiry form.

## Publishing

The site is the `docs/` folder, served by GitHub Pages.

1. In the repository: **Settings > Pages > Build and deployment**. Source: **Deploy from a branch**. Branch: **main**, folder: **/docs**. Save.
2. The custom domain comes from `docs/CNAME` (`en3rgy.live`). Under **Custom domain** confirm it, and tick **Enforce HTTPS** once GitHub offers it (a `.live` domain only loads over HTTPS).
3. DNS, at the company where the domain was bought:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `en3rgylive.github.io` |

Optional IPv6 records: AAAA `@` to `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`. DNS changes can take from a few minutes to a few hours. GitHub's page "Managing a custom domain for your GitHub Pages site" has the current values.

## Run it locally

```bash
cd docs
python3 -m http.server 8000
```

Open http://localhost:8000.

## Files

```
docs/                 the website (this folder is what gets published)
  index.html          page markup and copy
  css/styles.css      design tokens (top of file) and all styles
  js/reel.js          the film player: smooth frame scrubbing, holds, push-through-light cuts, captions, phone crop
  js/ui.js            header, bill estimate, enquiry form
  clips/              the film, one file per frame (d desktop, m phone, p preview), sun.webp (the landing sun) and manifest.json
  plates/             still images for the gallery
  CNAME, 404.html, favicon.svg, og.jpg
tools/                pack_clips.py, make_intro.py, keyframes.py, shots.py, PROMPTS.md, shots.json
keyframes/            16:9 start and end frames, for remaking the footage
```

## Changing things

- **Enquiries:** the form sends an email to the address in `docs/js/ui.js` (`EMAIL`). Set `WHATSAPP` there (country code and number, digits only) and it sends to WhatsApp instead.
- **Copy, brand, colours:** `docs/index.html`; colours and fonts are the tokens at the top of `docs/css/styles.css`.
- **Real figures:** the page deliberately has no company statistics, phone number or address, because none were supplied. Add them where you want them in `docs/index.html`.
- **Footage:** `python3 tools/pack_clips.py movie.mp4 docs/clips --auto-cuts --zoom 1=0.78:1.0:0.3` cuts a video at its scene changes and writes the frames and manifest the page loads (one file per frame for desktop, phone and a small preview set). It needs `ffmpeg` and Pillow. If the video has a different number of scenes, update the `.cap` blocks (and the `.static` list under them) in `docs/index.html`. Options are listed at the top of `tools/pack_clips.py`. The main ones: `--zoom` (start a chapter zoomed out, for example the sun), `--seam`, `--push` and `--flash` (the push through light at a cut), `--hold` (how long a chapter holds its first frame), `--drift` (slow zoom across each chapter), `--kx` (phone crop focus).
- **Landing sun:** `tools/make_intro.py frame.png docs/clips/sun.webp --hot X,Y --beam X,Y` takes the first frame, paints out the ray and its hot spot, cuts the sun out along its rim and prints the numbers (`cx`, `cy`, `r`, `w`, `h`) for the `intro` block in `docs/clips/manifest.json`. That block also sets how much scroll the reveal takes (`to`, a share of the first chapter), how small the sun starts (`zoom`) and where it sits on the screen (`target`, `targetP` for phones). Needs OpenCV and NumPy. Chapter 1 should hold its first frame (`hold` in the manifest) for as long as the reveal lasts. Delete the `intro` block to go back to starting on the full first frame.
- **How the player stays smooth:** small preview frames load first, so scrubbing works at once. Full frames are fetched in order of distance from the playhead and decoded off the main thread inside a window around it, and drawing never waits on a decode. If a full frame is not ready, the preview frame is drawn instead.
- **Remaking the footage:** `tools/PROMPTS.md` has a start image, end image and prompt for seven camera moves between eight keyframes.

## Before you promote it

- **Generator marks and AI disclosure:** the visible generator marks (two sparkles and a "Veo" label) were retouched out of the footage at the owner's request. The generators' invisible provenance watermarks are not affected. The film and the gallery stills are AI-generated, so do not present them as real installations, and consider a short "AI-generated imagery" note on the page. Swap in real photography and footage where possible.
- **Sharpness:** the supplied video was 1280 x 720 with visible compression. Every frame was upscaled 2x with an AI upscaler (Real-ESRGAN `realesr-animevideov3`), lightly sharpened, and packed as AVIF at 2560 px wide for desktop and 1920 px for phones, drawn at full screen density. This removes the softness and compression noise, but it cannot add detail the source never had, so it is clean 1440p-class, not true 4K. For true 4K, regenerate or export the clips at 1080p or higher and run `pack_clips.py` again; the page needs no code change.
- **Estimate:** the bill estimate uses the PM Surya Ghar subsidy figures (₹30,000 per kW for the first 2 kW, ₹18,000 for the third, capped at ₹78,000) and assumed prices. Confirm them before relying on it.
- **Bandwidth:** a full visit loads about 41 MB of frames on desktop and 27 MB on a phone (plus 3 MB of previews that load first). GitHub Pages suits a showcase; for heavy traffic put the site behind a CDN such as Cloudflare.
