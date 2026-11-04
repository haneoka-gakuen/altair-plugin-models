import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { AltairEditorDocument, AltairEditorWorkspace } from "@haneoka/altair";
import { NumberInput, useEditorTranslator } from "@haneoka/altair-ui-react";
import { ClipInsertion } from "./ClipInsertion.js";
import { MotoriExchange } from "./MotoriExchange.js";
import {
  parseExpressionDocument,
  serializeExpressionDocument,
  type ExpressionDocument,
  type ExpressionParameter,
  type ExpressionBlend,
} from "./expression-document.js";

export function ExpressionEditor({
  workspace,
  document,
}: {
  workspace: AltairEditorWorkspace;
  document: AltairEditorDocument;
}) {
  const tr = useEditorTranslator();
  const parsed = useMemo(() => {
    try {
      return { expression: parseExpressionDocument(document.text, document.path) };
    } catch (error) {
      return { issue: error instanceof Error ? error.message : String(error) };
    }
  }, [document.text, document.path]);
  const [selection, setSelection] = useState(0),
    [parameterId, setParameterId] = useState(""),
    [issue, setIssue] = useState("");
  const expression = parsed.expression;
  if (!expression)
    return (
      <div className="motion-editor">
        <div role="alert">{tr(parsed.issue ?? "Invalid expression document")}</div>
        <button onClick={() => workspace.setView("source")}>{tr("Source editor")}</button>
      </div>
    );
  const index = Math.min(selection, Math.max(0, expression.parameters.length - 1)),
    parameter = expression.parameters[index];
  const commit = (next: ExpressionDocument) => {
    if (workspace.document(document.path)?.text !== document.text) {
      setIssue(tr("Expression changed while editing"));
      return;
    }
    try {
      workspace.update(document.path, serializeExpressionDocument(next));
      setIssue("");
    } catch (error) {
      setIssue(tr(error instanceof Error ? error.message : String(error)));
    }
  };
  const patch = (patch: Partial<ExpressionParameter>) =>
    commit({
      ...expression,
      parameters: expression.parameters.map((parameter, ordinal) =>
        ordinal === index ? { ...parameter, ...patch } : parameter,
      ),
    });
  return (
    <section className="motion-editor expression-editor">
      <header className="panel-heading">
        <h2>{tr("Expression editor")}</h2>
        <span>{document.path.split("/").at(-1)}</span>
      </header>
      <div className="motion-editor-panels">
        <div className="motion-editor-working">
          <label className="field">
            <span>{tr("Parameter")}</span>
            <select value={index} onChange={(event) => setSelection(Number(event.target.value))}>
              {expression.parameters.map((parameter, index) => (
                <option key={index} value={index}>
                  {parameter.id}
                </option>
              ))}
            </select>
          </label>
          {parameter && (
            <>
              <label className="field">
                <span>{tr("Value")}</span>
                <NumberInput step="any" value={parameter.value} onCommit={(value) => patch({ value })} />
              </label>
              <label className="field">
                <span>{tr("Blend operation")}</span>
                <select
                  value={parameter.blend}
                  onChange={(event) => patch({ blend: event.target.value as ExpressionBlend })}
                >
                  {(["add", "multiply", "overwrite"] as const).map((blend) => (
                    <option key={blend} value={blend}>
                      {tr(`expression.${blend}`)}
                    </option>
                  ))}
                </select>
              </label>
              {!expression.modern && (
                <label className="field">
                  <span>{tr("Reference value")}</span>
                  <NumberInput
                    step="any"
                    value={parameter.reference}
                    onCommit={(reference) => patch({ reference })}
                    onClear={() => patch({ reference: undefined })}
                  />
                </label>
              )}
              <button
                className="secondary-button"
                onClick={() => {
                  commit({
                    ...expression,
                    parameters: expression.parameters.filter((_, ordinal) => ordinal !== index),
                  });
                  setSelection(Math.max(0, index - 1));
                }}
              >
                <Trash2 size={18} />
                {tr("Remove parameter")}
              </button>
            </>
          )}
          <details>
            <summary>{tr("Add parameter")}</summary>
            <label className="field">
              <span>{tr("Parameter ID")}</span>
              <input value={parameterId} onChange={(event) => setParameterId(event.target.value)} />
            </label>
            <button
              className="secondary-button"
              disabled={
                !parameterId.trim() || expression.parameters.some((parameter) => parameter.id === parameterId.trim())
              }
              onClick={() => {
                commit({
                  ...expression,
                  parameters: [
                    ...expression.parameters,
                    { id: parameterId.trim(), value: 0, blend: "add", source: {} },
                  ],
                });
                setSelection(expression.parameters.length);
                setParameterId("");
              }}
            >
              <Plus size={18} />
              {tr("Add parameter")}
            </button>
          </details>
        </div>
        <div className="motion-editor-settings">
          <label className="field">
            <span>{tr("Fade in (s)")}</span>
            <NumberInput
              min={-1}
              step="any"
              value={expression.fadeIn}
              onCommit={(fadeIn) => commit({ ...expression, fadeIn })}
              onClear={() => commit({ ...expression, fadeIn: undefined })}
            />
          </label>
          <label className="field">
            <span>{tr("Fade out (s)")}</span>
            <NumberInput
              min={-1}
              step="any"
              value={expression.fadeOut}
              onCommit={(fadeOut) => commit({ ...expression, fadeOut })}
              onClear={() => commit({ ...expression, fadeOut: undefined })}
            />
          </label>
          <MotoriExchange workspace={workspace} document={document} kind="expression" />
          <ClipInsertion workspace={workspace} path={document.path} kind="expression" onIssue={setIssue} />
        </div>
      </div>
      <div className="motion-editor-issue" role={issue ? "alert" : undefined}>
        {issue}
      </div>
    </section>
  );
}
