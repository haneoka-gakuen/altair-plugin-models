# Altair Models

Altair Models is the visual editor for composed characters in
[Altair](https://github.com/haneoka-gakuen/altair). Pick Live2D models,
images, GIFs and videos from your project, stack them as layers, move, rotate,
scale and fade each one, parent accessories to a body, and watch the result in
a live [Vega](https://github.com/haneoka-gakuen/vega) preview as you go. When it
looks right, add it to a scene with one click — it becomes an ordinary
character that story commands can move and animate.

The figures are saved as `.model.yaml` files and played by
[Vega Composed Models](https://github.com/haneoka-gakuen/vega-plugin-composite);
see that package for the file format.

## Install

```sh
pnpm add @haneoka/altair @haneoka/altair-plugin-adv @haneoka/altair-plugin-models
```

Requires Altair ADV (`haneoka.altair-adv ^0.1.0`). The editor UI uses React 19.

## Use it in Altair

```ts
import { AltairPluginHost } from "@haneoka/altair/plugins";
import { altairAdvPlugin } from "@haneoka/altair-plugin-adv";
import { altairModelsPlugin } from "@haneoka/altair-plugin-models";

const host = new AltairPluginHost();
await host.install(altairAdvPlugin);
await host.install(altairModelsPlugin);
```

The plugin (`haneoka.altair-models`) contributes:

| Contribution | What it does |
| --- | --- |
| Document editor `model` | Opens any `model.yaml`, `*.model.yaml` or `*.model.yml` file in the model editor, creates new ones under `models/`, and validates them on save. |
| Panel `models/document` | The editor itself, loaded on demand. |

## The editor

- **Layers** — add a layer from any project resource: Cubism 2
  (`.model.json`), Cubism 3 (`.model3.json`), PNG/JPEG/WebP/AVIF/SVG images,
  GIFs, MP4/WebM/OGV videos, or another composed model. Reorder, duplicate and
  remove layers; a layer that still has children cannot be removed until they
  are moved.
- **Transform** — position, rotation and scale on three axes, opacity, and a
  parent layer. Children follow their parent.
- **Framing** — choose which layer defines the figure's bounds, or frame all
  layers, and fit a layer into a box.
- **Parameters** — fix model parameters per layer, such as a Live2D pose.
- **Preview** — the model is shown on a neutral background in Vega, exactly as
  it will appear in a story.
- **Add to scene** — inserts a "Character in" command at the top of the chosen
  scene, with the next free name (`figure1`, `figure2`, …) and the model
  anchored to the stage.
- **Conflicts** — if the file changes on disk while open, choose whether to
  load the disk version or keep yours.

## Importing WebGAL layered models

When Altair Studio imports a WebGAL project, characters that point at `.jsonl` or `.wmdl`
layered models are converted to `.model.yaml` files next to the originals, and
the references are updated. `convertWorkspaceModels(workspace, files)` runs
the same conversion for your own import pipeline and returns the updated
workspace plus the generated files.

## API

| Export | Description |
| --- | --- |
| `altairModelsPlugin` (default) | The plugin. |
| `modelDocumentEditor` | The document editor contribution on its own. |

The `/models` subpath adds helpers used by the editor and importers:
`modelDocumentPath(path)`, `modelResourceFormat(path)` (the part format for a
file), `relativeModelPath(model, source)` and `convertWorkspaceModels`.

## License

MPL-2.0. See [LICENSE](LICENSE).
