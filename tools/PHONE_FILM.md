# The phone film (9:16)

The main film is 16:9. On an upright phone the page can only show about a quarter of its width (the picture is cropped to fill
the tall screen), so the sides of every scene are cut off and the picture is magnified. A film made in 9:16 fills the phone
screen with nothing cut off. The page uses it on upright screens (portrait phones and tablets) and keeps the 16:9 film everywhere
else, including phones turned sideways.

## 1. Export the scenes

```bash
python3 tools/export_scenes.py docs/clips scenes
```

This writes `scenes/01.mp4` to `scenes/06.mp4`, one clip per chapter, 1920 x 1080. (The same six clips can be exported from any
cleaned and upscaled copy of the footage; better source frames give a better result.)

## 2. Make each scene 9:16

Two ways, both outside this repository:

- **Reframe the clips (fastest).** Upload each clip to an AI video reframe tool and choose 9:16: Luma "Reframe", Higgsfield "AI Video
  Reframer", Runway "Expand Video" or PixVerse "Video Expand". The tool extends the picture above and below instead of cropping.
  Use the highest quality it offers and keep the file names (01 to 06).
- **Generate new clips (best quality, more work).** Make 9:16 versions of the eight keyframes in `keyframes/` (an image model's
  "extend to 9:16" or outpaint feature, keeping the original in the middle), then generate each of the seven moves in `PROMPTS.md`
  with those start and end images and the output set to 9:16.

If the tool has a prompt box, paste the general line and then the line for that scene.

**General line (every clip).** Extend this scene to a vertical 9:16 frame. Keep the original footage exactly as it is in the middle of the
frame, with the same colours, lighting and motion. Only add new picture above and below it, continuing the same scene seamlessly. No new
objects, no people, no text, no logos.

| Clip | Line for that scene |
| --- | --- |
| 01 star | Extend the black starry space above and below. Add more stars and deep space; the warm glow of the beam spills softly into the new area. |
| 02 atmosphere | Above the planet's curved horizon continue the black space with fine stars. Below the golden beam continue the layer of clouds, lit warmly by the beam. |
| 03 roof | Above, continue the dark stormy sky and the distant tree line. Below, continue the building: the wall, the roof edge and the dark ground. The golden beam on the panel stays unchanged. |
| 04 module | Continue the solar panels in every direction: the same rows of dark blue panels with metal frames. The opened panel with glowing circuits stays unchanged. |
| 05 inverter | Above, continue the dark wall and the solar panels mounted on it. Below, continue the glossy dark floor with the golden light lines reflecting on it. |
| 06 house | Above, continue the deep blue dusk sky. Below, continue the wet reflective driveway and the garden lights. The house, the car, the lights and the golden line of current stay unchanged. |

What to check in each result: the middle of the picture should look like the original, the new top and bottom should be the same scene
and not a blurred copy of it, and nothing new should appear. If it looks wrong, run it again or try another tool.

If the clips come back smaller than 1080 x 1920 (for example 720 x 1280), upscale them first; the phone shows them at about 2.3 times
their height, so sharpness matters.

## 3. Pack them

Put the six results in a folder in story order (`clips_9x16/01.mp4` ... `06.mp4`) and run:

```bash
python3 tools/pack_clips.py clips_9x16 docs/clips-m --vertical --fps 12
```

`--vertical` keeps whole frames (no crop), writes only the phone frames and previews, and points the manifest's desktop entries at the
same files, so nothing is stored twice. `--fps 12` keeps 12 frames a second, which keeps the page light; the player blends neighbouring
frames. Expect about 20 to 30 MB for a film of this length. The chapter count must match the main film (six), because the captions
in `docs/index.html` are shared.

## 4. The opening sun (optional)

The main film opens on a lone small sun that the ray, stars and corona grow out of (the `intro` block in `docs/clips/manifest.json`).
To do the same on phones, cut the sun out of the first frame of the vertical clip with `tools/make_intro.py` (when the whole sun is in the frame) or `tools/make_intro_partial.py` (when the frame cuts the sun off, as in the current phone film; it builds the missing part and adds a `box` to the numbers it prints), save it as
`docs/clips-m/sun.webp`, and add an `intro` block to `docs/clips-m/manifest.json` with the numbers the tool prints (copy the block
from `docs/clips/manifest.json` and change `img`, `cx`, `cy`, `r`, `w`, `h`; set `target` to where the sun should sit, for example
`[0.5, 0.3]`, and `zoom` to how small it starts). Without an `intro` block the first chapter simply opens on its first frame.

## 5. Switch it on

Try it first at `https://en3rgy.live/?vertical=clips-m/` on a phone. When it looks right, add `data-vertical="clips-m/"` to the film
section in `docs/index.html`:

```html
<section id="film" class="film" data-vertical="clips-m/" aria-label="From the sun to your home">
```

To switch it off again, remove the attribute. A phone turned sideways reloads onto the 16:9 film and back.
