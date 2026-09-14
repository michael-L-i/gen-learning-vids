# README media

## Disulfide zoom

`disulfide-zoom.gif` is the explicitly selected documentation excerpt from the project demo **How distant residues meet in folded crambin**. It uses video time **00:45–00:55**, at 960×540 and 12 frames per second, loops, and has no audio. The full generated lesson and its learner-context files are not distributed in this repository.

The animation uses Mol* / MolViewSpec to move from the folded protein to the sulfur atoms of Cys3 and Cys40. The displayed 2.00 Å is their rounded coordinate separation; the source's `struct_conn` annotation identifies the disulfide bond. It is not a molecular-dynamics simulation or an uncertainty estimate.

- Structure: [RCSB PDB 1CRN](https://www.rcsb.org/structure/1CRN), crambin, chain A, model 0.
- Coordinate file: [1CRN mmCIF](https://files.rcsb.org/download/1CRN.cif), retrieved 2026-09-14.
- Coordinate archive terms: CC0, as described in the [RCSB PDB usage policies](https://www.rcsb.org/pages/policies).
- Structure paper: [Hendrickson and Teeter, 1981](https://pubmed.ncbi.nlm.nih.gov/6895315/).
- Renderer: [Mol*](https://github.com/molstar/molstar), version 5.11.0; dependency notices remain applicable.
- Layout, labels, and animation: authored for this project's demo. This selected GIF is included under the repository's MIT license; underlying data and dependencies retain their own terms.

To recreate the GIF if you have a local copy of the source MP4, run from the repository root. Substitute its path below; the full video is not required for the contributor example.

```sh
ffmpeg -ss 45 -t 10 -i /absolute/path/to/crambin-demo.mp4 \
  -filter_complex '[0:v]fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a' \
  -loop 0 -y docs/assets/disulfide-zoom.gif
```

The [first-scene example](../../examples/first-scene/README.md) is the independently reproducible starter lesson; it requires no private assets or source video.
