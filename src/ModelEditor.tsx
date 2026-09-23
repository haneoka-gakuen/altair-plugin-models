import { authoredNodeLines, serializeAuthoredText } from "@haneoka/altair";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Copy, Layers, Plus, Trash2 } from "lucide-react";
import {
  parseCompositeModel,
  validateCompositeModel,
  type CompositeModelDocument,
  type CompositePart,
  type ModelVector,
} from "@haneoka/vega-plugin-composite/model";
import { NumberInput, useEditorTranslator } from "@haneoka/altair-ui-react";
import type { AltairEditorDocument as EditorDocument, AltairEditorWorkspace as EditorSession } from "@haneoka/altair";
import { insertModelIntoScene } from "./document.js";
import { modelResourceFormat, relativeModelPath } from "./models.js";
import { ModelParameters } from "./ModelParameters.js";
function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit(value: number): void }) {
  return (
    <label className="field">
      {label}
      <NumberInput step="any" value={value} onCommit={onCommit} />
    </label>
  );
}
export function ModelEditor({ session, document }: { session: EditorSession; document: EditorDocument }) {
  const tr = useEditorTranslator();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [sceneChoice, setSceneChoice] = useState("");
  const [selection, setSelection] = useState(""),
    [source, setSource] = useState(""),
    [issue, setIssue] = useState("");
  const parsed = useMemo(() => {
    try {
      return { model: parseCompositeModel(document.text), lines: authoredNodeLines(document.text, "parts") };
    } catch (error) {
      return { error: String(error) };
    }
  }, [document.text]);
  if (!parsed.model)
    return (
      <div className="empty-panel" role="alert">
        {parsed.error}
      </div>
    );
  const model = parsed.model;
  const scenes = state.project?.scenes ?? [];
  const sceneId = scenes.some((scene) => scene.id === sceneChoice)
    ? sceneChoice
    : (state.project?.entrySceneId ?? scenes[0]?.id ?? "");
  const selected = model.parts.find((part) => part.id === selection) ?? model.parts[0];
  const resources = state.files.filter((file) => file.path !== document.path && modelResourceFormat(file.path));
  const commit = (next: CompositeModelDocument) => {
    try {
      validateCompositeModel(next);
      session.update(document.path, serializeAuthoredText(next, document.text));
      setIssue("");
    } catch (error) {
      setIssue(error instanceof Error ? error.message : String(error));
    }
  };
  const update = (patch: Partial<CompositePart>) =>
    selected &&
    commit({
      ...model,
      parts: model.parts.map((part) => (part.id === selected.id ? { ...part, ...patch } : part)),
    });
  const move = (offset: number) => {
    if (!selected) return;
    const parts = [...model.parts],
      index = parts.indexOf(selected),
      destination = index + offset;
    if (destination < 0 || destination >= parts.length) return;
    parts.splice(index, 1);
    parts.splice(destination, 0, selected);
    commit({ ...model, parts });
  };
  const add = () => {
    const path = source || resources[0]?.path;
    if (!path) return;
    const part: CompositePart = {
      id: crypto.randomUUID(),
      source: relativeModelPath(document.path, path),
      format: modelResourceFormat(path)!,
      position: [0, 0, 0],
      scale: [1, 1, 1],
      fit: { width: 16 / 9, height: 1 },
    };
    commit({ ...model, parts: [...model.parts, part] });
    setSelection(part.id);
  };
  const remove = () => {
    if (!selected) return;
    const dependent = model.parts.some((part) => part.parent === selected.id);
    if (dependent) {
      setIssue(tr("Move child layers to another parent before removing this layer."));
      return;
    }
    const next = {
      ...model,
      parts: model.parts.filter((part) => part.id !== selected.id),
    };
    if (next.frame === selected.id) delete (next as { frame?: string }).frame;
    commit(next);
    setSelection("");
  };
  const transform = (key: "position" | "rotation" | "scale", fallback: ModelVector) => (
    <fieldset className="model-transform">
      <legend>{tr(key === "position" ? "Position" : key === "rotation" ? "Rotation (degrees)" : "Scale")}</legend>
      <div>
        {["X", "Y", "Z"].map((axis, index) => (
          <NumberField
            key={axis}
            label={axis}
            value={selected?.[key]?.[index] ?? fallback[index]!}
            onCommit={(value) => {
              const vector = [...(selected?.[key] ?? fallback)] as [number, number, number];
              vector[index] = value;
              update({ [key]: vector });
            }}
          />
        ))}
      </div>
    </fieldset>
  );
  return (
    <section className="model-editor" aria-label={tr("Model composition")}>
      {document.external !== undefined && (
        <div className="conflict-banner" role="alert">
          <strong>{tr("File changed on disk")}</strong>
          <button onClick={() => session.resolveConflict(document.path, "disk")}>{tr("Load disk version")}</button>
          <button onClick={() => session.resolveConflict(document.path, "editor")}>{tr("Keep editor version")}</button>
        </div>
      )}
      <header className="model-heading">
        <Layers size={20} />
        <div>
          <h2>{model.name || document.path.split("/").at(-1)}</h2>
          <p>{tr("Compose models and media in one scene coordinate system.")}</p>
        </div>
      </header>
      <div className="model-scene-insert">
        <label className="field">
          {tr("Scene")}
          <select value={sceneId} onChange={(event) => setSceneChoice(event.target.value)}>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!sceneId || !model.parts.length}
          onClick={() => {
            try {
              insertModelIntoScene(session, document.path, sceneId);
            } catch (error) {
              setIssue(String(error));
            }
          }}
        >
          {tr("Add to scene")}
        </button>
      </div>
      {issue && (
        <p className="model-error" role="alert">
          {issue}
        </p>
      )}
      <div className="model-panels">
        <div className="model-layer-list">
          <label className="field">
            {tr("Resource")}
            <select value={source || resources[0]?.path || ""} onChange={(event) => setSource(event.target.value)}>
              <option value="" disabled>
                {tr("Select a resource")}
              </option>
              {resources.map((file) => (
                <option value={file.path} key={file.path}>
                  {file.path}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" onClick={add} disabled={!resources.length}>
            <Plus size={15} />
            {tr("Add layer")}
          </button>
          <ol className="model-layers" aria-label={tr("Layers")}>
            {model.parts.map((part, index) => (
              <li key={part.id}>
                <button
                  aria-pressed={part.id === selected?.id}
                  className={part.id === selected?.id ? "model-layer selected" : "model-layer"}
                  onClick={() => {
                    setSelection(part.id);
                    session.select(parsed.lines?.get(part.id) ?? 1);
                  }}
                >
                  <span>{index + 1}</span>
                  <div>
                    <strong>{part.source.split("/").at(-1)}</strong>
                    <small>{part.format}</small>
                  </div>
                </button>
              </li>
            ))}
          </ol>
          {!model.parts.length && <p className="empty-panel">{tr("Add a model, image, GIF or video to begin.")}</p>}
          <label className="field">
            {tr("Framing")}
            <select
              value={model.frame ?? ""}
              onChange={(event) => {
                const next = { ...model };
                if (event.target.value) next.frame = event.target.value;
                else delete next.frame;
                commit(next);
              }}
            >
              <option value="">{tr("All layers")}</option>
              {model.parts.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.source.split("/").at(-1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="model-layer-properties">
          {selected && (
            <>
              <div className="model-actions">
                <button
                  title={tr("Move up")}
                  aria-label={tr("Move up")}
                  onClick={() => move(-1)}
                  disabled={model.parts[0] === selected}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  title={tr("Move down")}
                  aria-label={tr("Move down")}
                  onClick={() => move(1)}
                  disabled={model.parts.at(-1) === selected}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  title={tr("Duplicate layer")}
                  aria-label={tr("Duplicate layer")}
                  onClick={() => {
                    const part = { ...selected, id: crypto.randomUUID() };
                    commit({ ...model, parts: [...model.parts, part] });
                    setSelection(part.id);
                  }}
                >
                  <Copy size={16} />
                </button>
                <button title={tr("Remove layer")} aria-label={tr("Remove layer")} onClick={remove}>
                  <Trash2 size={16} />
                </button>
              </div>
              <label className="field">
                {tr("Source")}
                <input
                  key={selected.id + selected.source}
                  defaultValue={selected.source}
                  onBlur={(event) =>
                    update({
                      source: event.target.value,
                      format: modelResourceFormat(event.target.value) ?? selected.format,
                    })
                  }
                />
              </label>
              <label className="field">
                {tr("Model format")}
                <input
                  key={selected.id + selected.format}
                  defaultValue={selected.format}
                  onBlur={(event) => update({ format: event.target.value.trim() })}
                />
              </label>
              <label className="field">
                {tr("Parent layer")}
                <select
                  value={selected.parent ?? ""}
                  onChange={(event) => {
                    const part = { ...selected };
                    if (event.target.value) part.parent = event.target.value;
                    else delete part.parent;
                    commit({
                      ...model,
                      parts: model.parts.map((value) => (value.id === part.id ? part : value)),
                    });
                  }}
                >
                  <option value="">{tr("Scene root")}</option>
                  {model.parts
                    .filter((part) => part !== selected)
                    .map((part) => (
                      <option key={part.id} value={part.id}>
                        {part.source.split("/").at(-1)}
                      </option>
                    ))}
                </select>
              </label>
              {transform("position", [0, 0, 0])}
              {transform("rotation", [0, 0, 0])}
              {transform("scale", [1, 1, 1])}
              <NumberField
                label={tr("Opacity")}
                value={selected.opacity ?? 1}
                onCommit={(value) => update({ opacity: value })}
              />
              {!["static-portrait", "gif", "video"].includes(selected.format) && (
                <ModelParameters
                  key={selected.id}
                  values={selected.parameters ?? {}}
                  onChange={(parameters) => update({ parameters })}
                  onApplyToAll={
                    model.parts.length > 1
                      ? () =>
                          commit({
                            ...model,
                            parts: model.parts.map((part) =>
                              ["static-portrait", "gif", "video"].includes(part.format)
                                ? part
                                : {
                                    ...part,
                                    parameters: { ...part.parameters, ...selected.parameters },
                                  },
                            ),
                          })
                      : undefined
                  }
                />
              )}
              <fieldset className="model-transform">
                <legend>{tr("Fit to frame")}</legend>
                <label className="model-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(selected.fit)}
                    onChange={(event) => {
                      const part = { ...selected };
                      if (event.target.checked) part.fit = { width: 16 / 9, height: 1 };
                      else delete part.fit;
                      commit({
                        ...model,
                        parts: model.parts.map((value) => (value.id === part.id ? part : value)),
                      });
                    }}
                  />
                  {tr("Fit model canvas")}
                </label>
                {selected.fit && (
                  <div>
                    <NumberField
                      label={tr("Width")}
                      value={selected.fit.width}
                      onCommit={(value) => update({ fit: { ...selected.fit!, width: value } })}
                    />
                    <NumberField
                      label={tr("Height")}
                      value={selected.fit.height}
                      onCommit={(value) => update({ fit: { ...selected.fit!, height: value } })}
                    />
                    <NumberField
                      label={tr("Scale")}
                      value={selected.fit.scale ?? 1}
                      onCommit={(value) => update({ fit: { ...selected.fit!, scale: value } })}
                    />
                  </div>
                )}
              </fieldset>
              {["gif", "video"].includes(selected.format) && (
                <fieldset className="model-transform">
                  <legend>{tr("Playback")}</legend>
                  {["autoplay", "loop", ...(selected.format === "video" ? ["muted", "playsinline"] : [])].map((key) => (
                    <label className="model-toggle" key={key}>
                      <input
                        type="checkbox"
                        checked={selected.options?.[key] !== false}
                        onChange={(event) =>
                          update({
                            options: {
                              ...selected.options,
                              [key]: event.target.checked,
                            },
                          })
                        }
                      />
                      {tr(
                        {
                          autoplay: "Autoplay",
                          loop: "Loop",
                          muted: "Mute",
                          playsinline: "Play inline",
                        }[key]!,
                      )}
                    </label>
                  ))}
                </fieldset>
              )}
              <label className="model-toggle">
                <input
                  type="checkbox"
                  checked={selected.optional === true}
                  onChange={(event) => update({ optional: event.target.checked })}
                />
                {tr("Allow this layer to be unavailable")}
              </label>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
