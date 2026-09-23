export const modelDocumentPath = (path: string): boolean => /(?:^|\/)model\.ya?ml$|\.model\.ya?ml$/iu.test(path);
export const modelResourceFormat = (path: string): string | undefined => {
  if (modelDocumentPath(path)) return "composite";
  if (/\.model3\.json$/iu.test(path)) return "cubism3";
  if (/\.model\.json$/iu.test(path)) return "cubism2";
  if (/\.gif$/iu.test(path)) return "gif";
  if (/\.(mp4|webm|ogv)$/iu.test(path)) return "video";
  if (/\.(png|jpe?g|webp|avif|svg)$/iu.test(path)) return "static-portrait";
  return undefined;
};
export function relativeModelPath(model: string, source: string): string {
  const directory = model.split("/").slice(0, -1),
    target = source.split("/");
  let shared = 0;
  while (shared < directory.length && directory[shared] === target[shared]) shared++;
  return [...directory.slice(shared).map(() => ".."), ...target.slice(shared)].join("/");
}

export async function convertWorkspaceModels<T extends object>(
  workspace: T,
  files: readonly import("@haneoka/altair").AltairEditorFile[],
): Promise<{
  workspace: T;
  files: readonly import("@haneoka/altair").AltairEditorFile[];
}> {
  const entries: {
    model: Record<string, unknown>;
    profile: Record<string, unknown>;
  }[] = [];
  const collect = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    const record = value as Record<string, unknown>;
    const runtime = record.runtime as Record<string, unknown> | undefined;
    if (runtime?.format === "composite" && typeof runtime.model === "string" && /\.(jsonl|wmdl)$/iu.test(runtime.model))
      entries.push({
        model: runtime,
        profile: (record.profile ?? {}) as Record<string, unknown>,
      });
    Object.values(record).forEach(collect);
  };
  const copy = structuredClone(workspace);
  collect(copy);
  if (!entries.length) return { workspace, files };
  const [{ importJsonlModel, importWmdlModel }, { serializeCompositeModel, resolveModelSource }] = await Promise.all([
    import("@haneoka/vega-plugin-composite/import"),
    import("@haneoka/vega-plugin-composite/model"),
  ]);
  const available = new Map(files.map((file) => [file.path, file])),
    converted = new Map<string, string>(),
    generated: import("@haneoka/altair").AltairEditorFile[] = [],
    processing = new Set<string>(),
    reserved = new Set(files.map((file) => file.path));
  const resolve = (path: string) =>
    available.has(path) ? path : available.has(path.replace(/^\//u, "")) ? path.replace(/^\//u, "") : undefined;
  const convert = async (path: string, layout: Record<string, unknown>): Promise<string> => {
    const ready = converted.get(path);
    if (ready) return ready;
    if (processing.size >= 32) throw new Error(`Model nesting is too deep: ${path}`);
    if (processing.has(path)) throw new Error(`Cyclic model composition: ${path}`);
    const file = available.get(path);
    if (!file) return path;
    processing.add(path);
    try {
      const options = {
        width: Number(layout.referenceWidth ?? 2560),
        height: Number(layout.referenceHeight ?? 1440),
        scale: Number(layout.scale ?? 1),
      };
      const text = await file.blob.text();
      const imported = /\.jsonl$/iu.test(path) ? importJsonlModel(text, options) : importWmdlModel(text, options);
      const stem = path.replace(/\.(jsonl|wmdl)$/iu, "");
      let target = `${stem}.model.yaml`,
        suffix = 2;
      while (reserved.has(target)) target = `${stem}_${suffix++}.model.yaml`;
      reserved.add(target);
      const parts = [];
      for (const part of imported.document.parts) {
        if (part.format !== "composite" || !/\.(jsonl|wmdl)$/iu.test(part.source)) {
          parts.push(part);
          continue;
        }
        const resolved = resolve(part.options?.projectRoot ? part.source : resolveModelSource(path, part.source));
        if (!resolved) {
          parts.push(part);
          continue;
        }
        const nested = await convert(resolved, layout);
        parts.push({
          ...part,
          source: part.options?.projectRoot ? nested : relativeModelPath(target, nested),
        });
      }
      generated.push({
        path: target,
        blob: new Blob([serializeCompositeModel({ ...imported.document, parts })], { type: "text/yaml" }),
      });
      converted.set(path, target);
      return target;
    } finally {
      processing.delete(path);
    }
  };
  for (const entry of entries) {
    const source = resolve(String(entry.model.model));
    if (!source) continue;
    const layout = entry.profile.placement as Record<string, unknown> | undefined;
    entry.model.model = await convert(source, layout ?? {});
    delete entry.model.sourceFormat;
  }
  const rewrite = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(rewrite);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      if (
        ["source", "url", "model", "modelUrl", "imageUrl", "path", "live2dKey", "figureRef", "characterKey"].includes(
          key,
        ) &&
        typeof item === "string" &&
        converted.has(item)
      )
        record[key] = converted.get(item)!;
      else rewrite(item);
    }
  };
  rewrite(copy);
  return {
    workspace: copy,
    files: [...files.filter((file) => !converted.has(file.path)), ...generated],
  };
}

export const MODEL_PREVIEW_BACKGROUND = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="576"><defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path fill="#e9ebf0" d="M0 0h32v32H0z"/><path fill="#d9dde6" d="M0 0h16v16H0zM16 16h16v16H16z"/></pattern></defs><path fill="url(#grid)" d="M0 0h1024v576H0z"/></svg>')}`;
