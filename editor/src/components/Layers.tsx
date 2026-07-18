import type { RigDocument } from "@articul8/core";
import type { Selection } from "../state/rig-outline.js";

interface Props {
  doc: RigDocument | null;
  visible: Record<string, boolean>;
  selection: Selection;
  skins: string[];
  activeSkin: string | null;
  onSelect: (sel: Selection) => void;
  onToggleVisible: (slot: string) => void;
  onSkin: (skin: string) => void;
}

/** Right pane: slots as layers (top = front), visibility, attachment, skin. */
export function Layers({
  doc,
  visible,
  selection,
  skins,
  activeSkin,
  onSelect,
  onToggleVisible,
  onSkin,
}: Props): preact.JSX.Element {
  const slots = doc ? [...doc.slots].sort((a, b) => b.drawOrder - a.drawOrder) : [];
  return (
    <div class="panel layers">
      <div class="eyebrow">Layers</div>
      {skins.length > 1 && (
        <div class="skinbar">
          <span class="eyebrow" style="padding:0">
            Skin
          </span>
          <select value={activeSkin ?? ""} onChange={(e) => onSkin((e.target as HTMLSelectElement).value)}>
            {skins.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
      <div class="list">
        {slots.map((s) => {
          const isVis = visible[s.name] ?? true;
          const selected = selection?.kind === "slot" && selection.id === s.name;
          return (
            <div
              key={s.name}
              class={`row${selected ? " selected" : ""}${isVis ? "" : " hidden"}`}
              onClick={() => onSelect({ kind: "slot", id: s.name })}
            >
              <span
                class="vis"
                title="Toggle visibility"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisible(s.name);
                }}
              >
                {isVis ? "●" : "○"}
              </span>
              <span class="name">{s.name}</span>
              <span class="meta">{s.attachment ?? "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
