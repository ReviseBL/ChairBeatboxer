"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type Direction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";
type CardinalDirection = "up" | "down" | "left" | "right";
type GameStatus = "menu" | "playing" | "gameover";
type NoteBase = { id: number; bornAt: number; travelTime: number };
type Note = NoteBase & ({ kind: "arrow"; direction: Direction } | { kind: "server" });
type ScoreRow = { id: number; nickname: string; score: number; maxCombo: number };
type WorkDrop = { id: number; kind: "laptop" | "docs" | "phone"; side: "left" | "right" };
type LaneImpact = { id: number; type: "hit" | "perfect" | "miss"; label: string };

const DIRECTION_META: Record<
  Direction,
  { symbol: string; keys: string[]; label: string }
> = {
  "up-left": { symbol: "↖", keys: ["q", "Q", "Numpad7"], label: "skos góra-lewo" },
  up: { symbol: "↑", keys: ["ArrowUp", "Numpad8"], label: "góra" },
  "up-right": { symbol: "↗", keys: ["e", "E", "Numpad9"], label: "skos góra-prawo" },
  left: { symbol: "←", keys: ["ArrowLeft", "Numpad4"], label: "lewo" },
  right: { symbol: "→", keys: ["ArrowRight", "Numpad6"], label: "prawo" },
  "down-left": { symbol: "↙", keys: ["z", "Z", "Numpad1"], label: "skos dół-lewo" },
  down: { symbol: "↓", keys: ["ArrowDown", "Numpad2"], label: "dół" },
  "down-right": { symbol: "↘", keys: ["c", "C", "Numpad3"], label: "skos dół-prawo" },
};

const DIRECTIONS: Direction[] = [
  "up-left",
  "up",
  "up-right",
  "left",
  "right",
  "down-left",
  "down",
  "down-right",
];
const CARDINAL_ARROW_KEYS: Record<string, CardinalDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};
const ARROW_CHORD_WINDOW = 105;
const GAME_OVER_OVERLAY_DELAY = 1400;
const HIT_CENTER = 13;
const HIT_WINDOW = 6.5;
const STARTING_SPIN = 100;
const CHAIR_VIEWS = [
  "/assets/chair-beatboxer-character.png",
  "/assets/chair-front-right.png",
  "/assets/chair-right.png",
  "/assets/chair-back-right.png",
  "/assets/chair-back.png",
  "/assets/chair-back-left.png",
  "/assets/chair-left.png",
  "/assets/chair-front-left.png",
];

function randomDirection() {
  return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
}

function diagonalFromCardinals(
  first: CardinalDirection,
  second: CardinalDirection,
): Direction | null {
  const pair = new Set([first, second]);
  if (pair.has("up") && pair.has("left")) return "up-left";
  if (pair.has("up") && pair.has("right")) return "up-right";
  if (pair.has("down") && pair.has("left")) return "down-left";
  if (pair.has("down") && pair.has("right")) return "down-right";
  return null;
}

function useBeatboxEngine() {
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);
  const volumeRef = useRef(0.55);

  const setVolume = useCallback((value: number) => {
    volumeRef.current = value;
    const context = contextRef.current;
    const master = masterRef.current;
    if (context && master) {
      master.gain.setTargetAtTime(value * 0.34, context.currentTime, 0.03);
    }
  }, []);

  const kick = useCallback((context: AudioContext, output: AudioNode, loud = 1) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(155, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(48, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.58 * loud, context.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    osc.connect(gain).connect(output);
    osc.start();
    osc.stop(context.currentTime + 0.2);
  }, []);

  const noiseHit = useCallback(
    (context: AudioContext, output: AudioNode, type: "snare" | "hat", loud = 1) => {
      const length = type === "snare" ? 0.14 : 0.045;
      const buffer = context.createBuffer(1, context.sampleRate * length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      filter.type = type === "snare" ? "bandpass" : "highpass";
      filter.frequency.value = type === "snare" ? 1750 : 6800;
      gain.gain.value = (type === "snare" ? 0.32 : 0.12) * loud;
      source.connect(filter).connect(gain).connect(output);
      source.start();
    },
    [],
  );

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    let context = contextRef.current;
    if (!context) {
      context = new AudioContext();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      master.gain.value = volumeRef.current * 0.34;
      master.connect(compressor).connect(context.destination);
      contextRef.current = context;
      masterRef.current = master;
    }
    void context.resume();
    if (timerRef.current) return;
    const playStep = () => {
      const activeContext = contextRef.current;
      const master = masterRef.current;
      if (!activeContext || !master) return;
      const step = stepRef.current++ % 16;
      if (step % 4 === 0) kick(activeContext, master, step === 0 ? 1.15 : 0.8);
      if (step === 4 || step === 12) noiseHit(activeContext, master, "snare", 1);
      if (step % 2 === 0) noiseHit(activeContext, master, "hat", step % 4 ? 0.65 : 1);
    };
    playStep();
    timerRef.current = setInterval(playStep, 125);
  }, [kick, noiseHit]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    stepRef.current = 0;
  }, []);

  const accent = useCallback(() => {
    const context = contextRef.current;
    const master = masterRef.current;
    if (!context || !master) return;
    const volume = volumeRef.current;
    const normalLevel = Math.max(0.001, volume * 0.34);
    const peakLevel = Math.max(0.001, volume * 0.72);
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setValueAtTime(Math.max(master.gain.value, normalLevel), context.currentTime);
    master.gain.linearRampToValueAtTime(peakLevel, context.currentTime + 0.06);
    master.gain.setValueAtTime(peakLevel, context.currentTime + 0.42);
    master.gain.exponentialRampToValueAtTime(normalLevel, context.currentTime + 1);
  }, []);

  useEffect(() => () => stop(), [stop]);
  return useMemo(() => ({ start, stop, accent, setVolume }), [accent, setVolume, start, stop]);
}

export default function Home() {
  const [status, setStatus] = useState<GameStatus>("menu");
  const [nickname, setNickname] = useState("");
  const [volume, setVolume] = useState(55);
  const [notes, setNotes] = useState<Note[]>([]);
  const [clock, setClock] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [chairFrame, setChairFrame] = useState(0);
  const [spinEnergy, setSpinEnergy] = useState(STARTING_SPIN);
  const [feedback, setFeedback] = useState("READY?");
  const [leaderboard, setLeaderboard] = useState<ScoreRow[]>([]);
  const [rankingState, setRankingState] = useState<"loading" | "ready" | "offline">("loading");
  const [workDrops, setWorkDrops] = useState<WorkDrop[]>([]);
  const [visitor, setVisitor] = useState<{ id: number; side: "left" | "right" } | null>(null);
  const [laneImpact, setLaneImpact] = useState<LaneImpact | null>(null);
  const [showGameOver, setShowGameOver] = useState(false);

  const statusRef = useRef<GameStatus>(status);
  const notesRef = useRef<Note[]>([]);
  const startTimeRef = useRef(0);
  const nextSpawnRef = useRef(0);
  const nextServerSpawnRef = useRef(0);
  const nextIdRef = useRef(1);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const spinEnergyRef = useRef(STARTING_SPIN);
  const rotationPhaseRef = useRef(0);
  const lastSpinTickRef = useRef(0);
  const scoreSentRef = useRef(false);
  const shoutRef = useRef<HTMLAudioElement | null>(null);
  const gameOverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beatbox = useBeatboxEngine();

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const loadLeaderboard = useCallback(async () => {
    try {
      const response = await fetch("/api/scores", { cache: "no-store" });
      if (!response.ok) throw new Error("ranking unavailable");
      const payload = (await response.json()) as { scores?: ScoreRow[] };
      setLeaderboard((payload.scores ?? []).slice(0, 10));
      setRankingState("ready");
    } catch {
      setRankingState("offline");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLeaderboard(), 0);
    shoutRef.current = new Audio("/assets/combo-shout.wav");
    shoutRef.current.preload = "auto";
    return () => window.clearTimeout(timer);
  }, [loadLeaderboard]);

  useEffect(() => () => {
    if (gameOverTimerRef.current) clearTimeout(gameOverTimerRef.current);
  }, []);

  useEffect(() => {
    beatbox.setVolume(volume / 100);
    if (shoutRef.current) shoutRef.current.volume = (volume / 100) * 0.22;
  }, [volume, beatbox]);

  const flashLane = useCallback((type: LaneImpact["type"], label: string) => {
    const impact = { id: Date.now() + Math.random(), type, label };
    setLaneImpact(impact);
    window.setTimeout(() => {
      setLaneImpact((current) => (current?.id === impact.id ? null : current));
    }, type === "miss" ? 480 : 380);
  }, []);

  const finishGame = useCallback(() => {
    if (statusRef.current !== "playing") return;
    statusRef.current = "gameover";
    setStatus("gameover");
    setShowGameOver(false);
    if (gameOverTimerRef.current) clearTimeout(gameOverTimerRef.current);
    gameOverTimerRef.current = setTimeout(() => {
      gameOverTimerRef.current = null;
      setShowGameOver(true);
    }, GAME_OVER_OVERLAY_DELAY);
    spinEnergyRef.current = 0;
    setSpinEnergy(0);
    setFeedback("STOP!");
    flashLane("miss", "SPIN 0%");
    setNotes([]);
    notesRef.current = [];
    beatbox.stop();

    if (!scoreSentRef.current && scoreRef.current > 0) {
      scoreSentRef.current = true;
      void fetch("/api/scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          score: scoreRef.current,
          maxCombo: maxComboRef.current,
        }),
      })
        .then(() => loadLeaderboard())
        .catch(() => setRankingState("offline"));
    }
  }, [beatbox, flashLane, loadLeaderboard, nickname]);

  const changeSpinEnergy = useCallback((delta: number) => {
    if (statusRef.current !== "playing") return false;
    const nextEnergy = Math.max(0, Math.min(100, spinEnergyRef.current + delta));
    spinEnergyRef.current = nextEnergy;
    setSpinEnergy(nextEnergy);
    if (delta < 0) {
      comboRef.current = 0;
      setCombo(0);
    }
    if (nextEnergy <= 0) {
      finishGame();
      return false;
    }
    return true;
  }, [finishGame]);

  const startGame = useCallback(() => {
    if (nickname.trim().length < 2) {
      setFeedback("WPISZ NICK!");
      return;
    }
    const now = performance.now();
    startTimeRef.current = now;
    nextSpawnRef.current = now + 850;
    nextServerSpawnRef.current = now + 7_000;
    nextIdRef.current = 1;
    notesRef.current = [];
    scoreRef.current = 0;
    comboRef.current = 0;
    maxComboRef.current = 0;
    spinEnergyRef.current = STARTING_SPIN;
    rotationPhaseRef.current = 0;
    lastSpinTickRef.current = now;
    scoreSentRef.current = false;
    if (gameOverTimerRef.current) clearTimeout(gameOverTimerRef.current);
    gameOverTimerRef.current = null;
    statusRef.current = "playing";
    setStatus("playing");
    setShowGameOver(false);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setChairFrame(0);
    setClock(now);
    setSpinEnergy(STARTING_SPIN);
    setNotes([]);
    setWorkDrops([]);
    setVisitor(null);
    setLaneImpact(null);
    setFeedback("SPIN!");
    beatbox.start();
  }, [beatbox, nickname]);

  useEffect(() => {
    if (status !== "playing") return;
    let animationFrame = 0;
    const tick = (now: number) => {
      if (statusRef.current !== "playing") return;
      const elapsed = now - startTimeRef.current;
      setClock(now);

      const currentSpinPeriod = 880 + ((100 - spinEnergyRef.current) / 100) * 2800;
      const spinDelta = Math.max(0, now - lastSpinTickRef.current);
      lastSpinTickRef.current = now;
      rotationPhaseRef.current = (rotationPhaseRef.current + (spinDelta / currentSpinPeriod) * CHAIR_VIEWS.length) % CHAIR_VIEWS.length;
      const nextChairFrame = Math.floor(rotationPhaseRef.current);
      setChairFrame((current) => (current === nextChairFrame ? current : nextChairFrame));

      if (now >= nextSpawnRef.current) {
        const travelTime = Math.max(2050, 4300 - elapsed * 0.021);
        const spawnServer = now >= nextServerSpawnRef.current;
        const nextNote: Note = spawnServer
          ? { id: nextIdRef.current++, kind: "server", bornAt: now, travelTime }
          : { id: nextIdRef.current++, kind: "arrow", direction: randomDirection(), bornAt: now, travelTime };
        if (spawnServer) {
          nextServerSpawnRef.current = now + 7_000 + Math.random() * 5_000;
        }
        notesRef.current = [...notesRef.current, nextNote];
        setNotes(notesRef.current);
        const interval = Math.max(540, 1180 - elapsed * 0.0075);
        nextSpawnRef.current = now + interval;
      }

      const expiredNotes = notesRef.current.filter((note) => {
        const x = 100 - ((now - note.bornAt) / note.travelTime) * 100;
        return x < HIT_CENTER - HIT_WINDOW;
      });
      if (expiredNotes.length > 0) {
        const expiredIds = new Set(expiredNotes.map((note) => note.id));
        const missedArrows = expiredNotes.filter((note) => note.kind === "arrow");
        const dodgedServers = expiredNotes.filter((note) => note.kind === "server");
        notesRef.current = notesRef.current.filter((note) => !expiredIds.has(note.id));
        setNotes(notesRef.current);
        if (dodgedServers.length > 0 && missedArrows.length === 0) {
          const dodgeScore = dodgedServers.length * 75;
          scoreRef.current += dodgeScore;
          setScore(scoreRef.current);
          setFeedback("DODGE!");
          flashLane("hit", `SERVER OMINIĘTY +${dodgeScore}`);
        }
        if (missedArrows.length > 0) {
          const damage = Math.min(44, missedArrows.length * 22);
          setFeedback(`MISS -${damage}`);
          flashLane("miss", `-${damage}% SPIN`);
          if (!changeSpinEnergy(-damage)) return;
        }
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [changeSpinEnergy, flashLane, status]);

  useEffect(() => {
    if (status !== "playing") return;
    const timer = setInterval(() => {
      const side = Math.random() > 0.5 ? "right" : "left";
      const id = Date.now();
      setVisitor({ id, side });
      setTimeout(() => {
        const kinds: WorkDrop["kind"][] = ["laptop", "docs", "phone"];
        setWorkDrops((items) => [
          ...items.slice(-5),
          { id, side, kind: kinds[Math.floor(Math.random() * kinds.length)] },
        ]);
      }, 2100);
      setTimeout(() => setVisitor((current) => (current?.id === id ? null : current)), 4700);
    }, 7600);
    return () => clearInterval(timer);
  }, [status]);

  const hit = useCallback(
    (direction: Direction) => {
      if (statusRef.current !== "playing") return;
      const now = performance.now();
      const hittable = [...notesRef.current]
        .map((note) => ({
          note,
          x: 100 - ((now - note.bornAt) / note.travelTime) * 100,
        }))
        .filter(({ x }) => Math.abs(x - HIT_CENTER) <= HIT_WINDOW)
        .sort((a, b) => Math.abs(a.x - HIT_CENTER) - Math.abs(b.x - HIT_CENTER))[0];

      if (hittable?.note.kind === "server") {
        notesRef.current = notesRef.current.filter((note) => note.id !== hittable.note.id);
        setNotes(notesRef.current);
        setFeedback("SERVER HIT -20");
        flashLane("miss", "SERWER! -20% SPIN");
        changeSpinEnergy(-20);
        return;
      }

      if (!hittable || hittable.note.kind !== "arrow" || hittable.note.direction !== direction) {
        if (hittable) {
          notesRef.current = notesRef.current.filter((note) => note.id !== hittable.note.id);
          setNotes(notesRef.current);
        }
        const damage = hittable ? 18 : 12;
        setFeedback(`MISS -${damage}`);
        flashLane("miss", `-${damage}% SPIN`);
        changeSpinEnergy(-damage);
        return;
      }

      notesRef.current = notesRef.current.filter((note) => note.id !== hittable.note.id);
      setNotes(notesRef.current);
      const nextCombo = comboRef.current + 1;
      const accuracy = Math.abs(hittable.x - HIT_CENTER);
      const isPerfect = accuracy <= 2.4;
      const energyGain = isPerfect ? 11 : 7;
      const nextScore = scoreRef.current + (isPerfect ? 150 : 100) + Math.min(400, nextCombo * 12);
      comboRef.current = nextCombo;
      scoreRef.current = nextScore;
      maxComboRef.current = Math.max(maxComboRef.current, nextCombo);
      setCombo(nextCombo);
      setMaxCombo(maxComboRef.current);
      setScore(nextScore);
      setFeedback(nextCombo % 5 === 0 ? "WEEE!" : isPerfect ? "PERFECT!" : nextCombo > 2 ? "FRESH!" : "HIT!");
      changeSpinEnergy(energyGain);
      flashLane(isPerfect ? "perfect" : "hit", isPerfect ? `PERFECT +${energyGain}%` : `HIT +${energyGain}%`);
      beatbox.accent();

      if (nextCombo % 5 === 0 && shoutRef.current) {
        shoutRef.current.currentTime = 0;
        void shoutRef.current.play().catch(() => undefined);
      }
    },
    [beatbox, changeSpinEnergy, flashLane],
  );

  useEffect(() => {
    let pendingArrow: {
      direction: CardinalDirection;
      timer: ReturnType<typeof setTimeout>;
    } | null = null;

    const scheduleCardinal = (direction: CardinalDirection) => {
      pendingArrow = {
        direction,
        timer: setTimeout(() => {
          pendingArrow = null;
          hit(direction);
        }, ARROW_CHORD_WINDOW),
      };
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const cardinal = CARDINAL_ARROW_KEYS[event.key] ?? CARDINAL_ARROW_KEYS[event.code];
      if (cardinal) {
        event.preventDefault();
        if (event.repeat) return;

        if (!pendingArrow) {
          scheduleCardinal(cardinal);
          return;
        }

        clearTimeout(pendingArrow.timer);
        const previous = pendingArrow.direction;
        pendingArrow = null;
        const diagonal = diagonalFromCardinals(previous, cardinal);
        if (diagonal) {
          hit(diagonal);
          return;
        }

        hit(previous);
        scheduleCardinal(cardinal);
        return;
      }

      const direction = DIRECTIONS.find((item) => {
        const keys = DIRECTION_META[item].keys;
        return keys.includes(event.key) || keys.includes(event.code);
      });
      if (!direction) return;
      event.preventDefault();
      if (!event.repeat) hit(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (pendingArrow) clearTimeout(pendingArrow.timer);
    };
  }, [hit]);

  const notePositions = useMemo(
    () =>
      notes.map((note) => ({
        ...note,
        x: Math.max(-8, 100 - ((clock - note.bornAt) / note.travelTime) * 100),
      })),
    [clock, notes],
  );

  const isSpinning = status === "playing" && spinEnergy > 0;
  const spinPeriod = Math.round(880 + ((100 - spinEnergy) / 100) * 2800);
  const bobSpeed = Math.round(Math.max(240, Math.min(680, spinPeriod / 4)));
  const spinFrame = isSpinning ? chairFrame : 0;
  const spinTone = spinEnergy > 55 ? "full" : spinEnergy > 27 ? "warning" : "danger";

  return (
    <main className="game-shell" tabIndex={0}>
      <section className="layout-grid">
        <div className="arcade-frame">
          <div className="arcade-screws" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="game-stage">
            <div className="carpet-grid" />
            <div className="office-wall office-wall-left"><span>IT</span></div>
            <div className="office-wall office-wall-back">
              <div className="poster">KEEP<br />CALM<br /><b>REBOOT</b></div>
            </div>

            <div className="stage-brand brand-lockup">
              <span className="brand-chip">16 BIT OFFICE RHYTHM • 8-WAY v1.7</span>
              <h1>CHAIR <em>BEATBOXER</em></h1>
            </div>

            <div className="hud office-hud" aria-live="polite">
              <div><span>SCORE</span><strong>{score.toString().padStart(6, "0")}</strong></div>
              <div className={combo >= 3 ? "combo-hot" : ""}><span>COMBO</span><strong>x{combo}</strong></div>
              <label className="volume-control">
                <span>VOL</span>
                <input
                  aria-label="Głośność"
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                />
                <strong>{volume}%</strong>
              </label>
            </div>

            <div className="desk">
              <div className="desk-top">
                <div className="monitor apple-device">
                  <div className="monitor-screen">
                    <span className="terminal-message">niech mi te księgowe nie zmieniają konfiguracji<i aria-hidden="true">█</i></span>
                  </div>
                  <i className="apple-mark">●</i>
                  <div className="monitor-neck" />
                </div>
                <div className="server-rack">
                  <span className="rack-led green" /><span className="rack-led" />
                  <div className="cd-slot"><div className="cd-tray"><i /></div></div>
                  <small>SERVER_01</small>
                </div>
                <div className="tablet apple-device">
                  <div className="tablet-screen"><b>ERROR</b><span>0xC0FFEE</span></div>
                  <i className="tablet-dot" />
                </div>
                <div className="keyboard-device"><i /><i /><i /><i /><i /><i /></div>
                {workDrops.map((drop, index) => (
                  <div key={drop.id} className={`work-drop work-${drop.kind} work-pos-${index % 4}`}>
                    {drop.kind === "laptop" && <><i /><span>LAPTOP</span></>}
                    {drop.kind === "docs" && <><i /><b>!</b></>}
                    {drop.kind === "phone" && <><i /><span>99+</span></>}
                  </div>
                ))}
              </div>
              <div className="desk-leg left" /><div className="desk-leg right" />
            </div>

            <div
              className={`chair-zone ${isSpinning ? "is-spinning" : "stopped"} ${status === "gameover" ? "crashed" : ""}`}
              style={{ "--bob-speed": `${bobSpeed}ms` } as React.CSSProperties}
            >
              <div className="chair-shadow" />
              <div
                className="chair-views"
                role="img"
                aria-label="Beatboxer obracający się na fotelu biurowym"
              >
                {CHAIR_VIEWS.map((src, index) => (
                  <Image
                    key={src}
                    className={`chair-view ${spinFrame === index ? "active" : ""}`}
                    src={src}
                    alt=""
                    aria-hidden="true"
                    width={1254}
                    height={1254}
                    priority
                    unoptimized
                  />
                ))}
              </div>
              <Image
                className="chair-fall"
                src="/assets/chair-fall.png"
                alt="Beatboxer, który przewrócił się razem z fotelem"
                width={1254}
                height={1254}
                unoptimized
              />
              <div className="chair-crash-debris" aria-hidden="true"><i /><i /><i /><i /></div>
              {feedback !== "WEEE!" && <div className="speech-burst" key={`${feedback}-${combo}`}>{feedback}</div>}
              {feedback === "WEEE!" && (
                <div className="combo-celebration" key={`combo-${combo}`}>Łiiiiiiiiiii!</div>
              )}
            </div>

            <div
              className={`character-spin-meter spin-${spinTone}`}
              role="progressbar"
              aria-label="Energia obrotu"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(spinEnergy)}
            >
              <span>SPIN</span>
              <div className="spin-track" aria-hidden="true">
                <span className="spin-fill" style={{ transform: `scaleX(${spinEnergy / 100})` }} />
                <i className="spin-glint" />
              </div>
              <strong>{Math.round(spinEnergy)}%</strong>
            </div>

            <div className="cabinet cabinet-one"><i /><i /><b>OPS</b></div>
            <div className="cabinet cabinet-two"><i /><i /><b>GEAR</b></div>
            <div className="floor-cable"><i /><i /><i /></div>

            {visitor && (
              <div className={`visitor visitor-${visitor.side}`}>
                <div className="visitor-head" />
                <div className="visitor-body"><span>+1<br />TASK</span></div>
                <div className="visitor-legs"><i /><i /></div>
              </div>
            )}

            <aside className="leaderboard-panel">
              <div className="panel-header"><span>LIVE</span><h2>TOP 10 SUPPORT</h2></div>
              <div className="ranking-list">
                {rankingState === "loading" && <p className="ranking-empty">ŁADOWANIE WYNIKÓW…</p>}
                {rankingState === "offline" && <p className="ranking-empty">RANKING WRÓCI PO REBOOCIE.</p>}
                {rankingState === "ready" && leaderboard.length === 0 && <p className="ranking-empty">BĄDŹ PIERWSZYM<br />BEATBOXEREM.</p>}
                {leaderboard.slice(0, 10).map((row, index) => (
                  <div className={`rank-row ${index < 3 ? `podium podium-${index + 1}` : ""}`} key={row.id}>
                    <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{row.nickname}</strong><small>MAX x{row.maxCombo}</small></div>
                    <b>{row.score.toLocaleString("pl-PL")}</b>
                  </div>
                ))}
              </div>
              <div className="panel-tip">
                <span>TIP_01</span>
                <p>Tempo rośnie z każdą sekundą. Pilnuj pola <b>HIT</b>.</p>
              </div>
              <div className="pixel-equalizer" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} />)}</div>
            </aside>

            <div className="rhythm-lane" aria-label="Tor rytmiczny">
              <div className={`hit-zone ${laneImpact ? `zone-${laneImpact.type}` : ""}`} key={laneImpact ? `zone-${laneImpact.id}` : "zone-idle"}><span>HIT</span></div>
              <div className="lane-lines"><i /><i /><i /></div>
              {notePositions.map((note) => note.kind === "server" ? (
                <div
                  key={note.id}
                  className="rhythm-note note-server"
                  style={{ left: `${note.x}%` }}
                  aria-label="Przeszkoda: serwer — nie naciskaj strzałki"
                >
                  <Image src="/assets/server-obstacle.png" alt="" width={96} height={96} unoptimized />
                  <b>OMIŃ</b>
                </div>
              ) : (
                <div
                  key={note.id}
                  className={`rhythm-note note-${note.direction}`}
                  style={{ left: `${note.x}%` }}
                  aria-label={`Strzałka ${DIRECTION_META[note.direction].label}`}
                >
                  {DIRECTION_META[note.direction].symbol}
                </div>
              ))}
              {laneImpact && (
                <div className={`lane-impact impact-${laneImpact.type}`} key={`impact-${laneImpact.id}`}>
                  <i /><i /><i /><i />
                  <strong>{laneImpact.label}</strong>
                </div>
              )}
              <div className="lane-label">FLOW →</div>
            </div>

            <div className="touch-controls" aria-label="Sterowanie dotykowe">
              {DIRECTIONS.map((direction) => (
                <button
                  className={`touch-${direction}`}
                  key={direction}
                  onPointerDown={() => hit(direction)}
                  aria-label={DIRECTION_META[direction].label}
                >
                  {DIRECTION_META[direction].symbol}
                </button>
              ))}
            </div>

            {status === "menu" && (
              <div className="game-overlay start-overlay">
                <div className="overlay-card menu-card">
                  <div className="menu-title-row">
                    <span className="eyebrow">NOWA ZMIANA</span>
                    <b>16-BIT OFFICE MODE</b>
                  </div>
                  <h2>ZABOXUJ<br />TEN TICKET</h2>
                  <p className="menu-intro">Trafiaj strzałki w ośmiu kierunkach, podkręcaj combo i utrzymuj fotel w ruchu. Im więcej energii, tym szybszy obrót.</p>
                  <div className="menu-rules">
                    <div><b>8 KIERUNKÓW</b><span>Skosy: dwie strzałki naraz lub Q / E / Z / C.</span></div>
                    <div className="rule-danger"><b>SERWER</b><span>Nie naciskaj nic — pozwól mu przejechać.</span></div>
                  </div>
                  <label className="menu-field">
                    <span>TWÓJ NICK</span>
                    <input
                      value={nickname}
                      maxLength={16}
                      placeholder="np. REVISE"
                      onChange={(event) => setNickname(event.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                      onKeyDown={(event) => { if (event.key === "Enter") startGame(); }}
                    />
                  </label>
                  <label className="menu-volume">
                    <span>GŁOŚNOŚĆ MUZYKI</span>
                    <input
                      aria-label="Głośność muzyki w menu"
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={(event) => setVolume(Number(event.target.value))}
                    />
                    <strong>{volume}%</strong>
                  </label>
                  <button className="primary-button" onClick={startGame}>START GAME <b>↵</b></button>
                  <small>PROSTE: ← ↑ ↓ → • SKOSY: ŁĄCZ 2 STRZAŁKI, Q E Z C LUB NUMPAD 7 9 1 3 • TOP 10</small>
                </div>
              </div>
            )}

            {status === "gameover" && showGameOver && (
              <div className="game-overlay gameover-overlay">
                <div className="overlay-card">
                  <span className="eyebrow danger">SHIFT FAILED</span>
                  <h2>GAME<br />OVER</h2>
                  <div className="final-stats"><div><span>SCORE</span><b>{score}</b></div><div><span>MAX COMBO</span><b>x{maxCombo}</b></div></div>
                  <p>Energia obrotu spadła do zera i krzesło stanęło. Wynik gracza <strong>{nickname}</strong> trafia do rankingu.</p>
                  <label className="menu-volume gameover-volume">
                    <span>GŁOŚNOŚĆ MUZYKI</span>
                    <input
                      aria-label="Głośność muzyki po zakończeniu gry"
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={(event) => setVolume(Number(event.target.value))}
                    />
                    <strong>{volume}%</strong>
                  </label>
                  <button className="primary-button retry" onClick={startGame}>JESZCZE RAZ <b>↻</b></button>
                </div>
              </div>
            )}
          </div>
          <footer className="cabinet-labels"><span>CHAIR.OS v1.7 • CRASH REPLAY + ARROW CHORDS</span><span>DODGE THE SERVER</span></footer>
        </div>
      </section>
    </main>
  );
}
