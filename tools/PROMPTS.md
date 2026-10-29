# Shot list and prompts

Seven camera moves join eight keyframes. Each clip starts exactly on one keyframe and ends exactly on the next, so the clips
play back to back as one continuous flight. Start and end frames are in `keyframes/` (1920 x 1080).

**Settings (Higgsfield):** model `kling3_0`, mode `pro`, 5 s, 16:9, sound off, start image and end image set as below.
Any tool with start-frame and end-frame input works the same way (Seedance, Veo, Wan, MiniMax). Name the files
`01.mp4` to `07.mp4` and run `tools/pack_clips.py` on the folder.

## 01. The star to the journey

- Start image: `keyframes/kf1_sun.jpg`
- End image: `keyframes/kf2_atmosphere.jpg`
- Move: Ride the beam away from the sun until Earth's horizon fills the frame.

```
SCENE CONTEXT
A golden beam leaves the sun and flies through space to the top of Earth's atmosphere. One camera flight that rides along the beam.

ACTIVE REFERENCES
@image1: first frame. The sun, right of centre, with a golden beam shooting from its core to the lower left. 100% matches the reference.
@image2: last frame. Earth's curved horizon, a glowing blue atmosphere band, and a horizontal golden beam across the full width. 100% matches the reference.

LOCATION MAP
Background: dense star field. Midground: the sun, a granulated orange sphere with a thin corona, filling the right 40% of the first frame. Foreground: the beam, 6% of frame height wide, bright white-gold core with soft gold falloff. Light comes from the beam and the sun.

FIRST FRAME / BLOCKING
Exactly @image1.

FORMAT MODE
One continuous shot, the camera does not cut on its own.

OPTICS
FOV 63°, rectilinear, deep focus, natural motion blur, no drift mid-shot.

CAMERA
Starts level with the beam and flies along it toward the lower left. Speed builds from standstill to 40,000 km/h over the first second, then eases to a full stop over the last second. Gentle 6° roll to the left. The sun shrinks to 10% of its first size and slides out at the upper right. The curve of Earth rises from the bottom edge until its horizon crosses the middle of the frame and the camera levels out.

ACTION
The beam stays centred and straightens from a diagonal into a horizontal line. Plasma on the sun flickers for the first two seconds. Stars drift past, streaking 2% at peak speed. In the last second the blue atmosphere band glows along the top of the planet and thin white cloud swirls appear under the beam.

PHYSICS
The beam is a steady straight shaft; fine glints travel along it in its direction.

LIGHTING
Key: the beam, warm 2700K. Ambient: cold 9000K starlight and earthshine. Gentle highlight roll-off, bright clipping only in the beam core.

STYLE
Photoreal cinematic footage, natural film motion blur, fine film grain, soft highlight roll-off, rich contrast.

OUTPUT SETTINGS
16:9, 24 fps, real-time speed, clean frame with only the scene.

POSITIVE LOCKS
Sun texture, beam colour, star density and Earth cloud pattern match the two reference images. The beam is one unbroken line from first to last frame.
```

## 02. The journey to the clouds

- Start image: `keyframes/kf2_atmosphere.jpg`
- End image: `keyframes/kf3_clouds.jpg`
- Move: Dive from orbit through the atmosphere and break out under the cloud deck.

```
SCENE CONTEXT
The beam crosses the top of the atmosphere and the camera follows it down through the cloud layer into mist above a forest.

ACTIVE REFERENCES
@image1: first frame. Earth's curved horizon with a glowing blue band and a horizontal golden beam. 100% matches the reference.
@image2: last frame. A misty cloudscape, dark tree silhouettes in the lower third, a thin horizontal golden beam at mid-height. 100% matches the reference.

LOCATION MAP
Background: star field fading into the atmosphere glow, then grey-white overcast. Midground: cloud tops, then a bank of vapour. Foreground: the beam, a thin gold line at the centre of the frame that lights the mist along its length. Light comes from the beam.

FIRST FRAME / BLOCKING
Exactly @image1.

FORMAT MODE
One continuous shot, the camera does not cut on its own.

OPTICS
FOV 63°, rectilinear, soft focus pulled into the mist, natural motion blur, no drift mid-shot.

CAMERA
Sinks straight down at 120 km/h and tilts down 25° over the first two seconds, easing in from standstill. Cloud tops rush up and past at the frame edges. At 3 seconds the frame fills with white vapour at 70% density, then the camera breaks out beneath the cloud deck and tilts back up to level, easing to a full stop on the last frame.

ACTION
The blue atmosphere band slides up and out of frame. The beam stays on the centre line the whole time and brightens inside the vapour. Under the cloud the mist thins to 40% density, the beam skims over dark treetops, and soft haze drifts sideways at 5 km/h.

PHYSICS
Vapour swirls around the camera as it passes; the beam scatters a warm glow in the mist.

LIGHTING
Key: the beam, warm 2700K. Ambient: cool 7500K diffuse overcast light that dims as the camera descends.

STYLE
Photoreal cinematic footage, natural film motion blur, fine film grain, soft highlight roll-off, rich contrast.

OUTPUT SETTINGS
16:9, 24 fps, real-time speed, clean frame with only the scene.

POSITIVE LOCKS
Beam colour and thickness match both reference images. The beam stays on the centre line from first to last frame. Cloud shapes and treeline match @image2 at the end.
```

## 03. The clouds to the roof

- Start image: `keyframes/kf3_clouds.jpg`
- End image: `keyframes/kf4_roof.jpg`
- Move: Glide forward through the mist as the beam tilts down onto the solar panel.

```
SCENE CONTEXT
The camera glides forward through mist over a forest toward a modern house. The beam tilts down and lands on a solar panel on its roof.

ACTIVE REFERENCES
@image1: first frame. Misty cloudscape, dark treetops, a thin horizontal golden beam at mid-height. 100% matches the reference.
@image2: last frame. A modern flat-roofed house with a tilted solar panel on the roof, the golden beam arriving from the right edge and landing on the panel's upper edge, stormy sky, trees at the right. 100% matches the reference.

LOCATION MAP
Foreground: treetops and drifting mist. Midground: the house emerges in the lower left, flat roof, one tilted solar panel, dark glass walls. Background: stormy grey clouds. The beam runs from the right edge across the frame. Light comes from the beam.

FIRST FRAME / BLOCKING
Exactly @image1.

FORMAT MODE
One continuous shot, the camera does not cut on its own.

OPTICS
FOV 47°, rectilinear, focus pulls from the mist to the house roof, natural motion blur, no drift mid-shot.

CAMERA
Glides forward at 30 km/h and sinks 8 metres over five seconds, easing in from standstill and easing out to a full stop. A slight 4° pan to the left brings the house into the lower left of the frame.

ACTION
The mist parts around the house as it comes into focus. The beam tilts from horizontal to a gentle downward diagonal from the right edge and lands on the upper edge of the solar panel, which glows warm gold where the beam touches it. Smoke-like mist at the right of the frame drifts through the trees at 3 km/h.

PHYSICS
The beam scatters a faint glow in the mist along its length; the panel glass reflects a soft gold bloom.

LIGHTING
Key: the beam, warm 2700K. Fill: cool 7500K diffuse storm light. Roof surface rim-lit by the beam.

STYLE
Photoreal cinematic footage, natural film motion blur, fine film grain, soft highlight roll-off, rich contrast.

OUTPUT SETTINGS
16:9, 24 fps, real-time speed, clean frame with only the scene.

POSITIVE LOCKS
House shape, panel angle, tree line and storm clouds match @image2 on the last frame. Beam colour and thickness stay constant.
```

## 04. The roof to the module

- Start image: `keyframes/kf4_roof.jpg`
- End image: `keyframes/kf5_module.jpg`
- Move: Push onto the roof; the panel lights up and opens to show the circuitry inside.

```
SCENE CONTEXT
The beam lands on a rooftop solar panel. The camera pushes in, the glass lights up, and a section of the array opens to show glowing circuitry inside.

ACTIVE REFERENCES
@image1: first frame. A modern house roof with a tilted solar panel, the golden beam landing on it, stormy sky. 100% matches the reference.
@image2: last frame. A high close view over a field of dark solar panels, one rectangular section opened to reveal glowing golden and white circuitry, dark trees and stormy sky behind. 100% matches the reference.

LOCATION MAP
Foreground: the solar array, dark blue cells with silver grid lines. Midground: the opened section with circuit traces and busbars. Background: dark treeline, stormy clouds. Light comes from the beam and from the circuitry.

FIRST FRAME / BLOCKING
Exactly @image1.

FORMAT MODE
One continuous shot, the camera does not cut on its own.

OPTICS
FOV 47°, rectilinear, shallow focus on the panel surface, natural motion blur, no drift mid-shot.

CAMERA
Pushes in at 15 km/h toward the panel while cranking up 3 metres and tilting down 30° over five seconds, easing in from standstill and easing out to a full stop above the opening.

ACTION
Where the beam lands, the glass lights up and a warm glow spreads over the cells. At 2.5 seconds a rectangular section of the array lifts open like a hatch. Golden traces inside light up one after another and pulses of light run along them. A little vapour drifts over the panels.

PHYSICS
Pulses of light travel along the traces at walking pace; the glass reflects the storm sky.

LIGHTING
Key: the beam and the circuitry, warm 2700K. Fill: cool 7500K stormy sky. Cells catch cool reflections.

STYLE
Photoreal cinematic footage, natural film motion blur, fine film grain, soft highlight roll-off, rich contrast.

OUTPUT SETTINGS
16:9, 24 fps, real-time speed, clean frame with only the scene.

POSITIVE LOCKS
Panel grid, opening shape, circuit layout, treeline and sky match @image2 on the last frame. Beam colour stays warm gold.
```

## 05. The module to the inverter

- Start image: `keyframes/kf5_module.jpg`
- End image: `keyframes/kf6_inverter.jpg`
- Move: Fly into the opening and ride the golden current to the inverter wall.

```
SCENE CONTEXT
The camera dives into the opened panel and rides the golden current out along glowing lines to a wall-mounted inverter.

ACTIVE REFERENCES
@image1: first frame. A field of solar panels with one section opened to show glowing circuitry. 100% matches the reference.
@image2: last frame. A dark wall with a wall-mounted inverter, a solar-cell grid above glowing slatted vents, curved golden lines on the wall at left, and golden lines running down across a glossy floor toward the camera. 100% matches the reference.

LOCATION MAP
Start: above the opening, circuit traces glowing below. End: facing the inverter wall at 4 metres distance, lines on the floor converging toward the camera. Light comes only from the golden lines.

FIRST FRAME / BLOCKING
Exactly @image1.

FORMAT MODE
One continuous shot, the camera does not cut on its own.

OPTICS
FOV 63°, rectilinear, deep focus, natural motion blur, no drift mid-shot.

CAMERA
Dives down into the opening, then flies along the golden traces at 30 km/h as they lift out of the circuit and run onto a wall. Eases in from standstill over the first second and eases out to a full stop over the last second, ending level and centred on the inverter.

ACTION
Golden traces grow outward from the circuitry and the camera follows them. The scene transforms around the camera into a dark wall with parallel curved bands of light at the left. The lines run down the wall, across the glossy floor and converge at the camera. Pulses of light travel along every line in the direction of travel.

PHYSICS
Light pulses run along the lines at the same speed as the camera; the floor reflects every line.

LIGHTING
Key: the golden lines, warm 2700K, bright core and soft falloff. Ambient: dark 6500K wall, very low exposure.

STYLE
Photoreal cinematic footage, natural film motion blur, fine film grain, soft highlight roll-off, rich contrast.

OUTPUT SETTINGS
16:9, 24 fps, real-time speed, clean frame with only the scene.

POSITIVE LOCKS
Inverter shape, vent slats, line spacing and floor reflections match @image2 on the last frame. Line colour stays warm gold.
```

## 06. The inverter to the home

- Start image: `keyframes/kf6_inverter.jpg`
- End image: `keyframes/kf7_entrance.jpg`
- Move: Follow the lines out of the room and into the entrance; they merge into a ribbon of power.

```
SCENE CONTEXT
The camera follows the golden lines across the floor and out to a house entrance, where they merge into one ribbon of light flowing toward the distribution board.

ACTIVE REFERENCES
@image1: first frame. A dark wall with an inverter and golden lines running across a glossy floor toward the camera. 100% matches the reference.
@image2: last frame. A house entrance corridor, a wide ribbon of golden light sweeping in from the left foreground into the corridor toward a glowing distribution board with a lightning icon at the far end, warm ceiling lights, garden plants at left. 100% matches the reference.

LOCATION MAP
Foreground: the glossy wet floor and the ribbon of light. Midground: entrance walls and the corridor mouth. Background: the distribution board 8 metres in, warm ceiling lights. Light comes from the ribbon and the warm lights.

FIRST FRAME / BLOCKING
Exactly @image1.

FORMAT MODE
One continuous shot, the camera does not cut on its own.

OPTICS
FOV 47°, rectilinear, deep focus, natural motion blur, no drift mid-shot.

CAMERA
Glides along the floor lines at 8 km/h, sliding to the right and turning 40° to face the corridor. Eases in from standstill and eases out to a full stop on the last frame.

ACTION
The parallel lines bend together and merge into one flowing ribbon that sweeps in from the left. Ceiling lights in the corridor switch on from front to back. The ribbon rushes into the corridor and ends in a thin glowing line at the distribution board. Leaves of the plants at the left sway at 2 km/h.

PHYSICS
The ribbon flows in a smooth curve with fine glints running along it; the wet floor mirrors it.

LIGHTING
Key: the ribbon, warm 2700K. Practicals: ceiling lights 3000K. Ambient: dark walls, low exposure.

STYLE
Photoreal cinematic footage, natural film motion blur, fine film grain, soft highlight roll-off, rich contrast.

OUTPUT SETTINGS
16:9, 24 fps, real-time speed, clean frame with only the scene.

POSITIVE LOCKS
Corridor proportions, board position, ribbon shape and plants match @image2 on the last frame. Ribbon colour stays warm gold.
```

## 07. The home to the whole house

- Start image: `keyframes/kf7_entrance.jpg`
- End image: `keyframes/kf8_house.jpg`
- Move: Pull back and rise from the entrance to reveal the whole house lighting up at dusk.

```
SCENE CONTEXT
The camera pulls back and rises from the entrance to reveal the whole house at dusk, its rooms lighting up one by one as power flows through it.

ACTIVE REFERENCES
@image1: first frame. A house entrance corridor with a ribbon of golden light flowing into it. 100% matches the reference.
@image2: last frame. A two-storey modern house at dusk, fully lit, golden wiring lines climbing the facade and crossing the roof solar panels, an electric car in the carport at the right, garden lights, orange and violet sunset sky. 100% matches the reference.

LOCATION MAP
Foreground: wet driveway and garden lights. Midground: the house, glass front, upper balcony, carport on the right with the car. Background: sunset sky with violet clouds, the sun low at the left behind trees. Light comes from the golden wiring, the room lights and the sky.

FIRST FRAME / BLOCKING
Exactly @image1.

FORMAT MODE
One continuous shot, the camera does not cut on its own.

OPTICS
FOV 47° at the start widening to 63° at the end, rectilinear, deep focus, natural motion blur, no drift mid-shot.

CAMERA
Pulls straight back at 10 km/h and rises 6 metres over six seconds, easing in from standstill and easing out to a full stop. Ends level, wide, with the house centred and the car at the right edge.

ACTION
Golden wiring lines run up the facade to the roof panels and along the base of the house. Rooms light up one after another, warm interior light spilling through the glass, the balcony last. Garden lights come on in a wave. The sky deepens from orange to violet.

PHYSICS
Light spreads along the wiring like a pulse; reflections on the wet driveway follow every change.

LIGHTING
Key: the golden wiring and interior lights, warm 2700K to 3000K. Ambient: dusk sky 6000K fading to 9000K. Soft highlight roll-off on the glass.

STYLE
Photoreal cinematic footage, natural film motion blur, fine film grain, soft highlight roll-off, rich contrast.

OUTPUT SETTINGS
16:9, 24 fps, real-time speed, clean frame with only the scene.

POSITIVE LOCKS
House shape, glass front, roof panels, car position and sky colours match @image2 on the last frame. Wiring colour stays warm gold.
```
