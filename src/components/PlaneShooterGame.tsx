'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst, keyOf } from '@/lib/pos';
import type { CardItem } from './FlashcardApp';
import { IconPlane, IconRotateCcw, IconVolume, IconX } from './Icons';

interface PlaneEnemy {
  uid: string;
  card: CardItem;
  targetWord: string; // clean English word for typing mode
  label: string; // Vietnamese meaning
  x: number; // percentage 12..88
  y: number; // percentage 0..100
  speed: number; // % per second
  isTarget: boolean;
}

interface LaserShot {
  id: number;
  toX: number;
  toY: number;
}

interface ExplosionFx {
  id: number;
  x: number;
  y: number;
  text: string;
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

export default function PlaneShooterGame({ cards, isGuest, onSpeak, onToast }: Props) {
  const [subMode, setSubMode] = useState<'tap' | 'typing'>('typing');
  const [poolMode, setPoolMode] = useState<'unlearned' | 'all' | 'learned'>('unlearned');
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle');
  const [confirmExit, setConfirmExit] = useState(false);

  // Live state
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [wordsCleared, setWordsCleared] = useState(0);
  const [wave, setWave] = useState(1);
  const [shipX, setShipX] = useState(50);
  const [enemies, setEnemies] = useState<PlaneEnemy[]>([]);
  const [targetCard, setTargetCard] = useState<CardItem | null>(null);
  const [typed, setTyped] = useState('');
  const [lasers, setLasers] = useState<LaserShot[]>([]);
  const [explosions, setExplosions] = useState<ExplosionFx[]>([]);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const [personalBest, setPersonalBest] = useState<{
    score: number;
    wordsCleared: number;
    maxCombo: number;
    wave: number;
  } | null>(null);
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const savedRunRef = useRef<boolean>(false);
  const lastTickRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);

  const scoreRef = useRef(0);
  const wordsClearedRef = useRef(0);
  const maxComboRef = useRef(0);
  const waveRef = useRef(1);

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

  const spawnTapSquadron = useCallback(
    (curWave: number) => {
      if (pool.length < 4) return;
      const picked = shuffleArray(pool).slice(0, 3);
      const target = picked[0];
      const lanes = shuffleArray([20, 50, 80]);
      const baseSpeed = Math.min(16, 6.8 + curWave * 1.05);

      const squad: PlaneEnemy[] = picked.map((card, i) => ({
        uid: `${Date.now()}-${i}-${Math.random()}`,
        card,
        targetWord: cleanTargetWord(card.word),
        label: capFirst(card.meanings[0]?.text || card.word),
        x: lanes[i],
        y: -5 - i * 4,
        speed: baseSpeed + (Math.random() * 1.4 - 0.7),
        isTarget: card.id === target.id,
      }));

      setTargetCard(target);
      setEnemies(squad);
      onSpeak(cleanTargetWord(target.word), false);
    },
    [pool, onSpeak]
  );

  const spawnTypingPlane = useCallback(
    (curWave: number) => {
      if (!pool.length) return;
      const card = pool[Math.floor(Math.random() * pool.length)];
      const lane = 15 + Math.random() * 70;
      const speed = Math.min(13, 4.8 + curWave * 0.8);
      const plane: PlaneEnemy = {
        uid: `${Date.now()}-${Math.random()}`,
        card,
        targetWord: cleanTargetWord(card.word),
        label: capFirst(card.meanings[0]?.text || card.word),
        x: lane,
        y: -7,
        speed,
        isTarget: true,
      };
      setEnemies((prev) => (prev.length >= 4 ? prev : [...prev, plane]));
    },
    [pool]
  );

  const fireFx = useCallback((targetX: number, targetY: number, pointsText: string) => {
    const id = Date.now() + Math.random();
    setShipX(targetX);
    setLasers((prev) => [...prev, { id, toX: targetX, toY: targetY }]);
    setExplosions((prev) => [...prev, { id, x: targetX, y: targetY, text: pointsText }]);
    setTimeout(() => {
      setLasers((prev) => prev.filter((l) => l.id !== id));
    }, 220);
    setTimeout(() => {
      setExplosions((prev) => prev.filter((e) => e.id !== id));
    }, 650);
  }, []);

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
    setTyped('');
    setIsNewRecord(false);
    setConfirmExit(false);
    scoreRef.current = 0;
    wordsClearedRef.current = 0;
    maxComboRef.current = 0;
    waveRef.current = 1;
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

  // Pause animation loop while Exit Confirm modal is open
  useEffect(() => {
    if (phase !== 'playing' || confirmExit) return;
    let raf = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.08, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;

      let breached = false;
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

      if (breached) {
        setCombo(0);
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

      if (subMode === 'typing') {
        spawnTimerRef.current += dt;
        const interval = Math.max(1.9, 3.6 - waveRef.current * 0.2);
        if (spawnTimerRef.current >= interval) {
          spawnTimerRef.current = 0;
          spawnTypingPlane(waveRef.current);
        }
      }

      raf = requestAnimationFrame(loop);
    };

    lastTickRef.current = performance.now();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, confirmExit, subMode, saveScore, spawnTapSquadron, spawnTypingPlane]);

  const registerHit = useCallback(
    (enemy: PlaneEnemy) => {
      const nextCombo = combo + 1;
      const nextMaxCombo = Math.max(maxCombo, nextCombo);
      const pts = 100 + Math.min(nextCombo, 10) * 20;
      const nextScore = scoreRef.current + pts;
      const nextCleared = wordsClearedRef.current + 1;
      const nextWave = 1 + Math.floor(nextCleared / 5);

      scoreRef.current = nextScore;
      wordsClearedRef.current = nextCleared;
      maxComboRef.current = nextMaxCombo;
      waveRef.current = nextWave;

      setCombo(nextCombo);
      setMaxCombo(nextMaxCombo);
      setScore(nextScore);
      setWordsCleared(nextCleared);
      setWave(nextWave);

      fireFx(enemy.x, enemy.y, `+${pts}`);
      onSpeak(enemy.targetWord, false);

      if (subMode === 'tap') {
        setEnemies([]);
        setTimeout(() => {
          if (lives > 0) spawnTapSquadron(nextWave);
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
    [combo, maxCombo, fireFx, onSpeak, subMode, lives, spawnTapSquadron, spawnTypingPlane]
  );

  const handlePlaneClick = (enemy: PlaneEnemy) => {
    if (phase !== 'playing' || subMode !== 'tap' || confirmExit) return;
    if (enemy.isTarget) {
      registerHit(enemy);
    } else {
      setCombo(0);
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
      onToast('Bắn nhầm máy bay! Mất 1 tim.', 'error');
    }
  };

  // ZType-style instant auto-fire when typed string matches an enemy plane's English word!
  const handleTypingChange = (val: string) => {
    setTyped(val);
    if (phase !== 'playing' || confirmExit) return;
    const cleaned = keyOf(val);
    if (!cleaned) return;

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
    if (phase === 'playing') {
      setConfirmExit(true);
    } else {
      setPhase('idle');
      setConfirmExit(false);
    }
  };

  const confirmQuitGame = () => {
    setConfirmExit(false);
    setPhase('idle');
    setEnemies([]);
    setTyped('');
  };

  const typedLower = typed.trim().toLowerCase();

  return (
    <div className="planeGameWrap">
      {/* Idle Lobby View (Config + Start Card + Leaderboard) */}
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
            <div className="planeHeroIcon">
              <IconPlane size={36} />
            </div>
            <h3>Bắn máy bay từ vựng TOEIC</h3>
            <p>
              {subMode === 'typing'
                ? 'Mỗi máy bay địch hiển thị rõ từ tiếng Anh và nghĩa tiếng Việt. Gõ nhanh từng chữ cái — chữ khớp sẽ sáng xanh và tự động khai hoả bắn hạ!'
                : 'Xem từ tiếng Anh ở thanh mục tiêu và bấm nhanh vào máy bay mang nghĩa tiếng Việt đúng trước khi nó rơi xuống!'}
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

      {/* ==================== FULL-SCREEN GAME STAGE ==================== */}
      {phase !== 'idle' && (
        <div className="gameFullscreen">
          {/* Dedicated Wide Game Header */}
          <header className="gameFsHeader dark">
            <div className="gameFsLeft">
              <span className="gameFsIcon">
                <IconPlane size={19} />
              </span>
              <div>
                <div className="gameFsTitle">Bắn máy bay từ vựng</div>
                <div className="gameFsSub">
                  {subMode === 'typing' ? 'Chế độ Gõ chữ ZType' : 'Chế độ Chạm bắn'}
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

            <button
              type="button"
              className="gameFsExitBtn"
              onClick={requestExit}
            >
              <IconX size={16} />
              <span>Thoát trò chơi</span>
            </button>
          </header>

          {/* Target Prompt Banner for Tap Mode */}
          {phase === 'playing' && subMode === 'tap' && targetCard && (
            <div className="planeTargetBanner">
              <span className="planeTargetLabel">BẮN NGHĨA ĐÚNG CỦA TỪ:</span>
              <b className="planeTargetWord">{capFirst(targetCard.word)}</b>
              <button
                type="button"
                className="planeSpeakMini"
                onClick={() => onSpeak(cleanTargetWord(targetCard.word), false)}
                title="Nghe lại"
              >
                <IconVolume size={16} />
              </button>
            </div>
          )}

          {/* Full-Height Radar Sky */}
          <div className="planeSky fsSky">
            <div className="planeRadarGrid" aria-hidden="true" />

            {phase === 'over' && (
              <div className="planeOverlay">
                {isNewRecord && <span className="newRecordTag">KỶ LỤC MỚI!</span>}
                <h3>Trận chiến kết thúc</h3>
                <div className="planeOverScore">{score} điểm</div>
                <p>
                  Hạ <b>{wordsCleared}</b> máy bay · Wave <b>{wave}</b> · Combo cao nhất{' '}
                  <b>×{maxCombo}</b>
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

            {/* Enemy Planes */}
            {phase === 'playing' &&
              enemies.map((en) => {
                const wLower = en.targetWord.toLowerCase();
                const isPrefixMatch =
                  subMode === 'typing' && typedLower.length > 0 && wLower.startsWith(typedLower);
                const matchedPart = isPrefixMatch ? en.targetWord.slice(0, typedLower.length) : '';
                const restPart = isPrefixMatch ? en.targetWord.slice(typedLower.length) : en.targetWord;

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
                    <span className="enemyPlaneBody">
                      <IconPlane size={22} style={{ transform: 'rotate(135deg)' }} />
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

            {lasers.map((l) => (
              <div
                key={l.id}
                className="planeLaser"
                style={{
                  left: `${l.toX}%`,
                  top: `${l.toY}%`,
                  height: `${Math.max(8, 92 - l.toY)}%`,
                }}
              />
            ))}

            {explosions.map((ex) => (
              <div
                key={ex.id}
                className="planeBoom"
                style={{ left: `${ex.x}%`, top: `${ex.y}%` }}
              >
                {ex.text}
              </div>
            ))}

            <div className="playerShip" style={{ left: `${shipX}%` }} aria-hidden="true">
              <IconPlane size={30} style={{ transform: 'rotate(-45deg)' }} />
            </div>
          </div>

          {/* Typing Mode Cannon Input */}
          {phase === 'playing' && subMode === 'typing' && (
            <form className="planeTypeBar fsTypeBar" onSubmit={handleTypingSubmit}>
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => handleTypingChange(e.target.value)}
                placeholder="Gõ từ tiếng Anh hiện trên máy bay — gõ đúng hết là tự động bắn!"
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

          {/* Exit Confirmation Modal */}
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
