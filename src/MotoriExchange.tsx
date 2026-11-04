import { useRef, useState } from "react";
import type { AltairEditorDocument, AltairEditorWorkspace, JsonObject } from "@haneoka/altair";
import { useEditorTranslator } from "@haneoka/altair-ui-react";
import { parseCurveMotion, serializeCurveMotion } from "./motion-curves.js";
import { parseExpressionDocument, serializeExpressionDocument } from "./expression-document.js";
import {
  exportMotoriExpression,
  exportMotoriMotion,
  importMotoriExpression,
  importMotoriMotion,
} from "./motori-clips.js";

const object = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
const origin = (text: string): string => {
  try {
    return String(object(object(JSON.parse(text)).VegaMotori).sourcePath ?? "");
  } catch {
    return /^# altair-motori-source: (.+)$/mu.exec(text)?.[1] ?? "";
  }
};
export function MotoriExchange({
  workspace,
  document,
  kind,
}: {
  workspace: AltairEditorWorkspace;
  document: AltairEditorDocument;
  kind: "motion" | "expression";
}) {
  const tr = useEditorTranslator(),
    input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [issue, setIssue] = useState("");
  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setIssue("");
    try {
      await task();
    } catch (error) {
      setIssue(tr(error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  };
  const exportClip = async () => {
    const sourcePath = origin(document.text),
      sourceFile = workspace.getSnapshot().files.find((file) => file.path === sourcePath);
    const source = workspace.document(sourcePath)?.text ?? (sourceFile ? await sourceFile.blob.text() : "");
    const original = source ? object(JSON.parse(source)) : {};
    const name =
      typeof original.name === "string"
        ? original.name
        : document.path
            .split("/")
            .at(-1)!
            .replace(/\.(motion3|exp3?|mtn)(\.json)?$/iu, "");
    const value =
      kind === "motion"
        ? exportMotoriMotion(parseCurveMotion(document.text, document.path), name, original)
        : exportMotoriExpression(parseExpressionDocument(document.text, document.path), name, original);
    const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" }),
      filename = `${name.replace(/[\\/:*?"<>|]/gu, "_")}.${kind === "motion" ? "mtrmtn" : "mtrexp"}`;
    if (workspace.downloadFile) workspace.downloadFile(blob, filename);
    else {
      const url = URL.createObjectURL(blob),
        anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  };
  const importClip = async (file: File) => {
    const source = await file.text(),
      hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    const sourcePath = `sources/motori/${hash.slice(0, 16)}-${file.name.replace(/[^\p{L}\p{N}._-]/gu, "_")}`;
    let text: string;
    if (kind === "motion") {
      const incoming = importMotoriMotion(source),
        current = parseCurveMotion(document.text, document.path);
      if (current.format === "mtn" && incoming.curves.some((curve) => curve.target !== "Parameter"))
        throw new Error("MTN cannot represent part opacity tracks");
      if (
        current.format === "mtn" &&
        Math.ceil(incoming.duration * incoming.fps + 1) * incoming.curves.length > 500_000
      )
        throw new Error("Motion document is too large");
      const motion = {
        ...incoming,
        format: current.format,
        loop: current.loop,
        source: current.source,
        ...(current.originalFps === undefined ? {} : { originalFps: current.originalFps }),
        raw: { ...current.raw, ...incoming.raw, VegaMotori: { sourcePath } },
      };
      text = serializeCurveMotion(motion);
      if (current.format === "mtn") {
        text = text.replace(/^# altair-motori-source: .*(?:\r?\n|$)/mu, "");
        for (const [key, value] of [
          ["fadein", incoming.raw.FadeInTime],
          ["fadeout", incoming.raw.FadeOutTime],
        ] as const) {
          const line = `$${key}=${Number(value) * 1000}`,
            pattern = new RegExp(`^\\$${key}=.*$`, "mu");
          text = pattern.test(text) ? text.replace(pattern, line) : line + "\n" + text;
        }
        text = `# altair-motori-source: ${sourcePath}\n` + text;
      }
    } else {
      const expression = importMotoriExpression(source, parseExpressionDocument(document.text, document.path));
      text = serializeExpressionDocument({
        ...expression,
        source: { ...expression.source, VegaMotori: { sourcePath } },
      });
    }
    if (workspace.document(document.path)?.text !== document.text) throw new Error("Document changed while importing");
    if (!workspace.getSnapshot().files.some((file) => file.path === sourcePath))
      await workspace.addFile(sourcePath, new Blob([source], { type: "application/json" }), { open: false });
    if (workspace.document(document.path)?.text !== document.text) throw new Error("Document changed while importing");
    workspace.update(document.path, text);
  };
  return (
    <details className="argument-section">
      <summary>{tr("Motori exchange")}</summary>
      <div className="motion-point-fields">
        <input
          ref={input}
          hidden
          type="file"
          accept={kind === "motion" ? ".mtrmtn" : ".mtrexp"}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void run(() => importClip(file));
          }}
        />
        <button type="button" className="secondary-button" disabled={busy} onClick={() => input.current?.click()}>
          {tr(kind === "motion" ? "Import into current motion" : "Import into current expression")}
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(exportClip)}>
          {tr(kind === "motion" ? "Export Motori motion" : "Export Motori expression")}
        </button>
      </div>
      <output className="motion-editor-issue" role="alert">
        {issue}
      </output>
    </details>
  );
}
