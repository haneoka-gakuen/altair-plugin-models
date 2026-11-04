import type { JsonObject } from "@haneoka/altair";
import type { CurveMotion, CurvePoint, MotionCurve } from "./motion-curves.js";
import type { ExpressionDocument, ExpressionParameter } from "./expression-document.js";

const object = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Motori document");
  return value as JsonObject;
};
const finite = (value: unknown, fallback: number): number => {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid Motori number");
  return value;
};
export function readMotoriClip(source: string, kind: "motion" | "expression"): JsonObject {
  if (source.length > 8 * 1024 ** 2) throw new Error("Motion document is too large");
  let value: JsonObject;
  try {
    value = object(JSON.parse(source));
  } catch {
    throw new Error("Invalid Motori document");
  }
  if (value.kind !== kind || value.schemaVersion !== 1 || !Array.isArray(value.parameters))
    throw new Error("Unsupported Motori document version");
  if (value.fallbackMotion || value.fallbackExpression) throw new Error("Motori fallback must be resolved first");
  return value;
}
const framePoint = (value: unknown) => {
  const frame = object(value);
  if (frame.type !== undefined && frame.type !== "value") throw new Error("Motori reference must be resolved first");
  const at = finite(frame.at, 0),
    number = finite(frame.value, 0);
  if (at < 0) throw new Error("Invalid keyframe time");
  return { frame, at, value: number };
};
function motoriCurve(value: unknown, target: string, fps: number): MotionCurve | undefined {
  const parameter = object(value),
    id = target === "Model" ? "Opacity" : String(parameter.id ?? "");
  if (!id) throw new Error("Invalid motion curve");
  if (parameter.type === "unset") return undefined;
  if (parameter.type === "referenceMotion") throw new Error("Motori reference must be resolved first");
  if (parameter.type === "fixedValue")
    return {
      id,
      target,
      raw: {},
      points: [{ time: 0, value: finite(parameter.defaultFixedValue, 0), segment: "linear" }],
    };
  if (parameter.type !== undefined && parameter.type !== "keyframes") throw new Error("Unknown Motori parameter mode");
  const frames = (Array.isArray(parameter.keyframes) ? parameter.keyframes : []).map(framePoint);
  if (!frames.length) return undefined;
  for (let i = 1; i < frames.length; i++)
    if (frames[i]!.at <= frames[i - 1]!.at) throw new Error("Keyframes are out of order");
  const derivative = (index: number, end: boolean) => {
    const left = frames[index]!,
      right = frames[index + 1]!;
    if (left.frame.transitionType === "linear") return (right.value - left.value) / (right.at - left.at);
    const raw = left.frame[end ? "bezierControl2" : "bezierControl1"];
    if (left.frame.transitionType === "bezier" && raw) {
      const control = object(raw),
        anchor = end ? right : left;
      const dt = finite(control.at, anchor.at) - anchor.at;
      return dt ? (finite(control.value, anchor.value) - anchor.value) / dt : 0;
    }
    return undefined;
  };
  const points: CurvePoint[] = frames.map((current, index) => {
    const point: CurvePoint = { time: current.at / fps, value: current.value, segment: "linear" };
    if (!index) return point;
    const previous = frames[index - 1]!,
      mode = previous.frame.transitionType ?? "catmullRom";
    if (mode === "linear") return point;
    if (mode === "stepped" || mode === "inverseStepped")
      return { ...point, segment: mode === "stepped" ? "step" : "inverse-step" };
    const delta = current.at - previous.at;
    if (mode === "bezier") {
      const first = previous.frame.bezierControl1 ? object(previous.frame.bezierControl1) : {},
        second = previous.frame.bezierControl2 ? object(previous.frame.bezierControl2) : {};
      return {
        ...point,
        segment: "bezier",
        control1: [finite(first.at, previous.at) / fps, finite(first.value, previous.value)],
        control2: [finite(second.at, current.at) / fps, finite(second.value, current.value)],
      };
    }
    if (mode !== "catmullRom") throw new Error("Unsupported curve interpolation");
    const before = frames[index - 2],
      after = frames[index + 1];
    const leftSlope =
      target !== "Parameter" || !before
        ? 0
        : (derivative(index - 2, true) ?? (current.value - before.value) / (current.at - before.at));
    const rightSlope =
      target !== "Parameter" || !after
        ? 0
        : (derivative(index, false) ?? (after.value - previous.value) / (after.at - previous.at));
    return {
      ...point,
      segment: "bezier",
      control1: [(previous.at + delta / 3) / fps, previous.value + (leftSlope * delta) / 3],
      control2: [(current.at - delta / 3) / fps, current.value - (rightSlope * delta) / 3],
    };
  });
  return {
    id,
    target,
    points,
    raw: {
      ...(parameter.fadein === undefined ? {} : { FadeInTime: finite(parameter.fadein, 500) / 1000 }),
      ...(parameter.fadeout === undefined ? {} : { FadeOutTime: finite(parameter.fadeout, 500) / 1000 }),
    },
  };
}
export function importMotoriMotion(source: string): CurveMotion {
  const doc = readMotoriClip(source, "motion"),
    fps = finite(doc.fps, 30),
    length = finite(doc.length, 90);
  if (fps <= 0 || length <= 0) throw new Error("Invalid Motori number");
  const curves = [
    ...(doc.parameters as unknown[]).map((value) => motoriCurve(value, "Parameter", fps)),
    ...(Array.isArray(doc.partOpacities) ? doc.partOpacities : []).map((value) =>
      motoriCurve(value, "PartOpacity", fps),
    ),
    ...(doc.modelOpacity ? [motoriCurve(doc.modelOpacity, "Model", fps)] : []),
  ].filter((curve): curve is MotionCurve => Boolean(curve));
  return {
    format: "motion3",
    fps,
    duration: length / fps,
    loop: false,
    restricted: false,
    curves,
    source: "",
    raw: {
      Version: 3,
      FadeInTime: finite(doc.fadein, 500) / 1000,
      FadeOutTime: finite(doc.fadeout, 500) / 1000,
    },
  };
}
export function exportMotoriMotion(motion: CurveMotion, name: string, original: JsonObject = {}): JsonObject {
  const aligned = (fps: number) =>
    motion.curves.every((curve) =>
      curve.points.every((point) => Math.abs(point.time * fps - Math.round(point.time * fps)) < 1e-4),
    );
  const fps = aligned(motion.fps) ? motion.fps : aligned(1000) ? 1000 : 1_000_000;
  const previous = [
    ...(Array.isArray(original.parameters) ? original.parameters : []),
    ...(Array.isArray(original.partOpacities) ? original.partOpacities : []),
  ].map(object);
  const parameters: JsonObject[] = [],
    parts: JsonObject[] = [];
  let modelOpacity: JsonObject | undefined;
  for (const curve of motion.curves) {
    if (
      !["Parameter", "PartOpacity", "Model"].includes(curve.target) ||
      (curve.target === "Model" && curve.id !== "Opacity")
    )
      throw new Error("Motori cannot represent this curve target");
    const old =
      curve.target === "Model"
        ? original.modelOpacity
          ? object(original.modelOpacity)
          : {}
        : (previous.find((parameter) => parameter.id === curve.id) ?? {});
    const oldFrames = new Map(
      (Array.isArray(old.keyframes) ? old.keyframes.map(object) : []).map((frame) => [frame.at, frame]),
    );
    const frames = curve.points.map((point, index) => {
      const next = curve.points[index + 1],
        at = Math.round(point.time * fps);
      if (index && at <= Math.round(curve.points[index - 1]!.time * fps))
        throw new Error("Motori keyframes overlap on the time grid");
      const frame: JsonObject = { ...oldFrames.get(at), at, value: point.value };
      delete frame.refScope;
      delete frame.refFullname;
      delete frame.refHash;
      delete frame.refParamId;
      delete frame.refStartAt;
      delete frame.refAdd;
      delete frame.refMultiply;
      if (curve.target === "Parameter") frame.type = "value";
      const segment = next?.segment ?? "linear";
      frame.transitionType = { linear: "linear", bezier: "bezier", step: "stepped", "inverse-step": "inverseStepped" }[
        segment
      ];
      delete frame.bezierControl1;
      delete frame.bezierControl2;
      if (next?.segment === "bezier") {
        if (!next.control1 || !next.control2) throw new Error("Missing Bezier handles");
        frame.bezierControl1 = { at: next.control1[0] * fps, value: next.control1[1] };
        frame.bezierControl2 = { at: next.control2[0] * fps, value: next.control2[1] };
      }
      return frame;
    });
    const parameter: JsonObject = { ...old, ...(curve.target === "Model" ? {} : { id: curve.id }), keyframes: frames };
    if (curve.target === "Parameter") parameter.type = "keyframes";
    if (typeof curve.raw.FadeInTime === "number" && curve.raw.FadeInTime >= 0)
      parameter.fadein = curve.raw.FadeInTime * 1000;
    else delete parameter.fadein;
    if (typeof curve.raw.FadeOutTime === "number" && curve.raw.FadeOutTime >= 0)
      parameter.fadeout = curve.raw.FadeOutTime * 1000;
    else delete parameter.fadeout;
    if (curve.target === "Parameter") parameters.push(parameter);
    else if (curve.target === "PartOpacity") parts.push(parameter);
    else modelOpacity = parameter;
  }
  const doc: JsonObject = {
    ...original,
    kind: "motion",
    schemaVersion: 1,
    name,
    runtime: motion.format === "mtn" ? "legacy" : "modern",
    fps,
    length: motion.curves.reduce(
      (length, curve) =>
        curve.points.reduce((length, point) => Math.max(length, Math.round(point.time * fps) + 1), length),
      Math.max(1, Math.ceil(motion.duration * fps)),
    ),
    parameters: [
      ...parameters,
      ...(Array.isArray(original.parameters)
        ? original.parameters
            .map(object)
            .filter((value) => value.type === "unset" && !parameters.some((parameter) => parameter.id === value.id))
        : []),
    ],
    fadein: (finite(motion.raw.FadeInTime, 1) < 0 ? 1 : finite(motion.raw.FadeInTime, 1)) * 1000,
    fadeout: (finite(motion.raw.FadeOutTime, 1) < 0 ? 1 : finite(motion.raw.FadeOutTime, 1)) * 1000,
  };
  if (parts.length) doc.partOpacities = parts;
  else delete doc.partOpacities;
  if (modelOpacity) doc.modelOpacity = modelOpacity;
  else delete doc.modelOpacity;
  return doc;
}
export function importMotoriExpression(source: string, target: ExpressionDocument): ExpressionDocument {
  const doc = readMotoriClip(source, "expression");
  const fadeIn = finite(doc.fadein, 500),
    fadeOut = finite(doc.fadeout, 500);
  const parameters: ExpressionParameter[] = (doc.parameters as unknown[]).flatMap((value) => {
    const parameter = object(value),
      id = String(parameter.id ?? "");
    if (!id) throw new Error("Invalid expression document");
    if (parameter.type === "unset") return [];
    if (
      (parameter.fadein !== undefined && parameter.fadein !== fadeIn) ||
      (parameter.fadeout !== undefined && parameter.fadeout !== fadeOut)
    )
      throw new Error("Motori parameter fades need native tracks");
    const old = target.parameters.find((value) => value.id === id),
      reference = old?.reference;
    const blend =
      parameter.type === "overrideValue"
        ? "overwrite"
        : parameter.type === "addValue"
          ? "add"
          : parameter.type === "multiplyValue"
            ? "multiply"
            : undefined;
    if (!blend) throw new Error("Unknown expression blend");
    const incoming = finite(parameter[parameter.type as string], blend === "multiply" ? 1 : 0);
    return [
      {
        id,
        blend,
        value: incoming * (blend === "multiply" ? reference || 1 : 1) + (blend === "add" ? (reference ?? 0) : 0),
        source: old?.source ?? {},
        ...(reference === undefined ? {} : { reference }),
      },
    ];
  });
  return { ...target, fadeIn: fadeIn / 1000, fadeOut: fadeOut / 1000, parameters };
}
export function exportMotoriExpression(
  expression: ExpressionDocument,
  name: string,
  original: JsonObject = {},
): JsonObject {
  const old = Array.isArray(original.parameters) ? original.parameters.map(object) : [];
  return {
    ...original,
    kind: "expression",
    schemaVersion: 1,
    name,
    runtime: expression.modern ? "modern" : "legacy",
    fadein: (expression.fadeIn ?? 0.5) * 1000,
    fadeout: (expression.fadeOut ?? 0.5) * 1000,
    parameters: expression.parameters.map((parameter) => ({
      ...old.find((value) => value.id === parameter.id),
      id: parameter.id,
      type: { overwrite: "overrideValue", add: "addValue", multiply: "multiplyValue" }[parameter.blend],
      [{ overwrite: "overrideValue", add: "addValue", multiply: "multiplyValue" }[parameter.blend]]:
        parameter.blend === "add"
          ? parameter.value - (parameter.reference ?? 0)
          : parameter.blend === "multiply"
            ? parameter.value / (parameter.reference || 1)
            : parameter.value,
    })),
  };
}
