import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AltairDocumentPreviewSource, AltairEditorWorkspace } from "@haneoka/altair";
import { useEditorTranslator } from "@haneoka/altair-ui-react";
import {
  findMotionOwners,
  insertMotionIntoScene,
  motionModelDocuments,
  sceneMotionTargets,
} from "./motion-document.js";

export function ClipInsertion({
  workspace,
  path,
  kind,
  onIssue,
}: {
  workspace: AltairEditorWorkspace;
  path: string;
  kind: "motion" | "expression";
  onIssue: (issue: string) => void;
}) {
  const tr = useEditorTranslator(),
    state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const [sources, setSources] = useState<readonly AltairDocumentPreviewSource[]>([]);
  const [sceneChoice, setSceneChoice] = useState(""),
    [targetChoice, setTargetChoice] = useState(""),
    [anchorChoice, setAnchorChoice] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all(
      (state.project ? motionModelDocuments(state.project) : []).map(async (path) => {
        const document = workspace.document(path),
          file = state.files.find((file) => file.path === path);
        return document
          ? { path, text: document.text }
          : file && file.blob.size <= 16 * 1024 ** 2
            ? { path, text: await file.blob.text() }
            : undefined;
      }),
    )
      .then((sources) => {
        if (!abort.signal.aborted)
          setSources(sources.filter((source): source is AltairDocumentPreviewSource => !!source));
      })
      .catch(() => {
        if (!abort.signal.aborted) onIssue(tr("Unable to read model manifest"));
      });
    return () => abort.abort();
  }, [workspace, state.project, state.files, state.documents, tr, onIssue]);
  const owner = useMemo(
    () =>
      state.project
        ? findMotionOwners(state.project, path, sources, kind === "motion" ? "motions" : "expressions")[0]
        : undefined,
    [state.project, path, sources, kind],
  );
  const scenes = state.project?.scenes ?? [],
    sceneId = scenes.some((scene) => scene.id === sceneChoice) ? sceneChoice : (state.project?.entrySceneId ?? "");
  const destination = useMemo(
    () => (owner ? sceneMotionTargets(workspace, sceneId, owner) : undefined),
    [workspace, sceneId, owner, state.documents],
  );
  const target = destination?.targets.includes(targetChoice) ? targetChoice : (destination?.targets[0] ?? "");
  const anchor = destination?.anchors.some((node) => node.id === anchorChoice)
    ? anchorChoice
    : (destination?.defaultAnchor ?? "");
  return (
    <>
      <div className="field">
        <span>{tr("Model")}</span>
        <output>
          {owner
            ? ([owner.entry.live2dKey, owner.entry.resourceRef, owner.entry.name].find(
                (value): value is string => typeof value === "string" && !!value,
              ) ?? owner.key)
            : tr(kind === "motion" ? "Motion is not registered to a model" : "Expression is not registered to a model")}
        </output>
      </div>
      <label className="field">
        <span>{tr("Scene")}</span>
        <select
          value={sceneId}
          onChange={(event) => {
            setSceneChoice(event.target.value);
            setTargetChoice("");
            setAnchorChoice("");
          }}
        >
          {scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{tr("Target")}</span>
        <select value={target} onChange={(event) => setTargetChoice(event.target.value)}>
          <option value="">{tr("Select a model target")}</option>
          {destination?.targets.map((target) => (
            <option key={target} value={target}>
              {target}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{tr("Insert after")}</span>
        <select value={anchor} onChange={(event) => setAnchorChoice(event.target.value)}>
          {destination?.anchors.map((node) => (
            <option key={node.id} value={node.id}>
              {node.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="primary-button"
        disabled={!owner || !target || !anchor}
        onClick={() => {
          try {
            insertMotionIntoScene(workspace, sceneId, owner!, target, anchor, kind);
          } catch (error) {
            onIssue(tr(error instanceof Error ? error.message : String(error)));
          }
        }}
      >
        {tr(kind === "motion" ? "Insert motion" : "Insert expression")}
      </button>
    </>
  );
}
