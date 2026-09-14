# Waves, fields and ray optics

Import browser-safe pure functions from `@lesson-library/waves`. Choose and compose
helpers for the explanation; these do not prescribe a lesson or slide layout.
Every sample depends only on supplied arguments. Drive simulation time from
`update(seconds)` and measured beats; label slow motion separately from physical time.

## Scalar waves

`planeWave({amplitude=1,wavelength,frequency,direction=[1,0],phase=0})`
returns `(position,time=0) => value`, where position is `[x,y]` and the value is
`amplitude*cos(2π*(unitDirection·position/wavelength-frequency*time)+phase)`.
Use matching position/wavelength units, seconds, Hz and radians. Wavelength must
be positive and frequency nonnegative. Directions are normalized; zero vectors
are errors. The scalar can represent a linear displacement or one field component;
this helper does not solve a wave equation or establish a dispersion relation.
`superpose([waveA,waveB])` sums scalar samplers without mutating the input list.
`sampleWave(wave,{from,to,samples=201,time=0})` returns inclusive equally spaced
`{position,value}` samples along a line. Choose sample spacing fine enough to
resolve your shortest wavelength; no automatic anti-aliasing is performed.

```js
import {planeWave, superpose, sampleWave, polylinePath} from '@lesson-library/waves';
const total = superpose([
  planeWave({wavelength:4,frequency:1}),
  planeWave({wavelength:4,frequency:1,direction:[-1,0]}),
]);
// Inside update(t): a standing wave, with model x mapped to SVG x.
const points = sampleWave(total,{from:[0,0],to:[8,0],time:t})
  .map(({position:[x],value})=>[100+120*x,350-70*value]);
path.setAttribute('d',polylinePath(points));
```

## Vector fields

`sampleField(field,{x=[-1,1],y=[-1,1],columns=11,rows=11,time=0})` samples
`field([x,y],time)` at inclusive grid points in row-major order, returning
`{position,vector}`. A `null` vector explicitly masks an undefined location.
Bounds must increase; dimensions and wave sample counts are integers 2–10000,
and field grids are limited to 100000 samples. Nonfinite sampler output throws.

`pointChargeField([{position:[x,y],charge}],{constant=1,exclusionRadius=0})`
returns the in-plane section of a **three-dimensional** inverse-square field:
`constant * Σ charge * displacement / distance³`. This is not 2D electrostatics.
Supply a consistent unit constant (default is normalized units). Zero charges are
ignored. A location at or within a nonzero source's exclusion radius returns null;
there is no softening, no boundary conditions, and no inferred physical length scale.

`fieldArrows(samples,{project=p=>p,scale=1,maxLength=1,headSize=6})` returns
`{start,end,path,magnitude,clipped}` SVG arrow geometry, omitting null/zero fields.
Scale is model length per field unit; maximum length is in model units. Project
maps both model endpoints into pixels, including y inversion. Arrowheads use
pixel units. Clipping is explicit: label the plot if arrow length saturates.
A nonlinear projection draws straight endpoint chords, not curved trajectories.
`polylinePath([[x,y],...])` returns SVG path data only; style and labels stay yours.

## One planar optical interface

`rayInterface({incident,normal,nFrom,nTo})` normalizes 2D directions. Incident
points **toward** the interface; normal points **into the incident medium** and
must oppose incident. Indices must be positive. Output includes:

- `reflected`: unit reflected direction, always present.
- `refracted`: unit transmitted direction, or null for total internal reflection.
- `incidentAngle`, `refractedAngle`: radians measured from the normal, latter null
  for total internal reflection.
- `criticalAngle`: `asin(nTo/nFrom)` when nFrom > nTo, otherwise null.
- `totalInternalReflection`: explicit boolean; critical incidence is grazing
  transmission, with a 1e-12 sine tolerance for floating-point roundoff.

```js
const rays = rayInterface({
  incident:[Math.sin(angle),Math.cos(angle)],
  normal:[0,-1], nFrom:1.5, nTo:1,
});
// For SVG coordinates with glass above the boundary: reflected points up;
// refracted points down. Draw from the same interface point.
```

This is geometric optics in lossless isotropic media. Direction does not specify
power: no Fresnel coefficients, polarization, phase, evanescent field, diffraction,
absorption, curved surfaces, or automatic intersection/multi-bounce tracing.
Do not encode ray brightness as a calculated intensity. All numeric arguments
must be finite; calculations outside representable numeric ranges can throw.

Underlying models: [OpenStax, electric field](https://openstax.org/books/university-physics-volume-2/pages/5-4-electric-field), [OpenStax, wave interference](https://openstax.org/books/university-physics-volume-1/pages/16-5-interference-of-waves),
[refraction](https://openstax.org/books/university-physics-volume-3/pages/1-3-refraction),
and [total internal reflection](https://openstax.org/books/university-physics-volume-3/pages/1-4-total-internal-reflection).
Verify units, signs, interpretation and labels in the actual lesson; numerical
validation does not certify the author's physical model.
