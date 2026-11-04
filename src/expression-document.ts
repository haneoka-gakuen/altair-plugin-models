import type { AltairDocumentEditorContribution, JsonObject } from "@haneoka/altair";
import { createStoryCommand } from "@haneoka/altair-plugin-adv";
import { findMotionOwners, motionModelDocuments } from "./motion-document.js";
import { MODEL_PREVIEW_BACKGROUND } from "./models.js";

export type ExpressionBlend = "add" | "multiply" | "overwrite";
export interface ExpressionParameter {
  readonly id: string;
  readonly value: number;
  readonly blend: ExpressionBlend;
  readonly reference?: number | undefined;
  readonly source: JsonObject;
}
export interface ExpressionDocument {
  readonly modern: boolean;
  readonly fadeIn?: number | undefined;
  readonly fadeOut?: number | undefined;
  readonly parameters: readonly ExpressionParameter[];
  readonly source: JsonObject;
}
const object = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid expression document");
  return value as JsonObject;
};
const number = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) throw new Error("Invalid expression document");
  return parsed;
};
const blend = (value: unknown, modern: boolean): ExpressionBlend => {
  if (value === undefined || value === (modern ? "Add" : "add")) return "add";
  if (value === (modern ? "Multiply" : "mult")) return "multiply";
  if (value === (modern ? "Overwrite" : "set")) return "overwrite";
  throw new Error("Unknown expression blend");
};
export function parseExpressionDocument(text: string, path: string): ExpressionDocument {
  let source: JsonObject;
  try {
    source = object(JSON.parse(text));
  } catch {
    throw new Error("Invalid expression document");
  }
  const modern = /\.exp3\.json$/iu.test(path),
    values = source[modern ? "Parameters" : "params"];
  if (!Array.isArray(values)) throw new Error("Invalid expression document");
  const fadeIn = number(source[modern ? "FadeInTime" : "fade_in"]),
    fadeOut = number(source[modern ? "FadeOutTime" : "fade_out"]),
    scale = modern ? 1 : 1000;
  return {
    modern,
    source,
    ...(fadeIn !== undefined ? { fadeIn: fadeIn / scale } : {}),
    ...(fadeOut !== undefined ? { fadeOut: fadeOut / scale } : {}),
    parameters: values.map((value) => {
      const source = object(value),
        id = source[modern ? "Id" : "id"],
        parameter = number(source[modern ? "Value" : "val"]),
        reference = modern ? undefined : number(source.def);
      if (typeof id !== "string" || !id || parameter === undefined) throw new Error("Invalid expression document");
      return {
        id,
        value: parameter,
        blend: blend(source[modern ? "Blend" : "calc"], modern),
        source,
        ...(reference !== undefined ? { reference } : {}),
      };
    }),
  };
}
export function serializeExpressionDocument(document: ExpressionDocument): string {
  const { modern } = document,
    source = { ...document.source },
    scale = modern ? 1 : 1000;
  const update = (source: JsonObject, key: string, value: number | undefined) => {
    if (value === undefined) delete source[key];
    else if (number(source[key]) !== value) source[key] = value;
  };
  update(
    source,
    modern ? "FadeInTime" : "fade_in",
    document.fadeIn === undefined ? undefined : document.fadeIn * scale,
  );
  update(
    source,
    modern ? "FadeOutTime" : "fade_out",
    document.fadeOut === undefined ? undefined : document.fadeOut * scale,
  );
  source[modern ? "Parameters" : "params"] = document.parameters.map((parameter) => {
    const source = { ...parameter.source },
      idKey = modern ? "Id" : "id",
      blendKey = modern ? "Blend" : "calc";
    source[idKey] = parameter.id;
    update(source, modern ? "Value" : "val", parameter.value);
    if (!modern) update(source, "def", parameter.reference);
    if (blend(source[blendKey], modern) !== parameter.blend)
      source[blendKey] = modern
        ? { add: "Add", multiply: "Multiply", overwrite: "Overwrite" }[parameter.blend]
        : { add: "add", multiply: "mult", overwrite: "set" }[parameter.blend];
    return source;
  });
  const text = JSON.stringify(source, null, 2) + "\n";
  parseExpressionDocument(text, modern ? "expression.exp3.json" : "expression.exp.json");
  return text;
}
export const expressionDocumentEditor: AltairDocumentEditorContribution = {
  id: "expression",
  label: "Expression editor",
  panelId: "models/expression",
  affectsPreview: true,
  matches: (path) => /\.exp3?\.json$/iu.test(path),
  validate: (document) => {
    parseExpressionDocument(document.text, document.path);
  },
  relatedDocuments: (_document, project) => motionModelDocuments(project),
  preview(document, project) {
    parseExpressionDocument(document.text, document.path);
    const owner = findMotionOwners(project, document.path, document.relatedSources, "expressions")[0];
    if (!owner) throw new Error("Expression is not registered to a model");
    const id = `expression:${document.path}`;
    const background = createStoryCommand("Stage", { duration: 0, background: { url: MODEL_PREVIEW_BACKGROUND } });
    const show = createStoryCommand("In", {
      targetName: "expression-model",
      positionType: 5,
      duration: 0,
      characterModel: owner.entry,
    });
    const expression = createStoryCommand("Expression", {
      targetName: "expression-model",
      expressionName: owner.name,
      motionFadeIn: -1,
    });
    const wait = createStoryCommand("Wait");
    const commands = [background, show, expression, wait].map((command, index) => ({
      ...command,
      id: `${id}:${index}`,
    }));
    return { scope: "scene", scene: { id, name: owner.name, commands, extensions: {} }, commandId: commands[2]!.id };
  },
};
