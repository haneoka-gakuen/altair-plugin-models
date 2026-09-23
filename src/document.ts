import {
  parseAltairProjectDocument,
  parseAltairSceneDocument,
  serializeAltairDocument,
  type AltairEditorWorkspace,
  type AltairDocumentEditorContribution,
} from "@haneoka/altair";
import { createStoryCommand, advCommandToAuthoredNode } from "@haneoka/altair-plugin-adv";
import { parseCompositeModel, serializeCompositeModel } from "@haneoka/vega-plugin-composite/model";
import { modelDocumentPath, MODEL_PREVIEW_BACKGROUND } from "./models.js";

export const modelDocumentEditor: AltairDocumentEditorContribution = {
  id: "model",
  label: "Model composition",
  panelId: "models/document",
  matches: modelDocumentPath,
  create(name) {
    return {
      path: `models/${name.replace(/\.model\.ya?ml$/iu, "")}.model.yaml`,
      text: serializeCompositeModel({ format: "model", version: 1, name, parts: [] }),
    };
  },
  validate(document) {
    parseCompositeModel(document.text);
  },
  preview(document) {
    const model = parseCompositeModel(document.text),
      id = `model:${document.path}`;
    const show = createStoryCommand("In", {
      targetName: "model",
      positionType: 5,
      duration: 0,
      characterModel: {
        runtime: { format: "composite", model: document.path },
        profile: { placement: { referenceWidth: 2560, referenceHeight: 1440, scale: 0.8, align: [0.5, 0.5] } },
      },
    });
    show.id = `${id}:show`;
    const background = createStoryCommand("Stage", { duration: 0, background: { url: MODEL_PREVIEW_BACKGROUND } });
    background.id = `${id}:background`;
    const wait = createStoryCommand("Wait");
    wait.id = `${id}:wait`;
    return {
      scene: { id, name: model.name ?? document.path, commands: [background, show, wait], extensions: {} },
      commandId: wait.id,
    };
  },
};

export function insertModelIntoScene(workspace: AltairEditorWorkspace, modelPath: string, sceneId: string) {
  const manifest = workspace.document("project.yaml");
  if (!manifest) throw new Error(workspace.translate("Project manifest is missing"));
  const project = parseAltairProjectDocument(manifest.text),
    reference = project.scenes.find((scene) => scene.id === sceneId);
  const document = reference && workspace.document(reference.path);
  if (!document) throw new Error(workspace.translate("Scene is missing"));
  const scene = parseAltairSceneDocument(document.text);
  const targets = new Set(scene.nodes.map((node) => node.arguments.targetName));
  let ordinal = 1;
  while (targets.has(`figure${ordinal}`)) ordinal++;
  const command = createStoryCommand("In", {
    targetName: `figure${ordinal}`,
    positionType: 5,
    duration: 0.3,
    characterModel: {
      runtime: { format: "composite", model: modelPath },
      profile: { placement: { anchor: "stage", align: [0.5, 1] } },
    },
  });
  workspace.update(
    document.path,
    serializeAltairDocument({ ...scene, nodes: [advCommandToAuthoredNode(command), ...scene.nodes] }, document.text),
  );
  workspace.activate(document.path);
}
