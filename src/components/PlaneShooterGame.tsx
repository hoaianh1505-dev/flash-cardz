'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst, keyOf } from '@/lib/pos';
import { gameMusic } from '@/lib/gameMusic';
import type { CardItem } from './FlashcardApp';
import { IconMusic, IconPlane, IconRotateCcw, IconVolume, IconVolumeOff, IconX } from './Icons';

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
  fromX: number;
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
  mini?: boolean;
}

interface ScoreEntry {
  id: string;
  displayName?: string;
  subMode: string;
  score: number;
  wordsCleared: number;
  maxCombo: number;
  wave: number;
  createdAt: string;
}

type DifficultyKey = 'easy' | 'normal' | 'hard' | 'extreme' | 'hell';

const DIFFICULTIES: Record<
  DifficultyKey,
  {
    label: string;
    speedMul: number;
    spawnBase: number;
    maxPlanes: number;
    bossBaseHp: number;
    bossSpeedMul: number;
    lives: number;
    scoreMul: number;
    bossEvery: number;
  }
> = {
  easy: {
    label: 'Dễ',
    speedMul: 0.72,
    spawnBase: 4.1,
    maxPlanes: 3,
    bossBaseHp: 3,
    bossSpeedMul: 0.75,
    lives: 4,
    scoreMul: 1.0,
    bossEvery: 7,
  },
  normal: {
    label: 'Trung bình',
    speedMul: 1.0,
    spawnBase: 3.4,
    maxPlanes: 4,
    bossBaseHp: 4,
    bossSpeedMul: 1.0,
    lives: 3,
    scoreMul: 1.3,
    bossEvery: 6,
  },
  hard: {
    label: 'Khó',
    speedMul: 1.32,
    spawnBase: 2.6,
    maxPlanes: 5,
    bossBaseHp: 5,
    bossSpeedMul: 1.25,
    lives: 3,
    scoreMul: 1.7,
    bossEvery: 6,
  },
  extreme: {
    label: 'Siêu khó',
    speedMul: 1.65,
    spawnBase: 2.0,
    maxPlanes: 6,
    bossBaseHp: 6,
    bossSpeedMul: 1.5,
    lives: 2,
    scoreMul: 2.2,
    bossEvery: 5,
  },
  hell: {
    label: 'Địa ngục',
    speedMul: 2.05,
    spawnBase: 1.45,
    maxPlanes: 7,
    bossBaseHp: 7,
    bossSpeedMul: 1.85,
    lives: 2,
    scoreMul: 3.0,
    bossEvery: 5,
  },
};

const DIFF_ORDER: DifficultyKey[] = ['easy', 'normal', 'hard', 'extreme', 'hell'];

function formatSubMode(raw: string): string {
  const [m, d] = raw.split(':');
  const modeTxt = m === 'typing' ? 'Gõ chữ' : 'Chạm bắn';
  const diffTxt = DIFFICULTIES[d as DifficultyKey]?.label;
  return diffTxt ? `${modeTxt} · ${diffTxt}` : modeTxt;
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

/** 60fps HTML5 Canvas Deep Space Universe Background (3-layer stars + shooting stars + ringed planet) */
function SpaceCanvasBg({ isHell }: { isHell: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = (canvas.width = canvas.clientWidth || window.innerWidth);
    let h = (canvas.height = canvas.clientHeight || window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      w = canvas.width = canvas.clientWidth || window.innerWidth;
      h = canvas.height = canvas.clientHeight || window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    // 180 multi-depth parallax stars
    const stars = Array.from({ length: 185 }, () => {
      const layer = Math.random() < 0.55 ? 0 : Math.random() < 0.8 ? 1 : 2;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: layer === 0 ? 0.8 + Math.random() * 0.6 : layer === 1 ? 1.2 + Math.random() * 0.8 : 1.9 + Math.random() * 0.9,
        speed: layer === 0 ? 12 : layer === 1 ? 30 : 62,
        alpha: 0.35 + Math.random() * 0.65,
        twinkle: Math.random() * Math.PI * 2,
        tint:
          Math.random() < 0.16
            ? '#a9dcff'
            : Math.random() < 0.12
              ? '#ffe3a8'
              : '#ffffff',
      };
    });

    // Shooting star state
    let meteor: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    let meteorCooldown = 2.5;
    let planetY = h * 0.26;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Deep space gradient
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      if (isHell) {
        bg.addColorStop(0, '#12060a');
        bg.addColorStop(0.55, '#1d0b10');
        bg.addColorStop(1, '#090407');
      } else {
        bg.addColorStop(0, '#04070f');
        bg.addColorStop(0.55, '#091220');
        bg.addColorStop(1, '#050a14');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Soft distant cosmic nebula clouds
      const neb1 = ctx.createRadialGradient(w * 0.22, h * 0.3, 10, w * 0.22, h * 0.3, w * 0.36);
      neb1.addColorStop(0, isHell ? 'rgba(180, 48, 38, 0.18)' : 'rgba(34, 102, 112, 0.16)');
      neb1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = neb1;
      ctx.fillRect(0, 0, w, h);

      const neb2 = ctx.createRadialGradient(w * 0.78, h * 0.65, 10, w * 0.78, h * 0.65, w * 0.32);
      neb2.addColorStop(0, isHell ? 'rgba(218, 102, 36, 0.12)' : 'rgba(62, 92, 148, 0.13)');
      neb2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = neb2;
      ctx.fillRect(0, 0, w, h);

      // Distant ringed planet slowly drifting
      planetY += 2.2 * dt;
      if (planetY > h + 140) planetY = -140;
      const px = w * 0.82;
      const py = planetY;
      ctx.save();
      ctx.translate(px, py);
      // Back ring
      ctx.strokeStyle = isHell ? 'rgba(240, 146, 112, 0.28)' : 'rgba(155, 206, 224, 0.26)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(0, 0, 74, 18, -0.26, Math.PI, Math.PI * 2);
      ctx.stroke();
      // Planet sphere
      const pGrad = ctx.createRadialGradient(-14, -14, 6, 0, 0, 38);
      if (isHell) {
        pGrad.addColorStop(0, '#c86852');
        pGrad.addColorStop(0.55, '#632724');
        pGrad.addColorStop(1, '#1d0b0d');
      } else {
        pGrad.addColorStop(0, '#5a8ea8');
        pGrad.addColorStop(0.55, '#223d52');
        pGrad.addColorStop(1, '#09131d');
      }
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 38, 0, Math.PI * 2);
      ctx.fill();
      // Front ring
      ctx.strokeStyle = isHell ? 'rgba(246, 184, 140, 0.38)' : 'rgba(182, 225, 238, 0.36)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 74, 18, -0.26, 0, Math.PI);
      ctx.stroke();
      ctx.restore();

      // Distant small moon on left
      ctx.save();
      const mx = w * 0.14;
      const my = ((planetY * 0.6 + h * 0.55) % (h + 120)) - 60;
      const mGrad = ctx.createRadialGradient(mx - 6, my - 6, 2, mx, my, 18);
      mGrad.addColorStop(0, '#cfd8e3');
      mGrad.addColorStop(0.6, '#566475');
      mGrad.addColorStop(1, '#0e1520');
      ctx.fillStyle = mGrad;
      ctx.beginPath();
      ctx.arc(mx, my, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Parallax twinkling stars
      for (const s of stars) {
        s.y += s.speed * dt;
        s.twinkle += dt * 3;
        if (s.y > h) {
          s.y = -2;
          s.x = Math.random() * w;
        }
        const a = Math.max(0.15, Math.min(1, s.alpha + Math.sin(s.twinkle) * 0.22));
        ctx.globalAlpha = a;
        ctx.fillStyle = s.tint;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Occasional shooting star (sao băng)
      meteorCooldown -= dt;
      if (!meteor && meteorCooldown <= 0) {
        meteor = {
          x: Math.random() * w * 0.8 + w * 0.1,
          y: Math.random() * h * 0.35,
          vx: (Math.random() < 0.5 ? -1 : 1) * (420 + Math.random() * 240),
          vy: 260 + Math.random() * 140,
          life: 0.65,
        };
        meteorCooldown = 3.5 + Math.random() * 5;
      }
      if (meteor) {
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;
        meteor.life -= dt;
        if (meteor.life <= 0) {
          meteor = null;
        } else {
          const tailX = meteor.x - meteor.vx * 0.14;
          const tailY = meteor.y - meteor.vy * 0.14;
          const mg = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
          mg.addColorStop(0, `rgba(255, 253, 240, ${Math.min(1, meteor.life * 2)})`);
          mg.addColorStop(1, 'rgba(121, 216, 183, 0)');
          ctx.strokeStyle = mg;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(meteor.x, meteor.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [isHell]);

  return <canvas ref={canvasRef} className="spaceCanvas" aria-hidden="true" />;
}

/** High-Detail Handcrafted Sci-Fi Player Starfighter SVG (4 mechanical upgrade tiers) */
function PlayerJetSvg({ tier }: { tier: number }) {
  const accent = SHIP_TIERS[Math.min(tier - 1, 3)].color;
  const uid = `pj-${tier}`;
  return (
    <svg width="74" height="74" viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-hull`} x1="40" y1="6" x2="40" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#d8e3e8" />
          <stop offset="45%" stopColor="#5e7885" />
          <stop offset="100%" stopColor="#263842" />
        </linearGradient>
        <linearGradient id={`${uid}-wing`} x1="12" y1="30" x2="68" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3c5460" />
          <stop offset="50%" stopColor="#22343d" />
          <stop offset="100%" stopColor="#142128" />
        </linearGradient>
        <linearGradient id={`${uid}-glass`} x1="40" y1="18" x2="40" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e8fbff" />
          <stop offset="40%" stopColor={accent} />
          <stop offset="100%" stopColor="#13333d" />
        </linearGradient>
      </defs>

      {/* Tier 3+ subtle deflector shield */}
      {tier >= 3 && (
        <ellipse
          cx="40"
          cy="40"
          rx="35"
          ry="31"
          stroke={accent}
          strokeOpacity="0.38"
          strokeWidth="1.4"
          strokeDasharray="6 4"
        />
      )}

      {/* Swept heavy outer wings (Tier 2+) */}
      {tier >= 2 && (
        <path
          d="M6 52L24 31H56L74 52L69 58L52 49H28L11 58L6 52Z"
          fill={`url(#${uid}-wing)`}
          stroke="#7596a6"
          strokeWidth="1.2"
        />
      )}

      {/* Wing-mounted twin plasma pods (Tier 2+) */}
      {tier >= 2 && (
        <>
          <rect x="16" y="34" width="4.5" height="16" rx="2" fill="#2c424d" stroke={accent} strokeWidth="1.1" />
          <rect x="59.5" y="34" width="4.5" height="16" rx="2" fill="#2c424d" stroke={accent} strokeWidth="1.1" />
          <circle cx="18.25" cy="34" r="1.6" fill={accent} />
          <circle cx="61.75" cy="34" r="1.6" fill={accent} />
        </>
      )}

      {/* Primary fighter wings with panel lines */}
      <path
        d="M40 16L66 48L62 55L46 49L44 62H36L34 49L18 55L14 48L40 16Z"
        fill={`url(#${uid}-wing)`}
        stroke="#8aa7b5"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />

      {/* Forward canard stabilizers (Tier 3+) */}
      {tier >= 3 && (
        <path
          d="M40 12L52 24L49 28L40 22L31 28L28 24L40 12Z"
          fill="#4a6673"
          stroke={accent}
          strokeWidth="1.1"
        />
      )}

      {/* Central armored fuselage */}
      <path
        d="M40 5L47 22L49 48L45 64H35L31 48L33 22L40 5Z"
        fill={`url(#${uid}-hull)`}
        stroke="#c5d6de"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Fuselage panel seam & accent stripe */}
      <path d="M40 7V62" stroke="#182830" strokeWidth="1" strokeOpacity="0.6" />
      <path d="M35 45H45M34 52H46" stroke="#16242b" strokeWidth="1.2" />
      <path d="M23 47L32 39M57 47L48 39" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />

      {/* Twin engine exhaust nozzles */}
      <rect x="33.5" y="61" width="5" height="5" rx="1.2" fill="#182329" stroke={accent} strokeWidth="1" />
      <rect x="41.5" y="61" width="5" height="5" rx="1.2" fill="#182329" stroke={accent} strokeWidth="1" />

      {/* Cockpit canopy with glass reflection glint */}
      <path d="M40 18L44.5 31L40 37L35.5 31L40 18Z" fill={`url(#${uid}-glass)`} stroke="#dff7ff" strokeWidth="0.9" />
      <path d="M38.5 22L37.5 29" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.8" />

      {/* Wingtip navigation lights */}
      <circle cx="15" cy="49" r="1.8" fill="#ff7066" />
      <circle cx="65" cy="49" r="1.8" fill="#79d8b7" />
      {tier >= 4 && (
        <>
          <circle cx="7" cy="52" r="2.1" fill={accent} />
          <circle cx="73" cy="52" r="2.1" fill={accent} />
        </>
      )}
    </svg>
  );
}

/** High-Detail Enemy Spacecraft SVG (3 distinct mechanical silhouettes) */
function EnemyJetSvg({ variant }: { variant: PlaneEnemy['variant'] }) {
  const hullTop = variant === 'heavy' ? '#8c3f38' : variant === 'interceptor' ? '#875736' : '#6c424c';
  const hullBot = variant === 'heavy' ? '#361515' : variant === 'interceptor' ? '#331d13' : '#26141a';
  const trim = variant === 'heavy' ? '#ff9d76' : variant === 'interceptor' ? '#f4d382' : '#f08275';
  const gid = `ej-${variant}`;

  if (variant === 'heavy') {
    return (
      <svg width="56" height="48" viewBox="0 0 64 56" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="32" y1="4" x2="32" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={hullTop} />
            <stop offset="100%" stopColor={hullBot} />
          </linearGradient>
        </defs>
        {/* Heavy twin-hull bomber */}
        <path
          d="M32 50L22 34L6 26L8 14L22 17L26 6H38L42 17L56 14L58 26L42 34L32 50Z"
          fill={`url(#${gid})`}
          stroke={trim}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <rect x="13" y="16" width="5" height="14" rx="2" fill="#230e0e" stroke={trim} strokeWidth="1" />
        <rect x="46" y="16" width="5" height="14" rx="2" fill="#230e0e" stroke={trim} strokeWidth="1" />
        <path d="M26 16H38L35 34H29L26 16Z" fill="#2b1113" stroke={trim} strokeWidth="1.1" />
        <circle cx="32" cy="26" r="4" fill={trim} />
        <circle cx="32" cy="26" r="1.8" fill="#fff6db" />
      </svg>
    );
  }

  return (
    <svg width="50" height="44" viewBox="0 0 56 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="28" y1="4" x2="28" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={hullTop} />
          <stop offset="100%" stopColor={hullBot} />
        </linearGradient>
      </defs>
      {/* Sleek forward-swept interceptor */}
      <path
        d="M28 44L20 26L4 14L9 8L22 16L25 5H31L34 16L47 8L52 14L36 26L28 44Z"
        fill={`url(#${gid})`}
        stroke={trim}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 13L22 21M44 13L34 21" stroke="#fff2d9" strokeOpacity="0.45" strokeWidth="1.2" />
      <path d="M28 36L24 22H32L28 36Z" fill="#241015" stroke={trim} strokeWidth="1" />
      <ellipse cx="28" cy="24" rx="2.6" ry="4" fill={trim} />
      <circle cx="8" cy="12" r="1.5" fill={trim} />
      <circle cx="48" cy="12" r="1.5" fill={trim} />
    </svg>
  );
}

/** Massive Multi-Deck Armored Space Battleship Boss SVG */
function BossShipSvg() {
  return (
    <svg width="210" height="106" viewBox="0 0 220 112" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="boss-hull" x1="110" y1="8" x2="110" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#692d34" />
          <stop offset="55%" stopColor="#35181e" />
          <stop offset="100%" stopColor="#1b0b0f" />
        </linearGradient>
        <linearGradient id="boss-deck" x1="110" y1="18" x2="110" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#944248" />
          <stop offset="100%" stopColor="#401b21" />
        </linearGradient>
      </defs>
      {/* Rear thruster vents */}
      <rect x="64" y="6" width="14" height="10" rx="3" fill="#ff9468" fillOpacity="0.7" />
      <rect x="103" y="4" width="14" height="12" rx="3" fill="#ffd984" fillOpacity="0.85" />
      <rect x="142" y="6" width="14" height="10" rx="3" fill="#ff9468" fillOpacity="0.7" />
      {/* Main battleship wing-hull */}
      <path
        d="M110 104L78 76L22 58L8 34L48 28L70 12H150L172 28L212 34L198 58L142 76L110 104Z"
        fill="url(#boss-hull)"
        stroke="#f07e68"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Armored upper command deck */}
      <path
        d="M78 22H142L156 50L110 82L64 50L78 22Z"
        fill="url(#boss-deck)"
        stroke="#f4d382"
        strokeWidth="1.6"
      />
      {/* Panel seams & armor ribs */}
      <path d="M40 38L72 48M180 38L148 48M84 36H136M88 60H132" stroke="#1d0b0f" strokeWidth="2" />
      {/* Wing plasma battery turrets */}
      <rect x="28" y="38" width="14" height="24" rx="4" fill="#231015" stroke="#f4d382" strokeWidth="1.5" />
      <rect x="178" y="38" width="14" height="24" rx="4" fill="#231015" stroke="#f4d382" strokeWidth="1.5" />
      <circle cx="35" cy="60" r="3" fill="#ff9468" />
      <circle cx="185" cy="60" r="3" fill="#ff9468" />
      {/* Central reactor core */}
      <circle cx="110" cy="50" r="15" fill="#230d12" stroke="#f4d382" strokeWidth="2" />
      <circle cx="110" cy="50" r="10" fill="#e8644c" />
      <circle cx="110" cy="50" r="5" fill="#fff6d6" />
    </svg>
  );
}

export default function PlaneShooterGame({ cards, isGuest, onSpeak, onToast }: Props) {
  const [subMode, setSubMode] = useState<'tap' | 'typing'>('typing');
  const [difficulty, setDifficulty] = useState<DifficultyKey>('normal');
  const [poolMode, setPoolMode] = useState<'unlearned' | 'all' | 'learned'>('unlearned');
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle');
  const [confirmExit, setConfirmExit] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);

  const diffCfg = DIFFICULTIES[difficulty];
  const maxLives = diffCfg.lives;

  // Live state
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [wordsCleared, setWordsCleared] = useState(0);
  const [wave, setWave] = useState(1);
  const [shipX, setShipX] = useState(50);
  const [shipBank, setShipBank] = useState(0);
  const shipXRef = useRef(50);
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
          gain.gain.setValueAtTime(0.24, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
          osc.start(now);
          osc.stop(now + 0.1);
        } else if (kind === 'boom') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(160, now);
          osc.frequency.exponentialRampToValueAtTime(42, now + 0.22);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
          osc.start(now);
          osc.stop(now + 0.24);
        } else if (kind === 'upgrade') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, now);
          osc.frequency.setValueAtTime(659, now + 0.08);
          osc.frequency.setValueAtTime(784, now + 0.16);
          gain.gain.setValueAtTime(0.28, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
          osc.start(now);
          osc.stop(now + 0.34);
        } else if (kind === 'boss') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(190, now);
          osc.frequency.setValueAtTime(140, now + 0.18);
          gain.gain.setValueAtTime(0.28, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
          osc.start(now);
          osc.stop(now + 0.42);
        } else {
          osc.type = 'square';
          osc.frequency.setValueAtTime(130, now);
          osc.frequency.linearRampToValueAtTime(80, now + 0.18);
          gain.gain.setValueAtTime(0.24, now);
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

      const modeTag = `${subMode}:${difficulty}`;
      if (isGuest) {
        try {
          const raw = localStorage.getItem(GUEST_GAME_KEY);
          const list: ScoreEntry[] = raw ? JSON.parse(raw) : [];
          const prevMax = list.reduce((m, x) => Math.max(m, x.score), 0);
          setIsNewRecord(finalScore > prevMax);
          const entry: ScoreEntry = {
            id: `g-${Date.now()}`,
            displayName: 'Khách',
            subMode: modeTag,
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
            subMode: modeTag,
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
    [isGuest, subMode, difficulty, loadScores]
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
      const maxHp = Math.min(9, diffCfg.bossBaseHp + Math.floor(curWave / 3));
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
    [pool, diffCfg.bossBaseHp, subMode, buildBossTapChoices, playSfx, triggerBanner, onSpeak]
  );

  const spawnTapSquadron = useCallback(
    (curWave: number) => {
      if (pool.length < 4) return;
      const picked = shuffleArray(pool).slice(0, 3);
      const target = picked[0];
      const lanes = shuffleArray([20, 50, 80]);
      const baseSpeed = Math.min(24, (6.4 + curWave * 0.95) * diffCfg.speedMul);
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
    [pool, diffCfg.speedMul, onSpeak]
  );

  const spawnTypingPlane = useCallback(
    (curWave: number) => {
      if (!pool.length || bossRef.current) return;
      const card = pool[Math.floor(Math.random() * pool.length)];
      const lane = 14 + Math.random() * 72;
      const speed = Math.min(20, (4.5 + curWave * 0.7) * diffCfg.speedMul);
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
      setEnemies((prev) => (prev.length >= diffCfg.maxPlanes ? prev : [...prev, plane]));
    },
    [pool, diffCfg.speedMul, diffCfg.maxPlanes]
  );

  // Per-letter rapid-fire plasma bolt (fires on EVERY matching keystroke like ZType!)
  const fireLetterShot = useCallback(
    (targetX: number, targetY: number, tier: number) => {
      const id = Date.now() + Math.random();
      const prevX = shipXRef.current;
      const bankAngle = Math.max(-16, Math.min(16, (targetX - prevX) * 0.55));
      shipXRef.current = targetX;
      setShipBank(bankAngle);
      setShipX(targetX);
      setLasers((prev) => [...prev, { id, fromX: prevX, toX: targetX, toY: targetY, tier }]);
      setExplosions((prev) => [...prev, { id, x: targetX, y: targetY, text: '', mini: true }]);
      playSfx('laser');
      setTimeout(() => setShipBank(0), 140);
      setTimeout(() => {
        setLasers((prev) => prev.filter((l) => l.id !== id));
      }, 150);
      setTimeout(() => {
        setExplosions((prev) => prev.filter((e) => e.id !== id));
      }, 260);
    },
    [playSfx]
  );

  const fireFx = useCallback(
    (targetX: number, targetY: number, pointsText: string, tier: number, big = false) => {
      const id = Date.now() + Math.random();
      const prevX = shipXRef.current;
      const bankAngle = Math.max(-18, Math.min(18, (targetX - prevX) * 0.65));
      shipXRef.current = targetX;
      setShipBank(bankAngle);
      setShipX(targetX);
      setLasers((prev) => [...prev, { id, fromX: prevX, toX: targetX, toY: targetY, tier }]);
      setExplosions((prev) => [...prev, { id, x: targetX, y: targetY, text: pointsText, big }]);
      playSfx('laser');
      setTimeout(() => playSfx('boom'), 60);
      setTimeout(() => setShipBank(0), 220);
      setTimeout(() => {
        setLasers((prev) => prev.filter((l) => l.id !== id));
      }, 250);
      setTimeout(() => {
        setExplosions((prev) => prev.filter((e) => e.id !== id));
      }, 780);
    },
    [playSfx]
  );

  const startGame = useCallback(() => {
    if (pool.length < 4) {
      onToast('Cần ít nhất 4 từ vựng để chơi Bắn máy bay', 'error');
      return;
    }
    setScore(0);
    setLives(diffCfg.lives);
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
    nextBossAtRef.current = diffCfg.bossEvery;
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
  }, [pool.length, onToast, diffCfg.lives, diffCfg.bossEvery, subMode, spawnTapSquadron, spawnTypingPlane]);

  // Dynamic Arcade / Boss BGM lifecycle
  useEffect(() => {
    if (phase === 'playing' && !confirmExit && musicOn) {
      const style = boss || difficulty === 'hell' ? 'boss' : 'arcade';
      gameMusic.start(style);
    } else {
      gameMusic.stop();
    }
    return () => {
      gameMusic.stop();
    };
  }, [phase, confirmExit, musicOn, boss, difficulty]);

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
          let nx = prev.x + prev.dir * 12 * diffCfg.bossSpeedMul * dt;
          let ndir = prev.dir;
          if (nx > 78) {
            nx = 78;
            ndir = -1;
          } else if (nx < 22) {
            nx = 22;
            ndir = 1;
          }
          const ny = prev.y + 1.55 * diffCfg.bossSpeedMul * dt;
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
          const interval = Math.max(0.85, diffCfg.spawnBase - waveRef.current * 0.16);
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
  }, [
    phase,
    confirmExit,
    subMode,
    diffCfg.bossSpeedMul,
    diffCfg.spawnBase,
    playSfx,
    triggerShake,
    saveScore,
    spawnTapSquadron,
    spawnTypingPlane,
  ]);

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
      const bonus = Math.round((500 + waveRef.current * 100) * diffCfg.scoreMul);
      scoreRef.current += bonus;
      wordsClearedRef.current += 1;
      waveRef.current += 1;
      nextBossAtRef.current = wordsClearedRef.current + diffCfg.bossEvery;

      setScore(scoreRef.current);
      setWordsCleared(wordsClearedRef.current);
      setWave(waveRef.current);
      setLives((lv) => Math.min(maxLives, lv + 1)); // Heal +1 heart!
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
      const pts = Math.round(150 * diffCfg.scoreMul);
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
    diffCfg.scoreMul,
    diffCfg.bossEvery,
    maxLives,
    spawnTapSquadron,
    spawnTypingPlane,
    pool,
    buildBossTapChoices,
  ]);

  const registerHit = useCallback(
    (enemy: PlaneEnemy) => {
      const nextCombo = combo + 1;
      const nextMaxCombo = Math.max(maxCombo, nextCombo);
      const pts = Math.round((100 + Math.min(nextCombo, 10) * 20) * diffCfg.scoreMul);
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
      diffCfg.scoreMul,
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
    const isAddingChar = val.length > typed.length;
    setTyped(val);
    if (phase !== 'playing' || confirmExit) return;
    const cleaned = keyOf(val);
    if (!cleaned) return;

    const tierNow = getShipTier(wordsClearedRef.current).level;

    if (bossRef.current) {
      const bWord = keyOf(bossRef.current.targetWord);
      if (bWord === cleaned) {
        setTyped('');
        damageBoss();
      } else if (isAddingChar && bWord.startsWith(cleaned)) {
        fireLetterShot(bossRef.current.x, bossRef.current.y, tierNow);
        setBoss((b) => (b ? { ...b, hitFlash: true } : null));
        setTimeout(() => setBoss((b) => (b ? { ...b, hitFlash: false } : null)), 90);
      }
      return;
    }

    const fullMatch = enemies.find((en) => keyOf(en.targetWord) === cleaned);
    if (fullMatch) {
      setTyped('');
      registerHit(fullMatch);
      return;
    }

    // Per-letter rapid-fire into the closest (lowest) matching enemy plane + slight knockback
    if (isAddingChar) {
      const matching = enemies
        .filter((en) => keyOf(en.targetWord).startsWith(cleaned))
        .sort((a, b) => b.y - a.y);
      const target = matching[0];
      if (target) {
        fireLetterShot(target.x, target.y, tierNow);
        setEnemies((prev) =>
          prev.map((p) => (p.uid === target.uid ? { ...p, y: Math.max(-4, p.y - 1.6) } : p))
        );
      }
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
          <span className="dictToolbarLabel">Độ khó:</span>
          <div className="segGroup">
            {DIFF_ORDER.map((dk) => (
              <button
                key={dk}
                type="button"
                className={`segBtn ${difficulty === dk ? 'active' : ''} ${
                  dk === 'hell' ? 'diffHellBtn' : dk === 'extreme' ? 'diffExtremeBtn' : ''
                }`}
                onClick={() => setDifficulty(dk)}
              >
                {DIFFICULTIES[dk].label} (×{DIFFICULTIES[dk].scoreMul})
              </button>
            ))}
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
                      Wave {row.wave} · {row.wordsCleared} từ · {formatSubMode(row.subMode)}
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
                  <span className={`diffBadge diff-${difficulty}`}>{diffCfg.label} ×{diffCfg.scoreMul}</span>{' '}
                  · <b style={{ color: shipTier.color }}>{shipTier.name}</b> (Lv.{shipTier.level})
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
                {Array.from({ length: maxLives }).map((_, i) => (
                  <span key={i} className={`lifeDot ${i < lives ? 'on' : ''}`} />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className={`planeSpeakMini ${musicOn ? 'musicOn' : ''}`}
                onClick={() => setMusicOn((m) => !m)}
                title={musicOn ? 'Tắt nhạc nền' : 'Bật nhạc nền'}
                aria-label="Nhạc nền game"
              >
                <IconMusic size={16} />
              </button>
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

          {/* Full-Height Deep Space Universe Canvas */}
          <div
            className={`planeSky fsSky ${damageFlash ? 'hurtFlash' : ''} ${
              difficulty === 'hell' ? 'hellSky' : difficulty === 'extreme' ? 'extremeSky' : ''
            }`}
          >
            <SpaceCanvasBg isHell={difficulty === 'hell'} />

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
                    className={`enemyFreeJet ${subMode === 'tap' ? 'clickable' : ''} ${
                      isPrefixMatch ? 'locked' : ''
                    }`}
                    style={{ left: `${en.x}%`, top: `${en.y}%` }}
                    onClick={() => handlePlaneClick(en)}
                  >
                    <span className="enemySpriteStage">
                      <span className="enemyContrail" aria-hidden="true" />
                      {isPrefixMatch && <span className="targetLockRing" aria-hidden="true" />}
                      <EnemyJetSvg variant={en.variant} />
                    </span>
                    <span className={`enemyPillPlate ${isPrefixMatch ? 'locked' : ''}`}>
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

            {/* True Angled SVG Homing Plasma Lasers */}
            <svg className="laserOverlaySvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {lasers.map((l) => {
                const col =
                  l.tier >= 4 ? '#f59e6c' : l.tier === 3 ? '#f4d382' : l.tier === 2 ? '#60c7f2' : '#79d8b7';
                return (
                  <g key={l.id} className="laserFade">
                    <line
                      x1={l.fromX}
                      y1={91}
                      x2={l.toX}
                      y2={l.toY}
                      stroke={col}
                      strokeWidth={l.tier >= 3 ? '0.65' : '0.45'}
                      strokeLinecap="round"
                    />
                    <line
                      x1={l.fromX}
                      y1={91}
                      x2={l.toX}
                      y2={l.toY}
                      stroke="#ffffff"
                      strokeWidth="0.18"
                      strokeLinecap="round"
                    />
                    {l.tier >= 2 && (
                      <line
                        x1={l.fromX - 1.4}
                        y1={92}
                        x2={l.toX}
                        y2={l.toY}
                        stroke={col}
                        strokeWidth="0.24"
                        strokeOpacity="0.8"
                      />
                    )}
                    {l.tier >= 3 && (
                      <line
                        x1={l.fromX + 1.4}
                        y1={92}
                        x2={l.toX}
                        y2={l.toY}
                        stroke={col}
                        strokeWidth="0.24"
                        strokeOpacity="0.8"
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Multi-Particle Radial Explosions + Per-Letter Hit Sparks + Floating Score */}
            {explosions.map((ex) => (
              <div
                key={ex.id}
                className={`planeBoom ${ex.big ? 'bigBoom' : ''} ${ex.mini ? 'miniHit' : ''}`}
                style={{ left: `${ex.x}%`, top: `${ex.y}%` }}
              >
                <span className="boomCore" />
                {!ex.mini && <span className="boomRing" />}
                {(ex.mini ? [0, 90, 180, 270] : [0, 36, 72, 108, 144, 180, 216, 252, 288, 324]).map(
                  (deg) => (
                    <span
                      key={deg}
                      className="boomSpark"
                      style={{ '--deg': `${deg}deg` } as React.CSSProperties}
                    />
                  )
                )}
                {ex.text && <span className="boomText">{ex.text}</span>}
              </div>
            ))}

            {/* Upgraded Player Fighter Jet + Dynamic Banking + Thruster Flame */}
            <div
              className="playerJetDock"
              style={{
                left: `${shipX}%`,
                transform: `translateX(-50%) rotate(${shipBank}deg)`,
              }}
              aria-hidden="true"
            >
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
