export const MODEL_EDITOR_CSS = String.raw`
.model-editor{flex:1;min-height:0;overflow:auto;padding:24px;background:var(--surface,#fff)}
.model-heading{display:flex;align-items:center;gap:14px;margin-bottom:22px}
.model-heading h2{margin:0;font-size:18px;font-weight:600}.model-heading p{margin:5px 0 0;color:var(--muted,#697382);font-size:13px}
.model-panels{display:grid;grid-template-columns:minmax(150px,1fr) minmax(220px,1.6fr);gap:24px}
.model-layer-list,.model-layer-properties{display:flex;flex-direction:column;gap:14px;min-width:0}
.model-layers{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}.model-layer{display:flex;align-items:center;gap:10px;width:100%;text-align:start;padding:12px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit}
.model-layer>span{font-variant-numeric:tabular-nums;color:var(--muted,#697382);font-size:12px}.model-layer div{min-width:0}.model-layer strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500}.model-layer small{display:block;color:var(--muted,#697382);margin-top:3px}.model-layer.selected{background:var(--accent-soft,#eef0fc);border-color:var(--accent,#586ab3)}
.model-actions{display:flex;gap:6px;justify-content:flex-end}.model-actions button{display:grid;place-items:center;width:32px;height:32px}.model-transform{border:1px solid var(--border,#e1e4ea);padding:12px;border-radius:8px;min-width:0}.model-transform legend{padding:0 5px;font-size:12px;font-weight:500}.model-transform>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.model-editor .field{min-width:0;display:flex;flex-direction:column;gap:6px;font-size:12px}.model-editor .field input,.model-editor .field select{width:100%;min-width:0;box-sizing:border-box;height:34px;padding:5px 8px}.model-toggle{display:flex;align-items:center;gap:8px;margin:7px 0;font-size:12px}.model-error{color:var(--danger,#b13a3a);padding:12px;background:#b13a3a0d;border-radius:8px}
@media(max-width:700px){.model-panels{grid-template-columns:1fr}.model-editor{padding:16px}}

.model-editor{display:flex;flex-direction:column;overflow:hidden}.model-heading{flex:none}.model-panels{flex:1;min-height:0}.model-layer-list,.model-layer-properties{overflow:auto;padding-inline-end:4px}.model-scene-insert{display:flex;align-items:flex-end;gap:12px;margin-bottom:20px;flex:none}.model-scene-insert>.field{flex:1}.model-scene-insert>button{height:34px;border:1px solid #dedee3}.model-editor>.model-error{flex:none}

.model-parameters { min-width: 0; padding: 12px; border: 1px solid #dedee3; border-radius: 8px; display: grid; gap: 10px; }
.model-parameter-row, .model-parameter-add { display: flex; align-items: end; gap: 8px; min-width: 0; }
.model-parameter-row .field, .model-parameter-add .field { min-width: 0; flex: 1; }
.model-parameter-row .field > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-parameter-row > button, .model-parameter-add > button { min-height: 32px; flex-shrink: 0; }
`;
