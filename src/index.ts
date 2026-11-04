import { defineAltairPlugin } from "@haneoka/altair";
import { expressionDocumentEditor } from "./expression-document.js";
export * from "./expression-document.js";
export * from "./motori-clips.js";
import { motionDocumentEditor } from "./motion-document.js";
export { motionDocumentEditor } from "./motion-document.js";
export * from "./motion-curves.js";
import { modelDocumentEditor } from "./document.js";
export { modelDocumentEditor } from "./document.js";
export const altairModelsPlugin = defineAltairPlugin({
  manifest: {
    id: "haneoka.altair-models",
    name: "Model tools",
    version: "0.1.0",
    apiVersion: 2,
    dependencies: { "haneoka.altair-adv": "^0.1.0" },
    capabilities: ["editor", "panel"],
  },
  setup(context) {
    context.contribute("document-editor", modelDocumentEditor);
    context.contribute("document-editor", motionDocumentEditor);
    context.contribute("document-editor", expressionDocumentEditor);
    context.contribute("panel", {
      id: expressionDocumentEditor.panelId!,
      slot: "document",
      async mount(host, panelContext) {
        const { mountModelEditor } = await import("./panel.js");
        panelContext.signal.throwIfAborted();
        return mountModelEditor(host, panelContext);
      },
    });
    context.contribute("panel", {
      id: motionDocumentEditor.panelId!,
      slot: "document",
      async mount(host, panelContext) {
        const { mountModelEditor } = await import("./panel.js");
        panelContext.signal.throwIfAborted();
        return mountModelEditor(host, panelContext);
      },
    });
    context.contribute("panel", {
      id: modelDocumentEditor.panelId!,
      slot: "document",
      async mount(host, panelContext) {
        const { mountModelEditor } = await import("./panel.js");
        panelContext.signal.throwIfAborted();
        return mountModelEditor(host, panelContext);
      },
    });
  },
});
export default altairModelsPlugin;
