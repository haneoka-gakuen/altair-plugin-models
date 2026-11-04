export const MODEL_EDITOR_CSS = String.raw`
@layer pages {
  .model-editor { container: model-editor / inline-size; display: flex; flex: 1; flex-direction: column; box-sizing: border-box; min-inline-size: 0; min-block-size: 0; overflow: auto; padding: var(--md-sys-spacing-6); font-family: var(--app-font); color: var(--md-sys-color-on-surface); background: var(--md-sys-color-surface); }
  .model-heading { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: var(--md-sys-spacing-4); margin-block-end: var(--md-sys-spacing-5); }
  .model-heading h2 { margin: 0; font-size: var(--md-sys-typescale-title-large-size); line-height: var(--md-sys-typescale-title-large-line-height); font-weight: var(--md-sys-typescale-title-large-weight); }
  .model-heading p { margin-block: var(--md-sys-spacing-1) 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); overflow-wrap: anywhere; }
  .model-panels { display: grid; flex: 1; min-block-size: 0; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: var(--md-sys-spacing-6); }
  .model-layer-list, .model-layer-properties { display: flex; flex-direction: column; gap: var(--md-sys-spacing-4); min-inline-size: 0; overflow: auto; }
  .model-layers { display: flex; flex-direction: column; gap: var(--md-sys-spacing-1); margin: 0; padding: 0; list-style: none; }
  .model-layer { display: flex; align-items: center; gap: var(--md-sys-spacing-3); inline-size: 100%; min-block-size: 48px; text-align: start; padding: var(--md-sys-spacing-3); border: 1px solid transparent; border-radius: var(--md-sys-shape-corner-large); background: transparent; color: inherit; }
  .model-layer > span, .model-layer small { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-large-size); }
  .model-layer > span { font-variant-numeric: tabular-nums; }
  .model-layer div { min-inline-size: 0; }
  .model-layer strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--md-sys-typescale-body-medium-size); font-weight: var(--md-sys-typescale-label-large-weight); }
  .model-layer small { display: block; margin-block-start: var(--md-sys-spacing-1); }
  .model-layer.selected { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); border-color: var(--md-sys-color-secondary); }
  .model-layer.selected :is(small, span) { color: inherit; }
  .model-actions { display: flex; flex-wrap: wrap; gap: var(--md-sys-spacing-2); justify-content: end; }
  .model-actions button { display: grid; place-items: center; min-inline-size: 48px; min-block-size: 48px; }
  .model-transform, .model-parameters { min-inline-size: 0; padding: var(--md-sys-spacing-4); border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-large); }
  .model-transform legend { padding-inline: var(--md-sys-spacing-2); font-size: var(--md-sys-typescale-label-large-size); }
  .model-transform > div { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--md-sys-spacing-2); }
  .model-editor .field { min-inline-size: 0; display: flex; flex-direction: column; gap: var(--md-sys-spacing-2); font-size: var(--md-sys-typescale-label-large-size); }
  .model-editor .field :is(input, select) { inline-size: 100%; min-inline-size: 0; max-inline-size: 100%; box-sizing: border-box; min-block-size: 48px; padding: var(--md-sys-spacing-2); }
  .model-toggle { display: flex; align-items: center; gap: var(--md-sys-spacing-2); min-block-size: 48px; font-size: var(--md-sys-typescale-label-large-size); }
  .model-error { color: var(--md-sys-color-on-error-container); padding: var(--md-sys-spacing-3); background: var(--md-sys-color-error-container); border-radius: var(--md-sys-shape-corner-medium); overflow-wrap: anywhere; }
  .model-editor > .model-error { flex: none; }
  .model-scene-insert { display: flex; flex: none; flex-wrap: wrap; align-items: end; gap: var(--md-sys-spacing-3); margin-block-end: var(--md-sys-spacing-5); }
  .model-scene-insert > .field { flex: 1; }
  .model-scene-insert > button { min-block-size: 48px; }
  .model-parameters { display: grid; gap: var(--md-sys-spacing-3); }
  .model-parameter-row, .model-parameter-add { display: flex; flex-wrap: wrap; align-items: end; gap: var(--md-sys-spacing-2); min-inline-size: 0; }
  .model-parameter-row .field, .model-parameter-add .field { min-inline-size: 0; flex: 1; }
  .model-parameter-row .field > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-parameter-row > button, .model-parameter-add > button { min-block-size: 48px; flex-shrink: 0; }
  @container model-editor (max-width: 700px) { .model-panels, .model-transform > div { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 700px) { .model-editor { padding: var(--md-sys-spacing-4); } }
}
`;
