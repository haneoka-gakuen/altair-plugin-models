import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "@haneoka/altair-ui-react";
import type { AltairEditorDocument, AltairEditorWorkspace } from "@haneoka/altair";
import { NumberInput, useEditorTranslator } from "@haneoka/altair-ui-react";
import {
  parseCurveMotion,
  sampleMotionCurve,
  serializeCurveMotion,
  type CurveMotion,
  type CurvePoint,
  type MotionCurve,
} from "./motion-curves.js";
import { ClipInsertion } from "./ClipInsertion.js";
import { MotoriExchange } from "./MotoriExchange.js";
const width = 600,
  height = 260,
  left = 42,
  top = 18,
  plotWidth = width - left - 18,
  plotHeight = height - top - 30;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
function changePoint(curve: MotionCurve, index: number, patch: Partial<CurvePoint>): MotionCurve {
  const points = curve.points.map((point) => ({ ...point })),
    old = points[index]!,
    next = { ...old, ...patch };
  const dt = next.time - old.time,
    dy = next.value - old.value;
  if (dt || dy) {
    if (next.control2) next.control2 = [next.control2[0] + dt, next.control2[1] + dy];
    const following = points[index + 1];
    if (following?.control1) following.control1 = [following.control1[0] + dt, following.control1[1] + dy];
  }
  points[index] = next;
  return { ...curve, points };
}
export function MotionEditor({
  workspace,
  document,
}: {
  workspace: AltairEditorWorkspace;
  document: AltairEditorDocument;
}) {
  const tr = useEditorTranslator();
  const parsed = useMemo(() => {
    try {
      return { motion: parseCurveMotion(document.text, document.path) };
    } catch (error) {
      return { issue: error instanceof Error ? error.message : String(error) };
    }
  }, [document.text, document.path]);
  const [curveIndex, setCurveIndex] = useState(0),
    [pointIndex, setPointIndex] = useState(0),
    [parameter, setParameter] = useState("");
  const [draft, setDraft] = useState<CurveMotion>(),
    [issue, setIssue] = useState("");
  const dragDraft = useRef<CurveMotion | undefined>(undefined);
  const drag = useRef<
    | {
        baseline: string;
        motion: CurveMotion;
        curve: number;
        point: number;
        handle: "point" | "control1" | "control2";
        low: number;
        high: number;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    setCurveIndex(0);
    setPointIndex(0);
    setDraft(undefined);
    setIssue("");
    drag.current = undefined;
  }, [document.path]);
  const motion = draft ?? parsed.motion;
  if (!motion)
    return (
      <div className="motion-editor">
        <div role="alert">{tr(parsed.issue ?? "Invalid motion document")}</div>
        <button onClick={() => workspace.setView("source")}>{tr("Source editor")}</button>
      </div>
    );
  const selectedIndex = Math.min(curveIndex, Math.max(0, motion.curves.length - 1)),
    curve = motion.curves[selectedIndex];
  const selectedPoint = curve ? Math.min(pointIndex, curve.points.length - 1) : 0,
    point = curve?.points[selectedPoint];
  const baseCurve = parsed.motion?.curves[selectedIndex] ?? curve;
  const values = baseCurve?.points.flatMap((point) =>
    [point.value, point.control1?.[1], point.control2?.[1]].filter((value): value is number => value !== undefined),
  ) ?? [0, 1];
  const minimum = values.reduce((a, b) => Math.min(a, b), 0),
    maximum = values.reduce((a, b) => Math.max(a, b), 1),
    padding = (maximum - minimum || 1) * 0.15;
  const low = drag.current?.low ?? minimum - padding,
    high = drag.current?.high ?? maximum + padding;
  const duration = Math.max(motion.duration, 1 / motion.fps),
    x = (time: number) => left + (time / duration) * plotWidth,
    y = (value: number) => top + ((high - value) / (high - low)) * plotHeight;
  const path = curve
    ? Array.from({ length: 481 }, (_, index) => {
        const time = (duration * index) / 480;
        return `${index ? "L" : "M"}${x(time)},${y(sampleMotionCurve(curve, time, motion.restricted))}`;
      }).join(" ")
    : "";
  const commit = (next: CurveMotion, baseline = document.text) => {
    if (workspace.document(document.path)?.text !== baseline) {
      setIssue(tr("Motion changed while editing"));
      setDraft(undefined);
      return;
    }
    try {
      workspace.update(document.path, serializeCurveMotion(next));
      setIssue("");
    } catch (error) {
      setIssue(tr(error instanceof Error ? error.message : String(error)));
    }
    setDraft(undefined);
  };
  const patchCurve = (next: MotionCurve) =>
    commit({
      ...motion,
      restricted: false,
      curves: motion.curves.map((value, index) => (index === selectedIndex ? next : value)),
    });
  const patchPoint = (patch: Partial<CurvePoint>) => curve && patchCurve(changePoint(curve, selectedPoint, patch));
  const startDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!curve || !parsed.motion) return;
    const box = event.currentTarget.getBoundingClientRect(),
      px = ((event.clientX - box.left) / box.width) * width,
      py = ((event.clientY - box.top) / box.height) * height;
    const candidates = curve.points.map((value, index) => ({
      index,
      handle: "point" as const,
      time: value.time,
      value: value.value,
    }));
    const selected = curve.points[selectedPoint]!;
    const handles =
      motion.format === "motion3"
        ? (["control1", "control2"] as const).flatMap((handle) =>
            selected[handle]
              ? [{ index: selectedPoint, handle, time: selected[handle]![0], value: selected[handle]![1] }]
              : [],
          )
        : [];
    const chosen = [...candidates, ...handles].reduce((best, value) =>
      Math.hypot(x(value.time) - px, y(value.value) - py) < Math.hypot(x(best.time) - px, y(best.value) - py)
        ? value
        : best,
    );
    setPointIndex(chosen.index);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragDraft.current = undefined;
    drag.current = {
      baseline: document.text,
      motion: parsed.motion,
      curve: selectedIndex,
      point: chosen.index,
      handle: chosen.handle,
      low,
      high,
    };
  };
  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current) return;
    const box = event.currentTarget.getBoundingClientRect(),
      original = current.motion.curves[current.curve]!,
      originalPoint = original.points[current.point]!;
    const time = clamp(((((event.clientX - box.left) / box.width) * width - left) / plotWidth) * duration, 0, duration);
    const value =
      current.high -
      ((((event.clientY - box.top) / box.height) * height - top) / plotHeight) * (current.high - current.low);
    const previous = original.points[current.point - 1],
      following = original.points[current.point + 1];
    const changed =
      current.handle === "point"
        ? changePoint(original, current.point, {
            value,
            time:
              motion.format === "mtn"
                ? originalPoint.time
                : clamp(
                    event.shiftKey ? Math.round(time * motion.fps) / motion.fps : time,
                    previous?.time ?? 0,
                    following?.time ?? duration,
                  ),
          })
        : changePoint(original, current.point, {
            [current.handle]: [clamp(time, previous?.time ?? 0, originalPoint.time), value],
          });
    const next = {
      ...current.motion,
      restricted: false,
      curves: current.motion.curves.map((curve, index) => (index === current.curve ? changed : curve)),
    };
    dragDraft.current = next;
    setDraft(next);
  };
  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current) return;
    drag.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragDraft.current) commit(dragDraft.current, current.baseline);
    dragDraft.current = undefined;
  };
  const addCurve = () => {
    const id = parameter.trim();
    if (!id || motion.curves.some((curve) => curve.id === id && curve.target === "Parameter")) return;
    commit({
      ...motion,
      curves: [
        ...motion.curves,
        {
          id,
          target: "Parameter",
          points: [
            { time: 0, value: 0, segment: "linear" },
            { time: duration, value: 0, segment: "linear" },
          ],
          raw: {},
        },
      ],
    });
    setCurveIndex(motion.curves.length);
    setPointIndex(0);
    setParameter("");
  };
  return (
    <section className="motion-editor">
      <div className="panel-heading">
        <h2>{tr("Motion curves")}</h2>
        <span>{document.path.split("/").at(-1)}</span>
      </div>
      <div className="motion-editor-panels">
        <div className="motion-editor-working">
          <label className="field">
            <span>{tr("Parameter")}</span>
            <select
              value={selectedIndex}
              onChange={(event) => {
                setCurveIndex(Number(event.target.value));
                setPointIndex(0);
              }}
            >
              {motion.curves.map((curve, index) => (
                <option key={`${curve.target}:${curve.id}:${index}`} value={index}>
                  {curve.id} ·{" "}
                  {["Parameter", "PartOpacity", "Model"].includes(curve.target)
                    ? tr(`curveTarget.${curve.target}`)
                    : curve.target}
                </option>
              ))}
            </select>
          </label>
          <svg
            className="motion-curve-graph"
            viewBox={`0 0 ${width} ${height}`}
            aria-label={tr("Motion curve")}
            role="img"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={() => {
              drag.current = undefined;
              dragDraft.current = undefined;
              setDraft(undefined);
            }}
          >
            <rect x={left} y={top} width={plotWidth} height={plotHeight} className="motion-curve-area" />
            {[0, 0.25, 0.5, 0.75, 1].map((value) => (
              <g key={value}>
                <line
                  x1={left + plotWidth * value}
                  y1={top}
                  x2={left + plotWidth * value}
                  y2={top + plotHeight}
                  className="motion-curve-grid"
                />
                <line
                  x1={left}
                  y1={top + plotHeight * value}
                  x2={left + plotWidth}
                  y2={top + plotHeight * value}
                  className="motion-curve-grid"
                />
              </g>
            ))}
            <text x={left} y={height - 5}>
              0
            </text>
            <text x={left + plotWidth} y={height - 5} textAnchor="end">
              {duration.toFixed(3)}s
            </text>
            <text x={left - 5} y={top + 8} textAnchor="end">
              {high.toFixed(2)}
            </text>
            <text x={left - 5} y={top + plotHeight} textAnchor="end">
              {low.toFixed(2)}
            </text>
            {curve && (
              <line
                x1={left}
                y1={y(curve.points[0]!.value)}
                x2={left + plotWidth}
                y2={y(curve.points[0]!.value)}
                className="motion-curve-baseline"
              >
                <title>{tr("Baseline")}</title>
              </line>
            )}
            <path d={path} className="motion-curve-line" />
            {curve?.points.map((point, index) => (
              <circle
                key={index}
                cx={x(point.time)}
                cy={y(point.value)}
                r={index === selectedPoint ? 6 : 2}
                className={index === selectedPoint ? "motion-curve-point selected" : "motion-curve-point"}
              />
            ))}
            {point?.segment === "bezier" &&
              selectedPoint > 0 &&
              (["control1", "control2"] as const).map(
                (key, index) =>
                  point[key] && (
                    <g key={key}>
                      <line
                        x1={x(index ? point.time : curve!.points[selectedPoint - 1]!.time)}
                        y1={y(index ? point.value : curve!.points[selectedPoint - 1]!.value)}
                        x2={x(point[key]![0])}
                        y2={y(point[key]![1])}
                        className="motion-curve-handle"
                      />
                      <circle
                        cx={x(point[key]![0])}
                        cy={y(point[key]![1])}
                        r={5}
                        className="motion-curve-handle-point"
                      />
                    </g>
                  ),
              )}
          </svg>
          <label className="field">
            <span>{tr(motion.format === "mtn" ? "Sample frame" : "Keyframe")}</span>
            <select value={selectedPoint} onChange={(event) => setPointIndex(Number(event.target.value))}>
              {curve?.points.map((point, index) => (
                <option value={index} key={index}>
                  {index + 1} · {point.time.toFixed(3)}s · {point.value.toFixed(3)}
                </option>
              ))}
            </select>
          </label>
          {point && (
            <div className="motion-point-fields">
              <label className="field">
                <span>{tr("Time (s)")}</span>
                <NumberInput
                  min={curve?.points[selectedPoint - 1]?.time ?? 0}
                  max={curve?.points[selectedPoint + 1]?.time ?? duration}
                  step={1 / motion.fps}
                  disabled={motion.format === "mtn"}
                  value={point.time}
                  onCommit={(time) => patchPoint({ time })}
                />
              </label>
              <label className="field">
                <span>{tr("Value")}</span>
                <NumberInput step="any" value={point.value} onCommit={(value) => patchPoint({ value })} />
              </label>
              <label className="field">
                <span>{tr("Interpolation")}</span>
                <select
                  value={point.segment}
                  disabled={selectedPoint === 0 || motion.format === "mtn"}
                  onChange={(event) => {
                    const segment = event.target.value as CurvePoint["segment"],
                      previous = curve!.points[selectedPoint - 1]!;
                    patchPoint({
                      segment,
                      ...(segment === "bezier"
                        ? {
                            control1: [previous.time + (point.time - previous.time) / 3, previous.value],
                            control2: [point.time - (point.time - previous.time) / 3, point.value],
                          }
                        : {}),
                    });
                  }}
                >
                  {["linear", "bezier", "step", "inverse-step"].map((value) => (
                    <option key={value} value={value}>
                      {tr(`curve.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              {point.segment === "bezier" &&
                (["control1", "control2"] as const).map(
                  (key, index) =>
                    point[key] && (
                      <div className="motion-control-fields" key={key}>
                        <label className="field">
                          <span>{tr("Control {{count}} time (s)", { count: index + 1 })}</span>
                          <NumberInput
                            step="any"
                            value={point[key]![0]}
                            onCommit={(value) => patchPoint({ [key]: [value, point[key]![1]] })}
                          />
                        </label>
                        <label className="field">
                          <span>{tr("Control {{count}} value", { count: index + 1 })}</span>
                          <NumberInput
                            step="any"
                            value={point[key]![1]}
                            onCommit={(value) => patchPoint({ [key]: [point[key]![0], value] })}
                          />
                        </label>
                      </div>
                    ),
                )}
              <button
                className="secondary-button"
                disabled={!curve || curve.points.length <= 1}
                onClick={() => {
                  patchCurve({
                    ...curve!,
                    points: curve!.points
                      .filter((_, index) => index !== selectedPoint)
                      .map((point, index) =>
                        motion.format === "mtn" ? { ...point, time: index / motion.fps } : point,
                      ),
                  });
                  setPointIndex(Math.max(0, selectedPoint - 1));
                }}
              >
                <Trash2 size={18} />
                {tr(motion.format === "mtn" ? "Remove sample frame" : "Remove keyframe")}
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  const next = curve!.points[selectedPoint + 1],
                    time = next ? (point.time + next.time) / 2 : point.time + 1 / motion.fps;
                  let points = [...curve!.points];
                  points.splice(selectedPoint + 1, 0, { time, value: point.value, segment: "linear" });
                  if (motion.format === "mtn")
                    points = points.map((point, index) => ({ ...point, time: index / motion.fps }));
                  commit({
                    ...motion,
                    duration: Math.max(duration, time),
                    restricted: false,
                    curves: motion.curves.map((curve, index) =>
                      index === selectedIndex ? { ...curve, points } : curve,
                    ),
                  });
                  setPointIndex(selectedPoint + 1);
                }}
              >
                <Plus size={18} />
                {tr(motion.format === "mtn" ? "Add sample frame" : "Add keyframe")}
              </button>
            </div>
          )}
        </div>
        <div className="motion-editor-settings">
          {curve && (
            <label className="field">
              <span>{tr("Baseline")}</span>
              <NumberInput
                step="any"
                value={curve.points[0]!.value}
                onCommit={(value) => {
                  const delta = value - curve.points[0]!.value;
                  patchCurve({
                    ...curve,
                    points: curve.points.map((point) => ({
                      ...point,
                      value: point.value + delta,
                      ...(point.control1 ? { control1: [point.control1[0], point.control1[1] + delta] as const } : {}),
                      ...(point.control2 ? { control2: [point.control2[0], point.control2[1] + delta] as const } : {}),
                    })),
                  });
                }}
              />
            </label>
          )}
          <label className="field">
            <span>{tr("Duration (s)")}</span>
            <NumberInput
              min={0}
              step={1 / motion.fps}
              disabled={motion.format === "mtn"}
              value={motion.duration}
              onCommit={(duration) => commit({ ...motion, duration })}
            />
          </label>
          <label className="field">
            <span>{tr("Frame rate")}</span>
            <NumberInput
              min={1}
              max={1000}
              step={1}
              value={motion.fps}
              onCommit={(fps) => commit({ ...motion, fps })}
            />
          </label>
          <label className="motion-editor-toggle">
            <input
              type="checkbox"
              checked={motion.loop}
              disabled={motion.format === "mtn"}
              onChange={(event) => commit({ ...motion, loop: event.target.checked })}
            />
            {tr("Loop")}
          </label>
          <details>
            <summary>{tr("Curve channels")}</summary>
            <label className="field">
              <span>{tr("Parameter ID")}</span>
              <input value={parameter} onChange={(event) => setParameter(event.target.value)} />
            </label>
            <button className="secondary-button" disabled={!parameter.trim()} onClick={addCurve}>
              <Plus size={18} />
              {tr("Add parameter")}
            </button>
            <button
              className="secondary-button"
              disabled={!curve}
              onClick={() => {
                commit({ ...motion, curves: motion.curves.filter((_, index) => index !== selectedIndex) });
                setCurveIndex(0);
                setPointIndex(0);
              }}
            >
              <Trash2 size={18} />
              {tr("Remove curve")}
            </button>
          </details>
          <MotoriExchange workspace={workspace} document={document} kind="motion" />
          <ClipInsertion workspace={workspace} path={document.path} kind="motion" onIssue={setIssue} />
        </div>
      </div>
      <div className="motion-editor-issue" role={issue ? "alert" : undefined}>
        {issue}
      </div>
    </section>
  );
}
