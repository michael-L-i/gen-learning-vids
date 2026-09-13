# Animation engine

The lesson renderer accepts `visual: "animation"` scenes using the contract in `server/animation/schema.js`. Normal lesson planning includes this guidance. `server/animation/plan.js` exposes the same instructions and strict scene schema for short-clip callers.

Scenes contain shapes, measured text, parent groups, timed narration beats, and tracks for position, rotation, scale, opacity and stroke drawing. The renderer synthesizes each beat, extends its duration to fit the speech, and evaluates actual frames at 720p/30 fps. Caption cues follow real beat boundaries. Existing lesson formats can appear alongside animation scenes.

The engine validates IDs, hierarchy, track conflicts and values; measures text; checks sampled text clipping; and retains timing and layout reports. It does not establish scientific correctness, prevent every object collision, or automatically generate anatomical illustrations. These require further capabilities and human review.

This branch contains only the distributable engine, integration and regression tests. Personal evaluation prompts, viewers, ratings and generated comparison clips belong to a separate local branch/worktree. Merge engine changes into main; do not merge the personal evaluation branch.
