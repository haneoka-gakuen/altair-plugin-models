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
      <style>{MODEL_EDITOR_CSS}</style>
      {document && <ModelEditor session={workspace} document={document} />}
    </>
  );
}
export const mountModelEditor = (host: HTMLElement, context: AltairPanelContext) =>
  mountReactEditor(host, context, <Panel />);
