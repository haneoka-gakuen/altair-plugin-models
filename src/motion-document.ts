import {
  parseAltairProjectDocument,
  parseAltairSceneDocument,
  serializeAltairDocument,
  authoredNodeLines,
  type AltairDocumentEditorContribution,
  type AltairEditorWorkspace,
  type JsonObject,
  type StoryProject,
  type AltairDocumentPreviewSource,
  type AltairEditorDocument,
  type AltairProjectDocument,
  type AltairSceneDocument,
} from "@haneoka/altair";
import { createStoryCommand, advCommandToAuthoredNode } from "@haneoka/altair-plugin-adv";
import { MODEL_PREVIEW_BACKGROUND } from "./models.js";
import { parseCurveMotion } from "./motion-curves.js";
const record = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
const text = (...values: unknown[]) =>
  values.find((value): value is string => typeof value === "string" && !!value) ?? "";
export interface MotionOwner {
  readonly key: string;
  readonly name: string;
  readonly entry: JsonObject;
  readonly aliases: readonly string[];
}
export function motionModelDocuments(project: StoryProject): readonly string[] {
  return [
    ...new Set(
      ["live2d", "models"].flatMap((category) => {
        const value = project.assets[category];
        return (Array.isArray(value) ? value : Object.values(record(value))).flatMap((value) => {
          const entry = record(value),
            runtime = record(entry.runtime),
            source = text(runtime.model, runtime.modelUrl, entry.source);
          return /(?:^|[/.])model3?\.json$/iu.test(source) ? [source] : [];
        });
      }),
    ),
  ];
}
export function findMotionOwners(
  project: StoryProject,
  path: string,
  documents: readonly AltairDocumentPreviewSource[] = [],
  kind: "motions" | "expressions" = "motions",
): MotionOwner[] {
  const result: MotionOwner[] = [];
  for (const category of ["live2d", "models"]) {
    const values = project.assets[category];
    for (const [key, value] of Object.entries(
      record(Array.isArray(values) ? Object.fromEntries(values.map((value, index) => [String(index), value])) : values),
    )) {
      const entry = record(value),
        runtime = record(entry.runtime),
        model = text(runtime.model, runtime.modelUrl, entry.source);
      const matches = (source: string) => {
        if (source === path) return true;
        try {
          return (
            decodeURIComponent(new URL(source, new URL(model, "https://project.invalid/")).pathname.slice(1)) === path
          );
        } catch {
          return false;
        }
      };
      for (const clips of [entry[kind], runtime[kind]]) {
        if (!Array.isArray(clips)) continue;
        for (const item of clips) {
          const clip = record(item),
            source = text(clip.url, clip.runtime, clip.source, clip.file);
          if (!source || !matches(source)) continue;
          const name = text(clip.name);
          if (!name || result.some((owner) => owner.key === key && owner.name === name)) continue;
          result.push({
            key,
            name,
            entry,
            aliases: [
              key,
              ...[entry.resourceRef, entry.live2dKey, entry.id, entry.characterKey, runtime.model, entry.source].filter(
                (value): value is string => typeof value === "string",
              ),
            ],
          });
        }
      }
      const sourceDocument = documents.find((document) => document.path === model);
      if (sourceDocument) {
        let manifest: JsonObject;
        try {
          manifest = record(JSON.parse(sourceDocument.text));
        } catch {
          continue;
        }
        const modern = manifest.Version === 3;
        if (kind === "expressions") {
          const expressions = modern ? record(manifest.FileReferences).Expressions : manifest.expressions;
          for (const value of Array.isArray(expressions) ? expressions : []) {
            const expression = record(value),
              source = text(expression.File, expression.file),
              name = text(expression.Name, expression.name);
            if (name && source && matches(source) && !result.some((owner) => owner.key === key && owner.name === name))
              result.push({
                key,
                name,
                entry,
                aliases: [
                  key,
                  ...[
                    entry.resourceRef,
                    entry.live2dKey,
                    entry.id,
                    entry.characterKey,
                    runtime.model,
                    entry.source,
                  ].filter((value): value is string => typeof value === "string"),
                ],
              });
          }
          continue;
        }
        const groups = record(modern ? record(manifest.FileReferences).Motions : manifest.motions);
        for (const [group, values] of Object.entries(groups)) {
          if (!Array.isArray(values)) continue;
          values.forEach((value, index) => {
            const source = text(record(value).File, record(value).file);
            const name = modern
              ? source
                  .split("/")
                  .at(-1)!
                  .replace(/\.motion3\.json$/iu, "")
              : index
                ? `${group}_${index}`
                : group;
            if (source && matches(source) && !result.some((owner) => owner.key === key && owner.name === name))
              result.push({
                key,
                name,
                entry,
                aliases: [
                  key,
                  ...[entry.resourceRef, entry.live2dKey, entry.id, runtime.model, entry.source].filter(
                    (value): value is string => typeof value === "string",
                  ),
                ],
              });
          });
        }
      }
    }
  }
  return result;
}
export const motionDocumentEditor: AltairDocumentEditorContribution = {
  id: "motion-curves",
  label: "Motion curves",
  panelId: "models/motion-curves",
  affectsPreview: true,
  matches: (path) => /\.(?:motion3\.json|mtn)$/iu.test(path),
  validate: (document) => {
    parseCurveMotion(document.text, document.path);
  },
  relatedDocuments: (_document, project) => motionModelDocuments(project),
  preview(document, project) {
    const motion = parseCurveMotion(document.text, document.path),
      owner = findMotionOwners(project, document.path, document.relatedSources)[0];
    if (!owner) throw new Error("Motion is not registered to a model");
    const id = `motion:${document.path}`;
    const background = createStoryCommand("Stage", { duration: 0, background: { url: MODEL_PREVIEW_BACKGROUND } });
    background.id = `${id}:background`;
    const show = createStoryCommand("In", {
      targetName: "motion-model",
      positionType: 5,
      duration: 0,
      characterModel: owner.entry,
      characterPresentation: { motionName: owner.name, fadeInSeconds: 0 },
      motionName: owner.name,
    });
    show.id = `${id}:show`;
    const play = createStoryCommand("Motion", {
      targetName: "motion-model",
      motionName: owner.name,
      motionFadeIn: 0,
      key: "motion-start",
    });
    play.id = `${id}:play`;
    const delay = createStoryCommand("Delay", {
      duration: motion.duration + (motion.format === "mtn" ? 1 / motion.fps : 0),
    });
    delay.id = `${id}:delay`;
    const end = motion.loop ? createStoryCommand("GoTo", { params: ["motion-start"] }) : createStoryCommand("Wait");
    end.id = `${id}:end`;
    return {
      scope: "scene",
      scene: { id, name: owner.name, commands: [background, show, play, delay, end], extensions: {} },
      commandId: play.id,
    };
  },
};
const projects = new WeakMap<AltairEditorDocument, AltairProjectDocument>();
const scenes = new WeakMap<AltairEditorDocument, AltairSceneDocument>();
function projectDocument(document: AltairEditorDocument): AltairProjectDocument {
  let parsed = projects.get(document);
  if (!parsed) {
    parsed = parseAltairProjectDocument(document.text);
    projects.set(document, parsed);
  }
  return parsed;
}
function sceneDocument(document: AltairEditorDocument): AltairSceneDocument {
  let parsed = scenes.get(document);
  if (!parsed) {
    parsed = parseAltairSceneDocument(document.text);
    scenes.set(document, parsed);
  }
  return parsed;
}
export function sceneMotionTargets(
  workspace: AltairEditorWorkspace,
  sceneId: string,
  owner: MotionOwner,
): { path: string; targets: string[]; anchors: { id: string; label: string }[]; defaultAnchor: string } | undefined {
  const manifest = workspace.document("project.yaml");
  if (!manifest) return;
  const project = projectDocument(manifest),
    reference = project.scenes.find((scene) => scene.id === sceneId),
    document = reference && workspace.document(reference.path);
  if (!document) return;
  const scene = sceneDocument(document),
    targets = new Set<string>();
  const walk = (
    node: AltairSceneDocument["nodes"][number],
    root: string,
    visit: (node: AltairSceneDocument["nodes"][number], root: string) => void,
  ) => {
    visit(node, root);
    node.children?.forEach((child) => walk(child, root, visit));
  };
  for (const reference of project.scenes) {
    const source = workspace.document(reference.path);
    if (!source) continue;
    for (const node of sceneDocument(source).nodes)
      walk(node, node.id, (node) => {
        const fields = { ...record(node.extensions?.fields), ...node.arguments };
        const model = record(fields.characterModel),
          runtime = record(model.runtime);
        const aliases = [
          fields.live2dKey,
          model.resourceRef,
          model.live2dKey,
          model.id,
          model.characterKey,
          runtime.model,
          runtime.modelUrl,
          model.source,
        ];
        if (
          node.type.plugin === "haneoka.altair-adv" &&
          ["Character", "In"].includes(node.type.name) &&
          aliases.some((value) => typeof value === "string" && owner.aliases.includes(value)) &&
          typeof node.arguments.targetName === "string" &&
          node.arguments.targetName
        )
          targets.add(node.arguments.targetName);
      });
  }
  let firstIn = "",
    firstRegistration = "";
  for (const node of scene.nodes)
    walk(node, node.id, (node, root) => {
      if (
        node.type.plugin !== "haneoka.altair-adv" ||
        typeof node.arguments.targetName !== "string" ||
        !targets.has(node.arguments.targetName)
      )
        return;
      if (node.type.name === "In") firstIn ||= root;
      if (node.type.name === "Character") firstRegistration ||= root;
    });
  let initialPresentation = firstIn || firstRegistration;
  const firstAppearance = scene.nodes.findIndex((node) => node.id === firstIn);
  if (firstAppearance >= 0) {
    for (const node of scene.nodes.slice(firstAppearance)) {
      let dialogue = false,
        presentation = false;
      walk(node, node.id, (child) => {
        if (child.type.plugin !== "haneoka.altair-adv") return;
        if (child.type.name === "Talk") dialogue = true;
        if (
          ["In", "Motion", "Expression"].includes(child.type.name) &&
          typeof child.arguments.targetName === "string" &&
          targets.has(child.arguments.targetName)
        )
          presentation = true;
      });
      if (dialogue && node.id !== firstIn) break;
      if (presentation) initialPresentation = node.id;
      if (dialogue) break;
    }
  }
  return {
    path: document.path,
    targets: [...targets],
    defaultAnchor: initialPresentation || scene.nodes[0]?.id || "",
    anchors: scene.nodes.map((node, index) => ({
      id: node.id,
      label: `${index + 1} · ${workspace.translate(node.type.plugin === "haneoka.altair-adv" ? `command.${node.type.name}` : node.type.name === "timeline" ? "Timeline" : node.type.name)}`,
    })),
  };
}
export function insertMotionIntoScene(
  workspace: AltairEditorWorkspace,
  sceneId: string,
  owner: MotionOwner,
  target: string,
  afterId: string,
  kind: "motion" | "expression" = "motion",
): void {
  const destination = sceneMotionTargets(workspace, sceneId, owner),
    document = destination && workspace.document(destination.path);
  if (!destination || !document || !destination.targets.includes(target)) throw new Error("Select a model target");
  const scene = parseAltairSceneDocument(document.text),
    index = scene.nodes.findIndex((node) => node.id === afterId);
  if (index < 0) throw new Error("Missing statement");
  const command = createStoryCommand(kind === "motion" ? "Motion" : "Expression", {
    targetName: target,
    [kind === "motion" ? "motionName" : "expressionName"]: owner.name,
    motionFadeIn: -1,
  });
  command.id = crypto.randomUUID();
  const node = advCommandToAuthoredNode(command),
    nodes = [...scene.nodes];
  nodes.splice(index + 1, 0, node);
  const next = serializeAltairDocument({ ...scene, nodes }, document.text);
  workspace.update(document.path, next);
  workspace.activate(document.path, authoredNodeLines(next).get(node.id) ?? 1);
}
