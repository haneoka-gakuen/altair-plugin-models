import { ExpressionEditor } from "./ExpressionEditor.js";
import { expressionDocumentEditor } from "./expression-document.js";
import { MotionEditor } from "./MotionEditor.js";
import { motionDocumentEditor } from "./motion-document.js";
import { MOTION_EDITOR_CSS } from "./motion-styles.js";
import { useSyncExternalStore } from "react";
import type { AltairPanelContext } from "@haneoka/altair";
import { mountReactEditor, useEditorWorkspace } from "@haneoka/altair-ui-react";
import { ModelEditor } from "./ModelEditor.js";
import { MODEL_EDITOR_CSS } from "./styles.js";

function Panel() {
  const workspace = useEditorWorkspace(),
    snapshot = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const document = snapshot.documents.find((document) => document.path === snapshot.active);
  return (
    <>
      <style>
        {MODEL_EDITOR_CSS}
        {MOTION_EDITOR_CSS}
      </style>
      {document &&
        (expressionDocumentEditor.matches(document.path) ? (
          <ExpressionEditor key={document.path} workspace={workspace} document={document} />
        ) : motionDocumentEditor.matches(document.path) ? (
          <MotionEditor workspace={workspace} document={document} />
        ) : (
          <ModelEditor session={workspace} document={document} />
        ))}
    </>
  );
}
export const mountModelEditor = (host: HTMLElement, context: AltairPanelContext) =>
  mountReactEditor(host, context, <Panel />);
