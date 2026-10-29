# EN3RGY website

Source for https://en3rgy.live, a one-page rooftop-solar site. Scrolling or swiping plays a short film, frame by frame, forwards and backwards: one ray of light travels from the sun to a lit-up home, in six chapters (the star, the journey, the roof, the module, the inverter, the whole house). After the film: a statement, a gallery, a 3-step process, a bill estimate and an enquiry form.

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
  js/reel.js          the film player: frame scrubbing, holds, cuts, captions, phone crop
  js/ui.js            header, bill estimate, enquiry form
  clips/              the film, packed into frame sheets, with manifest.json
  plates/             still images for the gallery
  CNAME, 404.html, favicon.svg, og.jpg
tools/                pack_clips.py, keyframes.py, shots.py, PROMPTS.md, shots.json
keyframes/            16:9 start and end frames, for remaking the footage
```

## Changing things

- **Enquiries:** the form sends an email to the address in `docs/js/ui.js` (`EMAIL`). Set `WHATSAPP` there (country code and number, digits only) and it sends to WhatsApp instead.
- **Copy, brand, colours:** `docs/index.html`; colours and fonts are the tokens at the top of `docs/css/styles.css`.
- **Real figures:** the page deliberately has no company statistics, phone number or address, because none were supplied. Add them where you want them in `docs/index.html`.
- **Footage:** `python3 tools/pack_clips.py movie.mp4 docs/clips --auto-cuts --dw 1920 --mw 1280 --grid 2x1 --mgrid 2x2 --q 76 --mq 70` cuts a video at its scene changes and writes the frame sheets and manifest the page loads. It needs `ffmpeg` and Pillow. If the video has a different number of scenes, update the six `.cap` blocks (and the `.static` list under them) in `docs/index.html`. Options are listed at the top of `tools/pack_clips.py`.
- **Remaking the footage:** `tools/PROMPTS.md` has a start image, end image and prompt for seven camera moves between eight keyframes.

## Before you promote it

- **Generator marks and AI disclosure:** the visible generator marks (two sparkles and a "Veo" label) were retouched out of the footage at the owner's request. The generators' invisible provenance watermarks are not affected. The film and the gallery stills are AI-generated, so do not present them as real installations, and consider a short "AI-generated imagery" note on the page. Swap in real photography and footage where possible.
- **Sharpness:** the supplied video was 1280 x 720 with visible compression. Every frame was upscaled 2x with an AI upscaler (Real-ESRGAN `realesr-animevideov3`) and packed at 1920 px wide for desktop and 1280 px for phones. A native 1080p export would still be sharper.
- **Estimate:** the bill estimate uses the PM Surya Ghar subsidy figures (₹30,000 per kW for the first 2 kW, ₹18,000 for the third, capped at ₹78,000) and assumed prices. Confirm them before relying on it.
- **Bandwidth:** a full visit loads about 32 MB on desktop and 18 MB on a phone. GitHub Pages suits a showcase; for heavy traffic put the site behind a CDN such as Cloudflare.
