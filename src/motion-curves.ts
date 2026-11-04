export type CurveSegment = "linear" | "bezier" | "step" | "inverse-step";
export interface CurvePoint {
  time: number;
  value: number;
  segment: CurveSegment;
  control1?: readonly [number, number];
  control2?: readonly [number, number];
}
export interface MotionCurve {
  id: string;
  target: string;
  points: readonly CurvePoint[];
  raw: Record<string, unknown>;
  originalPoints?: string;
}
export interface CurveMotion {
  format: "motion3" | "mtn";
  duration: number;
  fps: number;
  loop: boolean;
  restricted: boolean;
  curves: readonly MotionCurve[];
  raw: Record<string, unknown>;
  source: string;
  originalFps?: number;
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const number = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("Invalid motion number");
  return value;
};
const nonnegative = (value: unknown): number => {
  const result = number(value);
  if (result < 0) throw new RangeError("Invalid keyframe time");
  return result;
};
const kinds: readonly CurveSegment[] = ["linear", "bezier", "step", "inverse-step"];

function decodeSegments(value: unknown): CurvePoint[] {
  if (!Array.isArray(value) || value.length < 2) throw new TypeError("Invalid motion curve");
  const data = value.map(number),
    points: CurvePoint[] = [{ time: nonnegative(data[0]), value: data[1]!, segment: "linear" }];
  for (let index = 2; index < data.length;) {
    const type = data[index++]!,
      segment = kinds[type];
    if (!segment) throw new TypeError("Unsupported curve interpolation");
    let control1: readonly [number, number] | undefined, control2: readonly [number, number] | undefined;
    if (type === 1) {
      if (index + 5 >= data.length) throw new TypeError("Invalid motion curve");
      control1 = [data[index++]!, data[index++]!];
      control2 = [data[index++]!, data[index++]!];
    } else if (index + 1 >= data.length) throw new TypeError("Invalid motion curve");
    const time = nonnegative(data[index++]);
    if (time < points.at(-1)!.time) throw new RangeError("Keyframes are out of order");
    points.push({ time, value: data[index++]!, segment, ...(control1 ? { control1, control2 } : {}) });
  }
  return points;
}
function encodeSegments(curve: MotionCurve): number[] {
  if (!curve.points.length || !curve.id.trim()) throw new TypeError("Invalid motion curve");
  const first = curve.points[0]!,
    result = [nonnegative(first.time), number(first.value)];
  let previous = first.time;
  for (const point of curve.points.slice(1)) {
    const type = kinds.indexOf(point.segment),
      time = nonnegative(point.time);
    if (type < 0) throw new TypeError("Unsupported curve interpolation");
    if (time < previous) throw new RangeError("Keyframes are out of order");
    result.push(type);
    if (type === 1) {
      if (!point.control1 || !point.control2) throw new TypeError("Missing Bezier handles");
      result.push(...point.control1.map(number), ...point.control2.map(number));
    }
    result.push(time, number(point.value));
    previous = time;
  }
  return result;
}
export function parseCurveMotion(source: string, path: string): CurveMotion {
  if (source.length > 8 * 1024 ** 2) throw new RangeError("Motion document is too large");
  if (/\.mtn$/iu.test(path)) {
    const lines = source.split(/\r\n|\r|\n/u),
      assignments = new Map<string, string>();
    for (const line of lines) {
      const at = line.indexOf("=");
      if (at > 0) assignments.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
    }
    const fps = Number(assignments.get("$fps") ?? 30);
    if (!Number.isFinite(fps) || fps <= 0 || fps > 1000) throw new RangeError("Invalid motion frame rate");
    const curves: MotionCurve[] = [];
    for (const [id, samples] of assignments) {
      if (id.startsWith("$") || id.startsWith("#")) continue;
      const values = samples
        .split(",")
        .filter((value) => value.trim())
        .map((value) => Number(value));
      if (!values.length || values.some((value) => !Number.isFinite(value)))
        throw new TypeError("Invalid motion curve");
      const points = values.map((value, index): CurvePoint => ({ time: index / fps, value, segment: "linear" }));
      curves.push({ id, target: "Parameter", points, raw: {}, originalPoints: JSON.stringify(points) });
    }
    return {
      format: "mtn",
      duration: Math.max(0, ...curves.map((curve) => curve.points.at(-1)!.time)),
      fps,
      loop: false,
      restricted: false,
      curves,
      raw: Object.fromEntries(assignments),
      source,
      originalFps: fps,
    };
  }
  let raw: Record<string, unknown>;
  try {
    raw = object(JSON.parse(source.replace(/^\uFEFF/u, "")));
  } catch {
    throw new TypeError("Invalid motion document");
  }
  const meta = object(raw.Meta);
  if (raw.Version !== 3 || !Array.isArray(raw.Curves)) throw new TypeError("Invalid motion document");
  const fps = number(meta.Fps ?? 30);
  if (fps <= 0 || fps > 1000) throw new RangeError("Invalid motion frame rate");
  const curves = raw.Curves.map((value) => {
    const curve = object(value);
    if (typeof curve.Id !== "string" || !curve.Id || typeof curve.Target !== "string")
      throw new TypeError("Invalid motion curve");
    const points = decodeSegments(curve.Segments);
    if (meta.AreBeziersRestricted === true) points.forEach((point, index) => {
      const previous = points[index - 1];
      if (previous && point.segment === "bezier" && point.control1 && point.control2) {
        const span = point.time - previous.time;
        point.control1 = [previous.time + span / 3, point.control1[1]];
        point.control2 = [previous.time + 2 * span / 3, point.control2[1]];
      }
    });
    return { id: curve.Id, target: curve.Target, points, raw: curve };
  });
  return {
    format: "motion3",
    duration: nonnegative(meta.Duration),
    fps,
    loop: meta.Loop === true,
    restricted: meta.AreBeziersRestricted === true,
    curves,
    raw,
    source,
  };
}
const cubic = (a: number, b: number, c: number, d: number, t: number) => {
  const s = 1 - t;
  return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
};
function bezierTime(left: number, right: number, x1: number, x2: number, time: number): number {
  const span = right - left;
  if (span <= 0) return 1;
  const p1 = (x1 - left) / span,
    p2 = (x2 - left) / span,
    target = (time - left) / span;
  const a = 1 + 3 * p1 - 3 * p2,
    b = 3 * p2 - 6 * p1,
    c = 3 * p1,
    d = -target;
  let roots: number[];
  if (Math.abs(a) < 1e-8) {
    if (Math.abs(b) < 1e-8) roots = [Math.abs(c) < 1e-8 ? 0 : -d / c];
    else {
      const delta = Math.max(0, c * c - 4 * b * d);
      roots = [(-c + Math.sqrt(delta)) / (2 * b), (-c - Math.sqrt(delta)) / (2 * b)];
    }
  } else {
    const shift = b / (3 * a),
      p = c / a - 3 * shift * shift,
      q = 2 * shift ** 3 - (shift * c) / a + d / a;
    const delta = (q * q) / 4 + (p * p * p) / 27;
    if (delta < 0) {
      const radius = Math.sqrt(-p / 3),
        angle = Math.acos(Math.max(-1, Math.min(1, -q / (2 * radius ** 3))));
      roots = [0, 1, 2].map((index) => 2 * radius * Math.cos((angle + 2 * Math.PI * index) / 3) - shift);
    } else if (delta === 0) {
      const u = Math.cbrt(-q / 2);
      roots = [2 * u - shift, -u - shift];
    } else roots = [Math.cbrt(-q / 2 + Math.sqrt(delta)) + Math.cbrt(-q / 2 - Math.sqrt(delta)) - shift];
  }
  return Math.max(0, Math.min(1, roots.find((root) => root >= -0.01 && root <= 1.01) ?? target));
}
export function sampleMotionCurve(curve: MotionCurve, time: number, restricted = false): number {
  const points = curve.points;
  if (time < points[0]!.time) return points[0]!.value;
  let index = 0;
  while (index + 1 < points.length && points[index + 1]!.time <= time) index++;
  const from = points[index]!,
    to = points[index + 1];
  if (!to) return from.value;
  if (to.segment === "step") return from.value;
  if (to.segment === "inverse-step") return to.value;
  const progress = to.time === from.time ? 1 : Math.max(0, Math.min(1, (time - from.time) / (to.time - from.time)));
  if (to.segment === "bezier" && to.control1 && to.control2) {
    const t = restricted ? progress : bezierTime(from.time, to.time, to.control1[0], to.control2[0], time);
    return cubic(from.value, to.control1[1], to.control2[1], to.value, t);
  }
  return from.value + (to.value - from.value) * progress;
}
export function serializeCurveMotion(motion: CurveMotion): string {
  if (!Number.isFinite(motion.fps) || motion.fps <= 0 || motion.fps > 1000)
    throw new RangeError("Invalid motion frame rate");
  const segments = motion.curves.map(encodeSegments);
  if (motion.format === "mtn") {
    const lines = motion.source.split(/(\r\n|\r|\n)/u),
      byId = new Map(motion.curves.map((curve) => [curve.id, curve]));
    const used = new Set<string>();
    const samples = (curve: MotionCurve) => {
      const count = Math.round(curve.points.at(-1)!.time * motion.fps) + 1;
      if (count > 1_000_000) throw new RangeError("Motion document is too large");
      return Array.from({ length: count }, (_, index) =>
        sampleMotionCurve(curve, index / motion.fps, motion.restricted),
      ).join(",");
    };
    for (let index = 0; index < lines.length; index += 2) {
      const line = lines[index]!,
        at = line.indexOf("=");
      if (at <= 0) continue;
      const id = line.slice(0, at).trim();
      if (id === "$fps") {
        if (motion.fps !== motion.originalFps) lines[index] = `$fps=${motion.fps}`;
        used.add(id);
        continue;
      }
      if (id.startsWith("$") || id.startsWith("#")) continue;
      const curve = byId.get(id);
      lines[index] = !curve
        ? ""
        : motion.fps === motion.originalFps && JSON.stringify(curve.points) === curve.originalPoints
          ? line
          : `${curve.id}=${samples(curve)}`;
      used.add(id);
    }
    const newline = motion.source.match(/\r\n|\r|\n/u)?.[0] ?? "\n";
    let result = lines.join("");
    if (!used.has("$fps")) result = `$fps=${motion.fps}${newline}${result}`;
    for (const curve of motion.curves)
      if (!used.has(curve.id))
        result += `${result.endsWith(newline) ? "" : newline}${curve.id}=${samples(curve)}${newline}`;
    return result;
  }
  const maximum = Math.max(0, ...motion.curves.map((curve) => curve.points.at(-1)!.time));
  if (motion.duration < maximum || !Number.isFinite(motion.duration))
    throw new RangeError("Duration ends before the last keyframe");
  const count = motion.curves.reduce((total, curve) => total + curve.points.length - 1, 0);
  const pointCount = motion.curves.reduce(
    (total, curve) =>
      total + 1 + curve.points.slice(1).reduce((n, point) => n + (point.segment === "bezier" ? 3 : 1), 0),
    0,
  );
  return (
    JSON.stringify(
      {
        ...motion.raw,
        Meta: {
          ...object(motion.raw.Meta),
          Duration: motion.duration,
          Fps: motion.fps,
          Loop: motion.loop,
          AreBeziersRestricted: motion.restricted,
          CurveCount: motion.curves.length,
          TotalSegmentCount: count,
          TotalPointCount: pointCount,
        },
        Curves: motion.curves.map((curve, index) => ({
          ...curve.raw,
          Target: curve.target,
          Id: curve.id,
          Segments: segments[index],
        })),
      },
      null,
      2,
    ) + "\n"
  );
}
