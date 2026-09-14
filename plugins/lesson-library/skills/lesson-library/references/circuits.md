# Circuits and signals

Optional browser helpers, not a lesson template. Import from
`@lesson-library/circuits`. Compose fragments in your own SVG and use measured
narration beats to choose when to advance simulation time. Never infer ability
from an empty profile. No numbered progress footer is required.

- `circuitSymbol({kind,id,a,b,nodeA,nodeB,label?,color?})` supports `resistor`,
  `capacitor`, `voltageSource`. Points are `{x,y}`; separation must be >=64 SVG
  units. Returns `{svg,terminals:{a,b}}` in the caller's coordinates. Terminal a
  is the positive voltage reference, current reference runs a to b. Voltage
  source has + near a and − near b. Label defaults to centered, 36 units above
  midpoint; for vertical symbols or dense layouts omit it and place your own.
- `circuitWire({from,to,via?,color?})` returns a polyline. Endpoints are terminal
  anchors with identical `node` IDs; via points are `{x,y}`. Crossings are not
  junctions. Declare node identities explicitly and draw junction dots yourself.
  Geometry does not construct or validate the simulation netlist.
- `solveDC({nodes,fixed,resistors})`: unique node names, fixed node potentials in
  volts, resistors `{id,a,b,resistance}` in ohms. Returns `potentials`, `branches`
  (voltage a−b, current a→b in amperes, power in watts), and `netOutflow` by node.
  Unknown nodes obey KCL; fixed nodes' net outflow is supplied by their clamps.
  Floating components, nonpositive resistance, and numerically singular systems
  are rejected. This is a bounded linear resistor solver with fixed potentials,
  not SPICE: no arbitrary ideal voltage-source branches, inductors, nonlinear
  devices, switching solver or general transient integration.
- `rcStep({resistance,capacitance,sourceVoltage,initialVoltage=0})` returns `tau`
  in seconds and `at(seconds)` for nonnegative time: voltage across capacitor,
  series current entering its positive terminal, resistorVoltage, charge in
  coulombs and energy in joules. SI inputs. Ideal constant R, C and source after
  a single step at time zero; no parasitics or pre-step solution. Discharge
  current can be negative. It is an independent analytic model, not derived from
  the SVG/netlist.
- `signalTrace({signal,start=0,end,min,max,width,height,samples=120})` returns
  polyline points in plot-local coordinates. Plot labels/axes/clipping belong
  to the caller; values outside the range are deliberately not clamped.

```js
import {rcStep, signalTrace} from '@lesson-library/circuits';
const model = rcStep({resistance:1000, capacitance:0.001, sourceVoltage:5});
const state = model.at(1); // Vc≈3.16 V, I≈1.84 mA, tau=1 s
const points = signalTrace({signal:t=>model.at(t).voltage,end:5,
  min:0,max:5,width:400,height:180});
```

Drive schematic readouts, voltage/current plots, and time cursor from the same
model time. Label playback time scaling. Do not animate decorative charge dots
as if their speed were electron drift or signal propagation. For RC, show the
shrinking resistor voltage together with declining current and rising capacitor
voltage; keep voltage polarity and current reference visible. Verify initial
condition, one time constant, KVL, capacitor law and limiting behavior.

Scientific reference: [OpenStax, University Physics 2, RC circuits](https://openstax.org/books/university-physics-volume-2/pages/10-5-rc-circuits).
