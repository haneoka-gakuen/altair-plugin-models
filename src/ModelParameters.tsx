import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { NumberInput, useEditorTranslator } from "@haneoka/altair-ui-react";

export function ModelParameters({
  values,
  onChange,
  onApplyToAll,
}: {
  values: Readonly<Record<string, number>>;
  onChange(values: Readonly<Record<string, number>>): void;
  onApplyToAll?: () => void;
}) {
  const tr = useEditorTranslator();
  const [name, setName] = useState("");
  const key = name.trim();
  const add = () => {
    if (!key || Object.hasOwn(values, key)) return;
    onChange({ ...values, [key]: 0 });
    setName("");
  };
  return (
    <fieldset className="model-parameters">
      <legend>{tr("Model parameters")}</legend>
      {Object.entries(values).map(([id, value]) => (
        <div className="model-parameter-row" key={id}>
          <label className="field">
            <span title={id}>{id}</span>
            <NumberInput
              aria-label={tr("Parameter {{id}}", { id })}
              step="any"
              value={value}
              onCommit={(next) => onChange({ ...values, [id]: next })}
            />
          </label>
          <button
            aria-label={tr("Remove parameter {{id}}", { id })}
            title={tr("Remove parameter {{id}}", { id })}
            onClick={() => {
              const next = { ...values };
              delete next[id];
              onChange(next);
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <div className="model-parameter-add">
        <label className="field">
          {tr("Parameter ID")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
        </label>
        <button disabled={!key || Object.hasOwn(values, key)} onClick={add}>
          <Plus size={15} />
          {tr("Add parameter")}
        </button>
      </div>
      {onApplyToAll && (
        <button disabled={!Object.keys(values).length} onClick={onApplyToAll}>
          {tr("Apply parameters to all model layers")}
        </button>
      )}
    </fieldset>
  );
}
