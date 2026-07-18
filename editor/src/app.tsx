import { useEffect, useRef, useState } from "preact/hooks";
import { parseRig, type RigDocument } from "@articul8/core";
import { RigPlayer } from "@articul8/runtime-svg";
import { TitleBar } from "./components/TitleBar.js";
import { Viewport } from "./components/Viewport.js";
import { Layers } from "./components/Layers.js";
import { TimelinePanel } from "./components/Timeline.js";
import { StatusBar } from "./components/StatusBar.js";
import { buildOutline, outlineDuration, type OutlineEntry, type Selection } from "./state/rig-outline.js";
import { currentTheme } from "./theme.js";

export type Mode = "SETUP" | "ANIMATE";

const SAMPLE_RIG = `${import.meta.env.BASE_URL}samples/mascot.rig.json`;
const SAMPLE_ART = `${import.meta.env.BASE_URL}samples/mascot.svg`;

export function App(): preact.JSX.Element {
  const [doc, setDoc] = useState<RigDocument | null>(null);
  const [art, setArt] = useState<string>("");
  const [entries, setEntries] = useState<OutlineEntry[]>([]);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<Mode>("ANIMATE");
  const [selection, setSelection] = useState<Selection>(null);
  const [playing, setPlaying] = useState(false);
  const [rawTime, setRawTime] = useState(0);
  const [fps, setFps] = useState(60);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [activeSkin, setActiveSkin] = useState<string | null>(null);

  const playerRef = useRef<RigPlayer | null>(null);
  const blinkRef = useRef<number | null>(null);
  const fpsRef = useRef(60);
  const theme = currentTheme();

  const primaryDuration = doc?.animations?.find((a) => a.name === "idle")?.channels
    ? 6
    : Math.max(1, outlineDuration(entries));

  // load sample rig + art
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch(SAMPLE_RIG).then((r) => r.text()), fetch(SAMPLE_ART).then((r) => r.text())])
      .then(([rigText, artText]) => {
        if (cancelled) return;
        const parsed = parseRig(JSON.parse(rigText));
        setDoc(parsed);
        setArt(artText);
        const built = buildOutline(parsed);
        setEntries(built);
        setVisible(Object.fromEntries(parsed.slots.map((s) => [s.name, true])));
        setActiveSkin(parsed.skins ? (Object.keys(parsed.skins)[0] ?? null) : null);
      })
      .catch((err) => console.error("failed to load sample rig", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // create the player once the stage + doc are ready
  useEffect(() => {
    if (!stageEl || !doc) return;
    const player = new RigPlayer(stageEl, { autoplay: false });
    playerRef.current = player;
    player.load(doc, art);

    let acc = 0;
    let frames = 0;
    player.onTick = (dt: number): void => {
      setRawTime(player.time);
      acc += dt;
      frames++;
      if (acc >= 0.25) {
        fpsRef.current = frames / acc;
        setFps(fpsRef.current);
        acc = 0;
        frames = 0;
      }
    };

    applyMode("ANIMATE", player, false);
    player.tick(0); // render a static first frame; do not autoplay
    setPlaying(false);

    return () => {
      stopBlink();
      player.dispose();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageEl, doc, art]);

  function startBlink(): void {
    if (blinkRef.current) return;
    blinkRef.current = window.setInterval(() => playerRef.current?.play("blink"), 3500);
  }
  function stopBlink(): void {
    if (blinkRef.current) {
      clearInterval(blinkRef.current);
      blinkRef.current = null;
    }
  }

  function applyMode(next: Mode, player = playerRef.current, play = false): void {
    if (!player) return;
    player.stopAnimation();
    stopBlink();
    if (next === "ANIMATE") {
      player.play("idle", { loop: true });
      player.play("talk", { loop: true });
      if (play) startBlink();
    }
  }

  function toggleMode(): void {
    const next: Mode = mode === "ANIMATE" ? "SETUP" : "ANIMATE";
    setMode(next);
    applyMode(next, playerRef.current, playing);
  }

  // transport ------------------------------------------------------------
  const onPlay = (): void => {
    playerRef.current?.start();
    if (mode === "ANIMATE") startBlink();
    setPlaying(true);
  };
  const onPause = (): void => {
    playerRef.current?.pause();
    stopBlink();
    setPlaying(false);
  };
  const onStop = (): void => {
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    stopBlink();
    p.time = 0;
    applyMode(mode, p, false);
    setRawTime(0);
    setPlaying(false);
    p.tick(0);
  };
  const onStep = (): void => {
    playerRef.current?.tick(1 / 60);
  };
  const onScrub = (seconds: number): void => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isRunning) {
      p.pause();
      setPlaying(false);
    }
    const dur = primaryDuration > 0 ? primaryDuration : 1;
    const t = Math.max(0, Math.min(seconds, dur));
    p.seek(t);
    setRawTime(t);
  };

  // look input -----------------------------------------------------------
  const onLook = (nx: number, ny: number): void => {
    playerRef.current?.setInput("look", { x: nx, y: ny });
  };
  const onLookEnd = (): void => {
    playerRef.current?.setInput("look", { x: 0, y: 0 });
  };

  // layers ---------------------------------------------------------------
  const onToggleVisible = (name: string): void => {
    setVisible((v) => {
      const nv = { ...v, [name]: !(v[name] ?? true) };
      const slot = playerRef.current?.skeleton?.slots.find((s) => s.name === name);
      if (slot) {
        slot.visible = nv[name]!;
        const el = (slot.attachment as { element?: SVGElement } | null)?.element;
        if (el) el.style.display = nv[name] ? "" : "none";
      }
      return nv;
    });
  };
  const onSkin = (name: string): void => {
    playerRef.current?.setSkin(name);
    setActiveSkin(name);
  };

  const skins = doc?.skins ? Object.keys(doc.skins) : [];
  const selLabel = selection ? `${selection.kind}: ${selection.id}` : "no selection";

  return (
    <div class="shell">
      <TitleBar />
      <Viewport stageRef={setStageEl} onLook={onLook} onLookEnd={onLookEnd} mode={mode} />
      <Layers
        doc={doc}
        visible={visible}
        selection={selection}
        skins={skins}
        activeSkin={activeSkin}
        onSelect={setSelection}
        onToggleVisible={onToggleVisible}
        onSkin={onSkin}
      />
      <TimelinePanel
        entries={entries}
        selection={selection}
        onSelect={setSelection}
        playing={playing}
        time={primaryDuration > 0 ? rawTime % primaryDuration : rawTime}
        duration={primaryDuration}
        theme={theme}
        mode={mode}
        onPlay={onPlay}
        onPause={onPause}
        onStop={onStop}
        onStep={onStep}
        onScrub={onScrub}
      />
      <StatusBar mode={mode} onToggleMode={toggleMode} fps={fps} status={selLabel} />
    </div>
  );
}
