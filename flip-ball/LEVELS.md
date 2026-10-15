# Mirrorline level plan

Each level teaches one new idea, then a later level mixes it with what came before.
The core rule stays the same throughout: a slope steeper than 30° can't be climbed,
and a hill on one side is a valley on the other.

## Obstacles

| Obstacle | What it looks like | How you get past it |
|---|---|---|
| **Curvy hill** (have it) | Smooth mountain | Flip under, ride into the peak, flip back on top, roll down |
| **Curvy pit** (have it) | Smooth valley | Fall in, flip under at the bottom, ride up the far wall |
| **45° ramp** | Straight slope with sharp corners | Too steep from one side; from the other side it's a slide. Ramp up, plateau, ramp down teaches flipping on a flat top |
| **90° box hill** | Flat-topped block with vertical sides | A wall from above. From below it's a notch: you get pulled up into it, ride along its ceiling, then flip on top at the end and drop off the far wall |
| **90° box pit** | Square hole with vertical sides | From above you drop in and can't get out. Flip under: the floor becomes a bump you ride over, then flip back. A pit narrower than the ball is a gap you just roll across |
| **Staircase** | Steps with near-vertical risers | Each riser blocks you from above. From below, stairs going up become stairs going down, so you drop each step. A climb-then-descend ziggurat forces two flips |
| **Rock** | Big ball that lives in one world only, under that world's gravity | It blocks you only on its own side. Flip to pass it on the other side, then flip back |
| **Rolling rock** | A rock rolling down a slope toward you | Timing: flip out of its way, let it pass, flip back |
| **Swinging rock** | A rock rocking back and forth in a valley | Timing: wait until it swings away, then go |

My additions:

| Obstacle | What it looks like | How you get past it |
|---|---|---|
| **One-sided wall** | A post standing on one side of the line only | A static version of the rock. Simple to teach "switch worlds to get around things" |
| **Run-up hill** | A hill only a little steeper than 30° | Can't flip past it. Back up and use momentum. Teaches speed, not only flipping |
| **No-flip zone** | A grey band on the line | You can't flip while on it, so you have to pick the right side before entering |
| **Breathing hill** | A hill that slowly rises and falls | Timing: cross while it's low |

## Level order

1. **First fold**: gentle waves, then one curvy hill. You learn the flip.
2. **Undertow**: a curvy pit, then a curvy hill. Flipping works both ways.
3. **Angles**: 45° ramps, then 90° box hills and pits. Sharp shapes behave like curves.
4. **Steps**: a staircase up, then down. Two flips in a row.
5. **Boulders**: still rocks, alternating between above and below. Rocks only exist in one world.
6. **Rockfall**: rolling rocks down a long slope. Timing.
7. **Run-up**: run-up hills mixed with flip hills. Learn when to flip and when to build speed.
8. **Mirrorline**: everything, with no-flip zones. Planning ahead.

## Scoring

Time and flips are already tracked. Add a "par" flip count per level, the fewest flips
needed, and show it on the Level complete banner.

## Engine changes needed

- **Level format:** lines get segment types, curve or straight, so 45° ramps and stairs
  have sharp corners.
- **Vertical walls:** the ball currently moves by x position, which can't handle a 90°
  wall. Switching to distance along the line lets it roll up or down a vertical side.
- **Rocks:** objects with their own side, position and speed, using the same gravity
  rule as the ball. They are solid only to a ball on the same side.
- **Multiple levels:** a level list, a "Next level" button on the banner, and saved
  progress.
- **Rock hits:** for now a rock pushes you back. Later it could restart you at a
  checkpoint.
