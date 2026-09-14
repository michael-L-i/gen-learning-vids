# Statistics tools

Optional browser import: `@lesson-library/statistics`. Pure data helpers let
an author choose the visual representation, labels, pacing and explanatory
sequence. These are tools for finite discrete models and observed frequencies,
not an inference engine or a fixed lesson template.

```js
import { discreteDistribution, histogram, conditionalFrequency } from '@lesson-library/statistics';
const coin = discreteDistribution([
  { id: 'tails', value: 0, weight: 1 },
  { id: 'heads', value: 1, weight: 1 },
]);
const draws = coin.sample({ seed: 42, count: 100 });
// Repeated calls and arbitrary seeks produce the same observations.
coin.sampleAt(42, 17); // Same record as draws[17].
const bars = histogram(draws.map(d => d.value), [-0.5, 0.5, 1.5]);
const selected = conditionalFrequency(draws.map(d => ({
  event: d.value === 1, condition: d.index < 30,
})));
```

`discreteDistribution(entries)` requires 1–10000 outcomes with unique string
IDs, finite numeric values and finite nonnegative weights. Positive total weight
is normalized to probabilities. Frozen `outcomes` includes every outcome's id,
value and probability; `mean` and `variance` are population moments of that
specified model, not estimates from samples. Zero-weight outcomes are never
selected. Floating-point overflow is rejected.

`sampleAt(seed,index)` returns `{index,outcomeId,value}`; `sample({seed,count,start})`
returns the same records over a contiguous index range. Seeds/indices are uint32;
count is 0–1000000 and indices must not wrap. `seededUniform(seed,index)` returns
one value in [0,1). Counter mixing makes arbitrary seeks independent of call
order; it is a reproducible illustrative pseudorandom sequence, not cryptographic
randomness or a guarantee of independent draws. Changing seed shifts the counter
stream; do not treat separate seeds as proven independent streams. No formal
randomness tests or advanced Monte Carlo accuracy claims are supplied.

`histogram(values,edges)` requires finite observations and strictly increasing
finite edges. Bins are [left,right), with the final bin including its right edge.
It returns stable bin IDs, bounds/counts, `underflow`, `overflow`, `total`, and
`inRange`. Counts, rather than densities, are returned; for unequal bin widths,
do not imply bar area is probability unless you explicitly normalize by width.
Counts plus underflow and overflow equal total. Empty data is valid. Limits are
one million observations and ten thousand bins.

`conditionalFrequency([{event,condition},...])` takes Boolean flags and returns
four cell counts (`both`, `eventOnly`, `conditionOnly`, `neither`), total,
numerator, denominator, and frequency. Numerator counts both flags; denominator
counts the conditioning group. Frequency is null for an empty conditioning group,
not zero. This is an observed fraction, not a causal relationship or a population
probability inferred automatically from data.

State the data source or simulation model and sample size on screen. Derive every
dot/bar and displayed count from the same records. Reveal changing denominators
visibly when conditioning; show variation across samples without implying a
single sample proves a limiting theorem. Keep code/data outside Git for personal
lessons, use measured beats, and inspect intermediate frames and label placement.
