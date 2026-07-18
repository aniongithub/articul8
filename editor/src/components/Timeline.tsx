import { useEffect, useRef } from "preact/hooks";
import { DataSet, Timeline } from "vis-timeline/standalone";
import type { DataGroup, DataItem, TimelineOptions } from "vis-timeline/standalone";
import type { OutlineEntry, Selection } from "../state/rig-outline.js";
import type { Mode } from "../app.js";

interface Props {
  entries: OutlineEntry[];
  selection: Selection;
  onSelect: (sel: Selection) => void;
  playing: boolean;
  time: number;
  duration: number;
  theme: string;
  mode: Mode;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onStep: () => void;
  onScrub: (seconds: number) => void;
}

const PLAYHEAD = "playhead";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function labelHtml(e: OutlineEntry): string {
  const name = `<span class="nm">${esc(e.label)}</span>`;
  const kind = e.sub ? `<span class="kd">${esc(e.sub)}</span>` : "";
  return `<span class="lbl ${e.kind}">${name}${kind}</span>`;
}

interface Built {
  groups: DataGroup[];
  items: DataItem[];
  /** group id -> selectable entity */
  entityByGroup: Map<string, Selection>;
  /** item id -> selectable entity */
  entityByItem: Map<string, Selection>;
}

/**
 * Convert the flat outline (group row followed by its channel rows) into
 * vis-timeline nested groups (the tree) plus keyframe point items. vis owns the
 * label column, the lane alignment, and the shared vertical scroll — so there is
 * nothing to sync by hand.
 */
function build(entries: OutlineEntry[]): Built {
  const groups: (DataGroup & { treeLevel?: number })[] = [];
  const items: DataItem[] = [];
  const entityByGroup = new Map<string, Selection>();
  const entityByItem = new Map<string, Selection>();

  let children: (string | number)[] | null = null;
  for (const e of entries) {
    entityByGroup.set(e.id, e.entity ?? null);
    if (e.kind === "group") {
      children = [];
      groups.push({
        id: e.id,
        content: labelHtml(e),
        className: "grp",
        nestedGroups: children,
        showNested: true,
        treeLevel: 1,
      });
    } else {
      groups.push({ id: e.id, content: labelHtml(e), className: "chan", treeLevel: 2 });
      children?.push(e.id);
      e.keyframes.forEach((k, i) => {
        const id = `${e.id}@${i}`;
        items.push({ id, group: e.id, start: k.time * 1000, type: "point", content: "", className: "kf" });
        entityByItem.set(id, e.entity ?? null);
      });
    }
  }
  return { groups, items, entityByGroup, entityByItem };
}

function options(durationMs: number): TimelineOptions {
  return {
    orientation: { axis: "top", item: "top" },
    showCurrentTime: false,
    min: 0,
    max: durationMs,
    start: 0,
    end: durationMs,
    zoomable: true,
    moveable: true,
    horizontalScroll: false,
    zoomKey: "ctrlKey",
    verticalScroll: true,
    snap: null,
    stack: false,
    selectable: true,
    groupHeightMode: "fixed",
    margin: { item: 0, axis: 2 },
    format: {
      minorLabels: (date: Date | { valueOf(): number }) => `${(date.valueOf() / 1000).toFixed(2)}s`,
      majorLabels: () => "",
    },
  };
}

export function TimelinePanel(props: Props): preact.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const tlRef = useRef<Timeline | null>(null);  const groupsRef = useRef<DataSet<DataGroup> | null>(null);
  const entityByGroupRef = useRef<Map<string, Selection>>(new Map());
  const entityByItemRef = useRef<Map<string, Selection>>(new Map());
  const rawGroupsRef = useRef<DataGroup[]>([]);
  // always-current props for vis event handlers registered once at create time.
  const propsRef = useRef(props);
  propsRef.current = props;
  // true while the user is dragging the playhead (suppresses clock-driven sync).
  const draggingRef = useRef(false);

  // (re)create the timeline whenever the outline or its length changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { groups, items, entityByGroup, entityByItem } = build(props.entries);
    entityByGroupRef.current = entityByGroup;
    entityByItemRef.current = entityByItem;
    rawGroupsRef.current = groups;

    const groupsDs = new DataSet<DataGroup>(groups);
    const itemsDs = new DataSet<DataItem>(items);
    groupsRef.current = groupsDs;

    const tl = new Timeline(host, itemsDs, groupsDs, options(Math.max(props.duration, 1) * 1000));
    tlRef.current = tl;
    tl.addCustomTime(0, PLAYHEAD);

    tl.on("select", (p: { items?: (string | number)[] }) => {
      const id = p.items?.[0];
      if (id != null) propsRef.current.onSelect(entityByItemRef.current.get(String(id)) ?? null);
    });
    tl.on("click", (p: { what?: string; group?: string | number | null }) => {
      if (p.what === "group-label" && p.group != null) {
        propsRef.current.onSelect(entityByGroupRef.current.get(String(p.group)) ?? null);
      }
    });

    // dragging the playhead scrubs the pose. vis hands us a Moment, not a Date,
    // so read epoch ms via valueOf() and convert to seconds.
    const scrub = (p: { id?: string | number; time: { valueOf(): number } }): void => {
      if (String(p.id) !== PLAYHEAD) return;
      propsRef.current.onScrub(p.time.valueOf() / 1000);
    };
    tl.on("timechange", (p: { id?: string | number; time: { valueOf(): number } }) => {
      draggingRef.current = true;
      scrub(p);
    });
    tl.on("timechanged", (p: { id?: string | number; time: { valueOf(): number } }) => {
      scrub(p);
      draggingRef.current = false;
    });

    return () => {
      tl.destroy();
      tlRef.current = null;
      groupsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.entries]);

  // drive the playhead from the runtime clock (but not while the user drags it).
  useEffect(() => {
    if (draggingRef.current) return;
    tlRef.current?.setCustomTime(props.time * 1000, PLAYHEAD);
  }, [props.time]);

  // reflect the current selection onto the group labels (no rebuild).
  useEffect(() => {
    const ds = groupsRef.current;
    if (!ds) return;
    const sel = props.selection;
    const updates = rawGroupsRef.current.map((g) => {
      const ent = entityByGroupRef.current.get(String(g.id));
      const on = !!sel && !!ent && ent.kind === sel.kind && ent.id === sel.id;
      const base = (g.className ?? "").replace(/\s*sel\b/g, "");
      return { id: g.id, className: on ? `${base} sel` : base };
    });
    ds.update(updates);
  }, [props.selection]);

  const fmt = (t: number): string => `${t.toFixed(2)}s`;

  return (
    <div class="panel timeline">
      <div class="transport">
        {props.playing ? (
          <button class="primary" onClick={props.onPause} title="Pause">
            ❚❚
          </button>
        ) : (
          <button class="primary" onClick={props.onPlay} title="Play">
            ▶
          </button>
        )}
        <button class="icon" onClick={props.onStop} title="Stop">
          ■
        </button>
        <button class="icon" onClick={props.onStep} title="Step frame">
          ▶❘
        </button>
        <span class="time">
          {fmt(props.time)} / {fmt(props.duration)}
        </span>
        <span class="spacer" />
        <span class="eyebrow" style="padding:0">
          {props.mode === "ANIMATE" ? "Auto-key on manipulation" : "Setup pose"}
        </span>
      </div>

      <div class="dope" ref={hostRef} />
    </div>
  );
}
