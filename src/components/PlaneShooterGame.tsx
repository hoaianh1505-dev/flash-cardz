'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst, keyOf } from '@/lib/pos';
import type { CardItem } from './FlashcardApp';
import { IconPlane, IconRotateCcw, IconVolume, IconVolumeOff, IconX } from './Icons';

interface PlaneEnemy {
  uid: string;
  card: CardItem;
  targetWord: string;
  label: string;
  x: number;
  y: number;
  speed: number;
  isTarget: boolean;
  variant: 'scout' | 'interceptor' | 'heavy';
}

interface BossEntity {
  uid: string;
  name: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  dir: number;
  card: CardItem;
  targetWord: string;
  label: string;
  hitFlash: boolean;
}

interface LaserShot {
  id: number;
  toX: number;
  toY: number;
  tier: number;
}

interface ExplosionFx {
  id: number;
  x: number;
  y: number;
  text: string;
  big?: boolean;
}

interface ScoreEntry {
  id: string;
  displayName?: string;
  subMode: 'tap' | 'typing';
  score: number;
  wordsCleared: number;
  maxCombo: number;
  wave: number;
  createdAt: string;
}

interface Props {
  cards: CardItem[];
  isGuest: boolean;
  onSpeak: (text: string, slow?: boolean) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

const GUEST_GAME_KEY = 'flashcardx_guest_plane_scores_v1';

const SHIP_TIERS = [
  { level: 1, name: 'Scout Mk.I', minKills: 0, color: '#79d8b7' },
  { level: 2, name: 'Twin-Wing Mk.II', minKills: 5, color: '#60c7f2' },
  { level: 3, name: 'Raptor Mk.III', minKills: 12, color: '#f4d382' },
  { level: 4, name: 'Aegis Mk.IV', minKills: 22, color: '#f59e6c' },
] as const;

const BOSS_NAMES = [
  'IRON DREADNOUGHT',
  'SKY LEVIATHAN',
  'TITAN CARRIER',
  'OMEGA FORTRESS',
];

function getShipTier(kills: number) {
  let cur: (typeof SHIP_TIERS)[number] = SHIP_TIERS[0];
  for (const t of SHIP_TIERS) {
    if (kills >= t.minKills) cur = t;
  }
  return cur;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanTargetWord(word: string): string {
  const cleaned = word.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.split(/\s*[=/]\s*/)[0]?.trim() || cleaned;
}

/** Detailed Vector Player Fighter SVG (evolves across 4 upgrade tiers!) */
function PlayerJetSvg({ tier }: { tier: number }) {
  const accent = SHIP_TIERS[Math.min(tier - 1, 3)].color;
  return (
    <svg width="62" height="62" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {/* Tier 3+ energy shield aura */}
      {tier >= 3 && (
        <ellipse
          cx="32"
          cy="32"
          rx="28"
          ry="24"
          stroke={accent}
          strokeOpacity="0.45"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      )}
      {/* Outer extra wings for Tier 2+ */}
      {tier >= 2 && (
        <path
          d="M6 42L22 25H42L58 42L52 46L39 39H25L12 46L6 42Z"
          fill="#1b3a44"
          stroke={accent}
          strokeWidth="1.6"
        />
      )}
      {/* Extra wing cannons for Tier 3+ */}
      {tier >= 3 && (
        <>
          <rect x="13" y="23" width="3.5" height="12" rx="1.5" fill={accent} />
          <rect x="47.5" y="23" width="3.5" height="12" rx="1.5" fill={accent} />
        </>
      )}
      {/* Main delta fuselage */}
      <path
        d="M32 6L41 26L52 38L49 44L38 40L36 50H28L26 40L15 44L12 38L23 26L32 6Z"
        fill="#244c44"
        stroke={accent}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Cockpit canopy */}
      <path d="M32 16L36 27H28L32 16Z" fill={accent} fillOpacity="0.9" />
      {/* Center stripe for Tier 4 */}
      {tier >= 4 && <path d="M32 8V48" stroke="#fffdf7" strokeWidth="1.8" strokeOpacity="0.7" />}
    </svg>
  );
}

/** Detailed Enemy Fighter SVG */
function EnemyJetSvg({ variant }: { variant: PlaneEnemy['variant'] }) {
  const hull =
    variant === 'heavy' ? '#5a2e2e' : variant === 'interceptor' ? '#4a3228' : '#3d2b2b';
  const trim =
    variant === 'heavy' ? '#f59e6c' : variant === 'interceptor' ? '#f4d382' : '#e67c63';
  return (
    <svg width="42" height="36" viewBox="0 0 48 40" fill="none" aria-hidden="true">
      <path
        d="M24 36L16 22L4 12L8 8L20 13L22 4H26L28 13L40 8L44 12L32 22L24 36Z"
        fill={hull}
        stroke={trim}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="20" r="3" fill={trim} />
    </svg>
  );
}

/** Giant Armored Boss Dreadnought SVG */
function BossShipSvg() {
  return (
    <svg width="160" height="84" viewBox="0 0 180 92" fill="none" aria-hidden="true">
      <path
        d="M90 84L64 60L18 46L8 26L44 24L60 10H120L136 24L172 26L162 46L116 60L90 84Z"
        fill="#3a1f24"
        stroke="#e86f58"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M66 22H114L124 44L90 66L56 44L66 22Z"
        fill="#53282e"
        stroke="#f4d382"
        strokeWidth="1.8"
      />
      {/* Glowing energy core */}
      <circle cx="90" cy="42" r="10" fill="#e86f58" />
      <circle cx="90" cy="42" r="5" fill="#fff2cc" />
      {/* Wing turrets */}
      <rect x="28" y="34" width="12" height="18" rx="3" fill="#2a161a" stroke="#f4d382" strokeWidth="1.5" />
      <rect x="140" y="34" width="12" height="18" rx="3" fill="#2a161a" stroke="#f4d382" strokeWidth="1.5" />
    </svg>
  );
}

export default function PlaneShooterGame({ cards, isGuest, onSpeak, onToast }: Props) {
  const [subMode, setSubMode] = useState<'tap' | 'typing'>('typing');
  const [poolMode, setPoolMode] = useState<'unlearned' | 'all' | 'learned'>('unlearned');
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle');
  const [confirmExit, setConfirmExit] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);

  // Live state
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [wordsCleared, setWordsCleared] = useState(0);
  const [wave, setWave] = useState(1);
  const [shipX, setShipX] = useState(50);
  const [enemies, setEnemies] = useState<PlaneEnemy[]>([]);
  const [boss, setBoss] = useState<BossEntity | null>(null);
  const [bossTapChoices, setBossTapChoices] = useState<{ text: string; correct: boolean }[]>([]);
  const [targetCard, setTargetCard] = useState<CardItem | null>(null);
  const [typed, setTyped] = useState('');
  const [lasers, setLasers] = useState<LaserShot[]>([]);
  const [explosions, setExplosions] = useState<ExplosionFx[]>([]);
  const [bannerAlert, setBannerAlert] = useState<{ text: string; kind: 'boss' | 'upgrade' } | null>(
    null
  );
  const [screenShake, setScreenShake] = useState(false);
  const [damageFlash, setDamageFlash] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const [personalBest, setPersonalBest] = useState<{
    score: number;
    wordsCleared: number;
    maxCombo: number;
    wave: number;
  } | null>(null);
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const sfxCtxRef = useRef<AudioContext | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const savedRunRef = useRef<boolean>(false);
  const lastTickRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const nextBossAtRef = useRef<number>(6);
  const prevTierRef = useRef<number>(1);

  const scoreRef = useRef(0);
  const wordsClearedRef = useRef(0);
  const maxComboRef = useRef(0);
  const waveRef = useRef(1);
  const bossRef = useRef<BossEntity | null>(null);

  const shipTier = getShipTier(wordsCleared);

  // Subtle Web Audio Synth SFX (laser, explosion, upgrade, boss horn)
  const playSfx = useCallback(
    (kind: 'laser' | 'boom' | 'upgrade' | 'boss' | 'hurt') => {
      if (!sfxOn || typeof window === 'undefined') return;
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!sfxCtxRef.current) sfxCtxRef.current = new AudioCtx();
        const ctx = sfxCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (kind === 'laser') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(760, now);
          osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
          gain.gain.setValueAtTime(0.11, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
          osc.start(now);
          osc.stop(now + 0.1);
        } else if (kind === 'boom') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(160, now);
          osc.frequency.exponentialRampToValueAtTime(42, now + 0.22);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
          osc.start(now);
          osc.stop(now + 0.24);
        } else if (kind === 'upgrade') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, now);
          osc.frequency.setValueAtTime(659, now + 0.08);
          osc.frequency.setValueAtTime(784, now + 0.16);
          gain.gain.setValueAtTime(0.14, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
          osc.start(now);
          osc.stop(now + 0.34);
        } else if (kind === 'boss') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(190, now);
          osc.frequency.setValueAtTime(140, now + 0.18);
          gain.gain.setValueAtTime(0.13, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
          osc.start(now);
          osc.stop(now + 0.42);
        } else {
          osc.type = 'square';
          osc.frequency.setValueAtTime(130, now);
          osc.frequency.linearRampToValueAtTime(80, now + 0.18);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
        }
      } catch {
        /* ignore */
      }
    },
    [sfxOn]
  );

  const triggerBanner = useCallback((text: string, kind: 'boss' | 'upgrade') => {
    setBannerAlert({ text, kind });
    setTimeout(() => setBannerAlert((cur) => (cur?.text === text ? null : cur)), 2100);
  }, []);

  const triggerShake = useCallback((hurt = false) => {
    setScreenShake(true);
    if (hurt) setDamageFlash(true);
    setTimeout(() => {
      setScreenShake(false);
      setDamageFlash(false);
    }, 320);
  }, []);

  const pool = useMemo(() => {
    const filtered = cards.filter((c) =>
      poolMode === 'all' ? true : poolMode === 'learned' ? c.learned : !c.learned
    );
    return filtered.length >= 4 ? filtered : cards;
  }, [cards, poolMode]);

  const loadScores = useCallback(async () => {
    if (isGuest) {
      try {
        const raw = localStorage.getItem(GUEST_GAME_KEY);
        if (raw) {
          const list: ScoreEntry[] = JSON.parse(raw);
          const sorted = [...list].sort((a, b) => b.score - a.score);
          if (sorted[0]) {
            setPersonalBest({
              score: sorted[0].score,
              wordsCleared: sorted[0].wordsCleared,
              maxCombo: sorted[0].maxCombo,
              wave: sorted[0].wave,
            });
          }
          setLeaderboard(sorted.slice(0, 8));
        }
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const res = await fetch('/api/games/scores?game=plane-shooter', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setPersonalBest(data.personalBest || null);
        setLeaderboard(Array.isArray(data.leaderboard) ? data.leaderboard : []);
      }
    } catch {
      /* ignore */
    }
  }, [isGuest]);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const saveScore = useCallback(
    async (finalScore: number, cleared: number, bestCombo: number, finalWave: number) => {
      if (savedRunRef.current || finalScore <= 0) return;
      savedRunRef.current = true;
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));

      if (isGuest) {
        try {
          const raw = localStorage.getItem(GUEST_GAME_KEY);
          const list: ScoreEntry[] = raw ? JSON.parse(raw) : [];
          const prevMax = list.reduce((m, x) => Math.max(m, x.score), 0);
          setIsNewRecord(finalScore > prevMax);
          const entry: ScoreEntry = {
            id: `g-${Date.now()}`,
            displayName: 'Khách',
            subMode,
            score: finalScore,
            wordsCleared: cleared,
            maxCombo: bestCombo,
            wave: finalWave,
            createdAt: new Date().toISOString(),
          };
          const next = [entry, ...list].slice(0, 20);
          localStorage.setItem(GUEST_GAME_KEY, JSON.stringify(next));
          loadScores();
        } catch {
          /* ignore */
        }
        return;
      }

      try {
        const res = await fetch('/api/games/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game: 'plane-shooter',
            subMode,
            score: finalScore,
            wordsCleared: cleared,
            maxCombo: bestCombo,
            wave: finalWave,
            durationSec,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.isNewRecord) setIsNewRecord(true);
          loadScores();
        }
      } catch {
        /* ignore */
      }
    },
    [isGuest, subMode, loadScores]
  );

  const buildBossTapChoices = useCallback(
    (card: CardItem) => {
      const distractors = shuffleArray(pool.filter((c) => c.id !== card.id))
        .slice(0, 2)
        .map((c) => ({ text: capFirst(c.meanings[0]?.text || c.word), correct: false }));
      const correct = { text: capFirst(card.meanings[0]?.text || card.word), correct: true };
      setBossTapChoices(shuffleArray([correct, ...distractors]));
    },
    [pool]
  );

  const spawnBoss = useCallback(
    (curWave: number) => {
      if (!pool.length) return;
      const card = pool[Math.floor(Math.random() * pool.length)];
      const maxHp = Math.min(5, 3 + Math.floor(curWave / 3));
      const newBoss: BossEntity = {
        uid: `boss-${Date.now()}`,
        name: BOSS_NAMES[(curWave - 1) % BOSS_NAMES.length],
        hp: maxHp,
        maxHp,
        x: 50,
        y: 18,
        dir: 1,
        card,
        targetWord: cleanTargetWord(card.word),
        label: capFirst(card.meanings[0]?.text || card.word),
        hitFlash: false,
      };
      bossRef.current = newBoss;
      setBoss(newBoss);
      setEnemies([]);
      if (subMode === 'tap') buildBossTapChoices(card);
      playSfx('boss');
      triggerBanner(`CẢNH BÁO: BOSS ${newBoss.name} XUẤT HIỆN!`, 'boss');
      onSpeak(newBoss.targetWord, false);
    },
    [pool, subMode, buildBossTapChoices, playSfx, triggerBanner, onSpeak]
  );

  const spawnTapSquadron = useCallback(
    (curWave: number) => {
      if (pool.length < 4) return;
      const picked = shuffleArray(pool).slice(0, 3);
      const target = picked[0];
      const lanes = shuffleArray([20, 50, 80]);
      const baseSpeed = Math.min(15.5, 6.5 + curWave * 1.0);
      const variants: PlaneEnemy['variant'][] = ['scout', 'interceptor', 'heavy'];

      const squad: PlaneEnemy[] = picked.map((card, i) => ({
        uid: `${Date.now()}-${i}-${Math.random()}`,
        card,
        targetWord: cleanTargetWord(card.word),
        label: capFirst(card.meanings[0]?.text || card.word),
        x: lanes[i],
        y: -5 - i * 4,
        speed: baseSpeed + (Math.random() * 1.4 - 0.7),
        isTarget: card.id === target.id,
        variant: variants[i % 3],
      }));

      setTargetCard(target);
      setEnemies(squad);
      onSpeak(cleanTargetWord(target.word), false);
    },
    [pool, onSpeak]
  );

  const spawnTypingPlane = useCallback(
    (curWave: number) => {
      if (!pool.length || bossRef.current) return;
      const card = pool[Math.floor(Math.random() * pool.length)];
      const lane = 15 + Math.random() * 70;
      const speed = Math.min(12.5, 4.6 + curWave * 0.75);
      const variant: PlaneEnemy['variant'] =
        card.word.length >= 9 ? 'heavy' : card.word.length >= 6 ? 'interceptor' : 'scout';
      const plane: PlaneEnemy = {
        uid: `${Date.now()}-${Math.random()}`,
        card,
        targetWord: cleanTargetWord(card.word),
        label: capFirst(card.meanings[0]?.text || card.word),
        x: lane,
        y: -7,
        speed,
        isTarget: true,
        variant,
      };
      setEnemies((prev) => (prev.length >= 4 ? prev : [...prev, plane]));
    },
    [pool]
  );

  const fireFx = useCallback(
    (targetX: number, targetY: number, pointsText: string, tier: number, big = false) => {
      const id = Date.now() + Math.random();
      setShipX(targetX);
      setLasers((prev) => [...prev, { id, toX: targetX, toY: targetY, tier }]);
      setExplosions((prev) => [...prev, { id, x: targetX, y: targetY, text: pointsText, big }]);
      playSfx('laser');
      setTimeout(() => playSfx('boom'), 60);
      setTimeout(() => {
        setLasers((prev) => prev.filter((l) => l.id !== id));
      }, 240);
      setTimeout(() => {
        setExplosions((prev) => prev.filter((e) => e.id !== id));
      }, 750);
    },
    [playSfx]
  );

  const startGame = useCallback(() => {
    if (pool.length < 4) {
      onToast('Cần ít nhất 4 từ vựng để chơi Bắn máy bay', 'error');
      return;
    }
    setScore(0);
    setLives(3);
    setCombo(0);
    setMaxCombo(0);
    setWordsCleared(0);
    setWave(1);
    setShipX(50);
    setEnemies([]);
    setBoss(null);
    bossRef.current = null;
    setBossTapChoices([]);
    setTyped('');
    setIsNewRecord(false);
    setConfirmExit(false);
    setBannerAlert(null);
    scoreRef.current = 0;
    wordsClearedRef.current = 0;
    maxComboRef.current = 0;
    waveRef.current = 1;
    nextBossAtRef.current = 6;
    prevTierRef.current = 1;
    startedAtRef.current = Date.now();
    savedRunRef.current = false;
    lastTickRef.current = performance.now();
    spawnTimerRef.current = 0;
    setPhase('playing');

    if (subMode === 'tap') {
      spawnTapSquadron(1);
    } else {
      spawnTypingPlane(1);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [pool.length, onToast, subMode, spawnTapSquadron, spawnTypingPlane]);

  // 60fps loop (handles normal planes + Boss patrol & slow descent)
  useEffect(() => {
    if (phase !== 'playing' || confirmExit) return;
    let raf = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.08, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;

      let breached = false;

      if (bossRef.current) {
        setBoss((prev) => {
          if (!prev) return null;
          let nx = prev.x + prev.dir * 12 * dt;
          let ndir = prev.dir;
          if (nx > 78) {
            nx = 78;
            ndir = -1;
          } else if (nx < 22) {
            nx = 22;
            ndir = 1;
          }
          const ny = prev.y + 1.55 * dt;
          if (ny >= 74) {
            breached = true;
            bossRef.current = null;
            return null;
          }
          const updated = { ...prev, x: nx, y: ny, dir: ndir };
          bossRef.current = updated;
          return updated;
        });
      } else {
        setEnemies((prev) => {
          const next: PlaneEnemy[] = [];
          for (const p of prev) {
            const ny = p.y + p.speed * dt;
            if (ny >= 88) {
              if (p.isTarget) breached = true;
            } else {
              next.push({ ...p, y: ny });
            }
          }
          return next;
        });

        if (subMode === 'typing') {
          spawnTimerRef.current += dt;
          const interval = Math.max(1.9, 3.6 - waveRef.current * 0.2);
          if (spawnTimerRef.current >= interval) {
            spawnTimerRef.current = 0;
            spawnTypingPlane(waveRef.current);
          }
        }
      }

      if (breached) {
        setCombo(0);
        playSfx('hurt');
        triggerShake(true);
        setLives((lv) => {
          const nextLv = lv - 1;
          if (nextLv <= 0) {
            setPhase('over');
            saveScore(
              scoreRef.current,
              wordsClearedRef.current,
              maxComboRef.current,
              waveRef.current
            );
          } else if (subMode === 'tap') {
            spawnTapSquadron(waveRef.current);
          }
          return Math.max(0, nextLv);
        });
      }

      raf = requestAnimationFrame(loop);
    };

    lastTickRef.current = performance.now();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, confirmExit, subMode, playSfx, triggerShake, saveScore, spawnTapSquadron, spawnTypingPlane]);

  // Check upgrade tier notification
  const checkShipUpgrade = useCallback(
    (cleared: number) => {
      const nextTier = getShipTier(cleared);
      if (nextTier.level > prevTierRef.current) {
        prevTierRef.current = nextTier.level;
        playSfx('upgrade');
        triggerBanner(`NÂNG CẤP CHIẾN CƠ: ${nextTier.name.toUpperCase()}!`, 'upgrade');
      }
    },
    [playSfx, triggerBanner]
  );

  // Hit Boss core!
  const damageBoss = useCallback(() => {
    const cur = bossRef.current;
    if (!cur) return;

    const nextCombo = combo + 1;
    const nextMaxCombo = Math.max(maxCombo, nextCombo);
    const tierNow = getShipTier(wordsClearedRef.current).level;
    setCombo(nextCombo);
    setMaxCombo(nextMaxCombo);
    maxComboRef.current = nextMaxCombo;
    onSpeak(cur.targetWord, false);

    const remainingHp = cur.hp - 1;
    if (remainingHp <= 0) {
      // BOSS DEFEATED!
      const bonus = 500 + waveRef.current * 100;
      scoreRef.current += bonus;
      wordsClearedRef.current += 1;
      waveRef.current += 1;
      nextBossAtRef.current = wordsClearedRef.current + 6;

      setScore(scoreRef.current);
      setWordsCleared(wordsClearedRef.current);
      setWave(waveRef.current);
      setLives((lv) => Math.min(3, lv + 1)); // Heal +1 heart!
      fireFx(cur.x, cur.y, `BOSS +${bonus}!`, tierNow, true);
      triggerShake(false);
      playSfx('upgrade');
      triggerBanner(`HẠ GỤC BOSS! +${bonus} ĐIỂM & HỒI 1 TIM`, 'upgrade');
      checkShipUpgrade(wordsClearedRef.current);

      bossRef.current = null;
      setBoss(null);
      setBossTapChoices([]);

      setTimeout(() => {
        if (subMode === 'tap') spawnTapSquadron(waveRef.current);
        else spawnTypingPlane(waveRef.current);
      }, 650);
    } else {
      const pts = 150;
      scoreRef.current += pts;
      setScore(scoreRef.current);
      fireFx(cur.x, cur.y, `-${1} HP · +${pts}`, tierNow, false);
      triggerShake(false);

      const nextCard = pool[Math.floor(Math.random() * pool.length)] || cur.card;
      const updatedBoss: BossEntity = {
        ...cur,
        hp: remainingHp,
        card: nextCard,
        targetWord: cleanTargetWord(nextCard.word),
        label: capFirst(nextCard.meanings[0]?.text || nextCard.word),
        hitFlash: true,
      };
      bossRef.current = updatedBoss;
      setBoss(updatedBoss);
      if (subMode === 'tap') buildBossTapChoices(nextCard);
      setTimeout(() => {
        setBoss((b) => (b ? { ...b, hitFlash: false } : null));
      }, 180);
    }
  }, [
    combo,
    maxCombo,
    onSpeak,
    fireFx,
    triggerShake,
    playSfx,
    triggerBanner,
    checkShipUpgrade,
    subMode,
    spawnTapSquadron,
    spawnTypingPlane,
    pool,
    buildBossTapChoices,
  ]);

  const registerHit = useCallback(
    (enemy: PlaneEnemy) => {
      const nextCombo = combo + 1;
      const nextMaxCombo = Math.max(maxCombo, nextCombo);
      const pts = 100 + Math.min(nextCombo, 10) * 20;
      const nextScore = scoreRef.current + pts;
      const nextCleared = wordsClearedRef.current + 1;
      const nextWave = 1 + Math.floor(nextCleared / 5);
      const tierNow = getShipTier(nextCleared).level;

      scoreRef.current = nextScore;
      wordsClearedRef.current = nextCleared;
      maxComboRef.current = nextMaxCombo;
      waveRef.current = nextWave;

      setCombo(nextCombo);
      setMaxCombo(nextMaxCombo);
      setScore(nextScore);
      setWordsCleared(nextCleared);
      setWave(nextWave);

      fireFx(enemy.x, enemy.y, `+${pts}`, tierNow, false);
      onSpeak(enemy.targetWord, false);
      checkShipUpgrade(nextCleared);

      // Spawn Boss every 6 kills!
      if (nextCleared >= nextBossAtRef.current) {
        setEnemies([]);
        setTimeout(() => spawnBoss(nextWave), 420);
        return;
      }

      if (subMode === 'tap') {
        setEnemies([]);
        setTimeout(() => {
          if (lives > 0 && !bossRef.current) spawnTapSquadron(nextWave);
        }, 240);
      } else {
        setEnemies((prev) => {
          const rest = prev.filter((p) => p.uid !== enemy.uid);
          if (rest.length === 0) {
            setTimeout(() => spawnTypingPlane(nextWave), 180);
          }
          return rest;
        });
      }
    },
    [
      combo,
      maxCombo,
      fireFx,
      onSpeak,
      checkShipUpgrade,
      spawnBoss,
      subMode,
      lives,
      spawnTapSquadron,
      spawnTypingPlane,
    ]
  );

  const handlePlaneClick = (enemy: PlaneEnemy) => {
    if (phase !== 'playing' || subMode !== 'tap' || confirmExit) return;
    if (enemy.isTarget) {
      registerHit(enemy);
    } else {
      setCombo(0);
      playSfx('hurt');
      triggerShake(true);
      setEnemies((prev) => prev.filter((p) => p.uid !== enemy.uid));
      setLives((lv) => {
        const nextLv = lv - 1;
        if (nextLv <= 0) {
          setPhase('over');
          saveScore(
            scoreRef.current,
            wordsClearedRef.current,
            maxComboRef.current,
            waveRef.current
          );
        }
        return Math.max(0, nextLv);
      });
    }
  };

  const handleBossTapAnswer = (correct: boolean) => {
    if (phase !== 'playing' || confirmExit) return;
    if (correct) {
      damageBoss();
    } else {
      setCombo(0);
      playSfx('hurt');
      triggerShake(true);
      setLives((lv) => {
        const nextLv = lv - 1;
        if (nextLv <= 0) {
          setPhase('over');
          saveScore(
            scoreRef.current,
            wordsClearedRef.current,
            maxComboRef.current,
            waveRef.current
          );
        }
        return Math.max(0, nextLv);
      });
    }
  };

  const handleTypingChange = (val: string) => {
    setTyped(val);
    if (phase !== 'playing' || confirmExit) return;
    const cleaned = keyOf(val);
    if (!cleaned) return;

    if (bossRef.current) {
      if (keyOf(bossRef.current.targetWord) === cleaned) {
        setTyped('');
        damageBoss();
      }
      return;
    }

    const match = enemies.find((en) => keyOf(en.targetWord) === cleaned);
    if (match) {
      setTyped('');
      registerHit(match);
    }
  };

  const handleTypingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phase !== 'playing' || confirmExit) return;
    const cleaned = keyOf(typed);
    if (!cleaned) return;
    if (bossRef.current && keyOf(bossRef.current.targetWord) === cleaned) {
      setTyped('');
      damageBoss();
      return;
    }
    const match = enemies.find((en) => keyOf(en.targetWord) === cleaned);
    if (match) {
      setTyped('');
      registerHit(match);
    } else {
      setTyped('');
      setCombo(0);
    }
  };

  const requestExit = () => {
    if (phase === 'playing') setConfirmExit(true);
    else {
      setPhase('idle');
      setConfirmExit(false);
    }
  };

  const confirmQuitGame = () => {
    setConfirmExit(false);
    setPhase('idle');
    setEnemies([]);
    setBoss(null);
    bossRef.current = null;
    setTyped('');
  };

  const typedLower = typed.trim().toLowerCase();

  return (
    <div className="planeGameWrap">
      <div className="dictToolbar">
        <div className="dictToolbarGroup">
          <span className="dictToolbarLabel">Kiểu bắn:</span>
          <div className="segGroup">
            <button
              type="button"
              className={`segBtn ${subMode === 'typing' ? 'active' : ''}`}
              onClick={() => setSubMode('typing')}
            >
              Gõ chữ bắn hạ (ZType)
            </button>
            <button
              type="button"
              className={`segBtn ${subMode === 'tap' ? 'active' : ''}`}
              onClick={() => setSubMode('tap')}
            >
              Chạm bắn nghĩa đúng
            </button>
          </div>
        </div>

        <div className="dictToolbarGroup">
          <span className="dictToolbarLabel">Nguồn từ:</span>
          <div className="segGroup">
            {(
              [
                ['unlearned', 'Chưa thuộc'],
                ['all', 'Tất cả'],
                ['learned', 'Đã thuộc'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`segBtn ${poolMode === k ? 'active' : ''}`}
                onClick={() => setPoolMode(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {personalBest && (
          <div className="gameBestPill">
            Kỷ lục: <b>{personalBest.score}</b> điểm (Wave {personalBest.wave})
          </div>
        )}
      </div>

      <div className="planeLayout">
        <div className="planeArenaCard">
          <div className="planeLobbyBox">
            <div className="lobbyJetShowcase">
              <PlayerJetSvg tier={3} />
            </div>
            <h3>Bắn máy bay từ vựng TOEIC</h3>
            <p>
              {subMode === 'typing'
                ? 'Hạ máy bay địch để nâng cấp chiến cơ lên 4 cấp độ (tia đơn → tia đôi → 3 nòng → siêu thanh) và đối đầu chiến hạm BOSS mỗi 6 mục tiêu!'
                : 'Chọn nhanh nghĩa tiếng Việt đúng để bắn hạ đội hình địch, nâng cấp chiến cơ và phá giáp chiến hạm BOSS!'}
            </p>
            <button type="button" className="primary gameBigStartBtn" onClick={startGame}>
              Vào sân chơi toàn màn hình →
            </button>
          </div>
        </div>

        <aside className="planeBoardCard">
          <h3 className="planeBoardTitle">Bảng xếp hạng</h3>
          <p className="planeBoardSub">
            {isGuest ? 'Kỷ lục lưu trên trình duyệt của bạn' : 'Top điểm cao nhất (MongoDB)'}
          </p>
          {leaderboard.length === 0 ? (
            <div className="empty" style={{ padding: '20px 0' }}>
              Chưa có điểm nào. Chơi ngay để ghi danh!
            </div>
          ) : (
            <div className="planeBoardList">
              {leaderboard.map((row, idx) => (
                <div key={row.id} className="planeBoardRow">
                  <span className={`rankNum ${idx < 3 ? 'top' : ''}`}>#{idx + 1}</span>
                  <div className="rankInfo">
                    <b>{row.displayName || 'Người chơi'}</b>
                    <span>
                      Wave {row.wave} · {row.wordsCleared} từ ·{' '}
                      {row.subMode === 'typing' ? 'Gõ chữ' : 'Chạm bắn'}
                    </span>
                  </div>
                  <b className="rankScore">{row.score}</b>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* ==================== FULL-SCREEN ARCADE STAGE ==================== */}
      {phase !== 'idle' && (
        <div className={`gameFullscreen ${screenShake ? 'screenShake' : ''}`}>
          <header className="gameFsHeader dark">
            <div className="gameFsLeft">
              <span className="gameFsIcon">
                <IconPlane size={19} />
              </span>
              <div>
                <div className="gameFsTitle">Bắn máy bay từ vựng</div>
                <div className="gameFsSub">
                  Chiến cơ: <b style={{ color: shipTier.color }}>{shipTier.name}</b> (Lv.
                  {shipTier.level})
                </div>
              </div>
            </div>

            <div className="gameFsHudCenter">
              <div className="planeHudStat">
                <span>ĐIỂM</span>
                <b>{score}</b>
              </div>
              <div className="planeHudStat">
                <span>WAVE</span>
                <b>{wave}</b>
              </div>
              <div className="planeHudStat">
                <span>COMBO</span>
                <b>×{combo}</b>
              </div>
              <div className="planeHudLives" aria-label={`Còn ${lives} mạng`}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`lifeDot ${i < lives ? 'on' : ''}`} />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="planeSpeakMini"
                onClick={() => setSfxOn((s) => !s)}
                title={sfxOn ? 'Tắt hiệu ứng âm thanh' : 'Bật hiệu ứng âm thanh'}
                aria-label="Âm thanh game"
              >
                {sfxOn ? <IconVolume size={16} /> : <IconVolumeOff size={16} />}
              </button>
              <button type="button" className="gameFsExitBtn" onClick={requestExit}>
                <IconX size={16} />
                <span>Thoát trò chơi</span>
              </button>
            </div>
          </header>

          {/* Tap Mode Target Prompt */}
          {phase === 'playing' && subMode === 'tap' && (boss || targetCard) && (
            <div className="planeTargetBanner">
              <span className="planeTargetLabel">
                {boss ? 'PHÁ GIÁP BOSS — CHỌN NGHĨA CỦA TỪ:' : 'BẮN NGHĨA ĐÚNG CỦA TỪ:'}
              </span>
              <b className="planeTargetWord">
                {capFirst(boss ? boss.card.word : targetCard!.word)}
              </b>
              <button
                type="button"
                className="planeSpeakMini"
                onClick={() =>
                  onSpeak(boss ? boss.targetWord : cleanTargetWord(targetCard!.word), false)
                }
                title="Nghe lại"
              >
                <IconVolume size={16} />
              </button>
            </div>
          )}

          {/* Full-Height Starfield Radar Sky */}
          <div className={`planeSky fsSky ${damageFlash ? 'hurtFlash' : ''}`}>
            <div className="starfieldLayer slow" aria-hidden="true" />
            <div className="starfieldLayer fast" aria-hidden="true" />
            <div className="planeRadarGrid" aria-hidden="true" />

            {/* Boss / Upgrade Tactical Alert Banner */}
            {bannerAlert && (
              <div className={`gameBannerAlert ${bannerAlert.kind}`}>{bannerAlert.text}</div>
            )}

            {phase === 'over' && (
              <div className="planeOverlay">
                {isNewRecord && <span className="newRecordTag">KỶ LỤC MỚI!</span>}
                <h3>Trận chiến kết thúc</h3>
                <div className="planeOverScore">{score} điểm</div>
                <p>
                  Hạ <b>{wordsCleared}</b> mục tiêu · Wave <b>{wave}</b> · Chiến cơ{' '}
                  <b>{shipTier.name}</b> · Combo cao nhất <b>×{maxCombo}</b>
                </p>
                <div className="gameOverBtns">
                  <button type="button" className="soft" onClick={confirmQuitGame}>
                    Về trung tâm trò chơi
                  </button>
                  <button type="button" className="primary btnIconText" onClick={startGame}>
                    <IconRotateCcw size={16} />
                    <span>Chơi lại ngay</span>
                  </button>
                </div>
              </div>
            )}

            {/* BOSS DREADNOUGHT */}
            {phase === 'playing' && boss && (
              <div
                className={`bossEntity ${boss.hitFlash ? 'hit' : ''}`}
                style={{ left: `${boss.x}%`, top: `${boss.y}%` }}
              >
                <div className="bossHeaderTag">
                  <span>BOSS · {boss.name}</span>
                  <b>
                    {boss.hp}/{boss.maxHp} HP
                  </b>
                </div>
                <div className="bossHpTrack">
                  <div
                    className="bossHpFill"
                    style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }}
                  />
                </div>
                <BossShipSvg />
                {subMode === 'typing' ? (
                  <div className="bossWordPlate">
                    {(() => {
                      const wLower = boss.targetWord.toLowerCase();
                      const hit = typedLower.length > 0 && wLower.startsWith(typedLower);
                      return (
                        <>
                          <span className="enemyEnWord">
                            {hit && (
                              <mark className="typedHit">
                                {boss.targetWord.slice(0, typedLower.length)}
                              </mark>
                            )}
                            {hit ? boss.targetWord.slice(typedLower.length) : boss.targetWord}
                          </span>
                          <span className="enemyViSub">{boss.label}</span>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="bossTapRow">
                    {bossTapChoices.map((ch, i) => (
                      <button
                        key={i}
                        type="button"
                        className="bossTapBtn"
                        onClick={() => handleBossTapAnswer(ch.correct)}
                      >
                        {ch.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Normal Enemy Planes */}
            {phase === 'playing' &&
              enemies.map((en) => {
                const wLower = en.targetWord.toLowerCase();
                const isPrefixMatch =
                  subMode === 'typing' && typedLower.length > 0 && wLower.startsWith(typedLower);
                const matchedPart = isPrefixMatch ? en.targetWord.slice(0, typedLower.length) : '';
                const restPart = isPrefixMatch
                  ? en.targetWord.slice(typedLower.length)
                  : en.targetWord;

                return (
                  <button
                    key={en.uid}
                    type="button"
                    className={`enemyPlane fsEnemy ${subMode === 'tap' ? 'clickable' : ''} ${
                      isPrefixMatch ? 'locked' : ''
                    }`}
                    style={{ left: `${en.x}%`, top: `${en.y}%` }}
                    onClick={() => handlePlaneClick(en)}
                  >
                    <span className="enemyJetWrap">
                      <EnemyJetSvg variant={en.variant} />
                    </span>
                    <span className="enemyPlaneTag">
                      {subMode === 'typing' ? (
                        <>
                          <span className="enemyEnWord">
                            {matchedPart && <mark className="typedHit">{matchedPart}</mark>}
                            {restPart}
                          </span>
                          <span className="enemyViSub">{en.label}</span>
                        </>
                      ) : (
                        <b>{en.label}</b>
                      )}
                    </span>
                  </button>
                );
              })}

            {/* Multi-beam Plasma Lasers based on Ship Tier */}
            {lasers.map((l) => (
              <div
                key={l.id}
                className={`laserSalvo tier${l.tier}`}
                style={{
                  left: `${l.toX}%`,
                  top: `${l.toY}%`,
                  height: `${Math.max(8, 90 - l.toY)}%`,
                }}
              >
                <span className="laserBeam main" />
                {l.tier >= 2 && <span className="laserBeam left" />}
                {l.tier >= 3 && <span className="laserBeam right" />}
              </div>
            ))}

            {/* Radial Shockwave + Score Explosions */}
            {explosions.map((ex) => (
              <div
                key={ex.id}
                className={`planeBoom ${ex.big ? 'bigBoom' : ''}`}
                style={{ left: `${ex.x}%`, top: `${ex.y}%` }}
              >
                <span className="boomRing" />
                <span className="boomText">{ex.text}</span>
              </div>
            ))}

            {/* Upgraded Player Fighter Jet + Animated Thruster Flame */}
            <div className="playerJetDock" style={{ left: `${shipX}%` }} aria-hidden="true">
              <PlayerJetSvg tier={shipTier.level} />
              <span className={`jetFlame tier${shipTier.level}`} />
            </div>
          </div>

          {/* Typing Cannon Input */}
          {phase === 'playing' && subMode === 'typing' && (
            <form className="planeTypeBar fsTypeBar" onSubmit={handleTypingSubmit}>
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => handleTypingChange(e.target.value)}
                placeholder={
                  boss
                    ? `Gõ "${boss.targetWord}" để phá giáp BOSS!`
                    : 'Gõ từ tiếng Anh hiện trên máy bay — khớp là tự động bắn!'
                }
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button type="submit" className="primary">
                Bắn!
              </button>
            </form>
          )}

          {confirmExit && (
            <div className="gameConfirmBackdrop">
              <div className="gameConfirmBox">
                <h3>Thoát ván chơi hiện tại?</h3>
                <p>
                  Trò chơi đang tạm dừng. Nếu thoát ngay bây giờ, điểm số của ván này sẽ không được
                  lưu lại.
                </p>
                <div className="gameConfirmBtns">
                  <button
                    type="button"
                    className="soft"
                    onClick={() => {
                      setConfirmExit(false);
                      lastTickRef.current = performance.now();
                      setTimeout(() => inputRef.current?.focus(), 40);
                    }}
                  >
                    Tiếp tục chơi
                  </button>
                  <button type="button" className="danger" onClick={confirmQuitGame}>
                    Xác nhận thoát
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
