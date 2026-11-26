'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst } from '@/lib/pos';
import type { CardItem } from './FlashcardApp';
import { IconLightbulb, IconRotateCcw, IconShuffle, IconType, IconVolume, IconX } from './Icons';

interface ScoreEntry {
  id: string;
  displayName?: string;
  score: number;
  wordsCleared: number;
  maxCombo: number;
}

interface Props {
  cards: CardItem[];
  isGuest: boolean;
  onSpeak: (text: string, slow?: boolean) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

const GUEST_SCRAMBLE_KEY = 'flashcardx_guest_scramble_scores_v1';
const GAME_SECONDS = 60;

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanSingleWord(word: string): string {
  const base = word.replace(/\([^)]*\)/g, ' ').split(/\s*[=/]\s*/)[0]?.trim() || '';
  return base.replace(/[^a-zA-Z]/g, '').toLowerCase();
}

function scrambleLetters(word: string): string[] {
  const chars = word.split('');
  if (chars.length <= 1) return chars;
  let mixed = shuffleArray(chars);
  let tries = 0;
  while (mixed.join('') === word && tries < 6) {
    mixed = shuffleArray(chars);
    tries++;
  }
  return mixed;
}

export default function WordScrambleGame({ cards, isGuest, onSpeak, onToast }: Props) {
  const [poolMode, setPoolMode] = useState<'unlearned' | 'all' | 'learned'>('unlearned');
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle');
  const [confirmExit, setConfirmExit] = useState(false);

  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const [currentCard, setCurrentCard] = useState<CardItem | null>(null);
  const [target, setTarget] = useState('');
  const [bank, setBank] = useState<{ id: number; ch: string; used: boolean }[]>([]);
  const [picked, setPicked] = useState<{ id: number; ch: string }[]>([]);
  const [shake, setShake] = useState(false);

  const [personalBest, setPersonalBest] = useState<{ score: number; wordsCleared: number } | null>(
    null
  );
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);

  const scoreRef = useRef(0);
  const solvedRef = useRef(0);
  const maxComboRef = useRef(0);
  const savedRef = useRef(false);

  const pool = useMemo(() => {
    const filtered = cards.filter((c) => {
      const okMode =
        poolMode === 'all' ? true : poolMode === 'learned' ? c.learned : !c.learned;
      const w = cleanSingleWord(c.word);
      return okMode && w.length >= 3 && w.length <= 12;
    });
    if (filtered.length >= 5) return filtered;
    return cards.filter((c) => {
      const w = cleanSingleWord(c.word);
      return w.length >= 3 && w.length <= 12;
    });
  }, [cards, poolMode]);

  const loadScores = useCallback(async () => {
    if (isGuest) {
      try {
        const raw = localStorage.getItem(GUEST_SCRAMBLE_KEY);
        if (raw) {
          const list: ScoreEntry[] = JSON.parse(raw);
          const sorted = [...list].sort((a, b) => b.score - a.score);
          if (sorted[0]) {
            setPersonalBest({ score: sorted[0].score, wordsCleared: sorted[0].wordsCleared });
          }
          setLeaderboard(sorted.slice(0, 8));
        }
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const res = await fetch('/api/games/scores?game=word-scramble', { cache: 'no-store' });
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
    async (finalScore: number, cleared: number, bestCombo: number) => {
      if (savedRef.current || finalScore <= 0) return;
      savedRef.current = true;

      if (isGuest) {
        try {
          const raw = localStorage.getItem(GUEST_SCRAMBLE_KEY);
          const list: ScoreEntry[] = raw ? JSON.parse(raw) : [];
          const prevMax = list.reduce((m, x) => Math.max(m, x.score), 0);
          setIsNewRecord(finalScore > prevMax);
          const next: ScoreEntry[] = [
            {
              id: `gs-${Date.now()}`,
              displayName: 'Khách',
              score: finalScore,
              wordsCleared: cleared,
              maxCombo: bestCombo,
            },
            ...list,
          ].slice(0, 20);
          localStorage.setItem(GUEST_SCRAMBLE_KEY, JSON.stringify(next));
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
            game: 'word-scramble',
            subMode: '60s',
            score: finalScore,
            wordsCleared: cleared,
            maxCombo: bestCombo,
            wave: 1,
            durationSec: GAME_SECONDS,
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
    [isGuest, loadScores]
  );

  const loadNextWord = useCallback(() => {
    if (!pool.length) return;
    const card = pool[Math.floor(Math.random() * pool.length)];
    const w = cleanSingleWord(card.word);
    const letters = scrambleLetters(w);
    setCurrentCard(card);
    setTarget(w);
    setBank(letters.map((ch, idx) => ({ id: idx, ch, used: false })));
    setPicked([]);
  }, [pool]);

  const startGame = () => {
    if (pool.length < 4) {
      onToast('Không đủ từ đơn hợp lệ để chơi Xếp chữ', 'error');
      return;
    }
    setTimeLeft(GAME_SECONDS);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setSolvedCount(0);
    setIsNewRecord(false);
    setConfirmExit(false);
    scoreRef.current = 0;
    solvedRef.current = 0;
    maxComboRef.current = 0;
    savedRef.current = false;
    setPhase('playing');
    loadNextWord();
  };

  useEffect(() => {
    if (phase !== 'playing' || confirmExit) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          setPhase('over');
          saveScore(scoreRef.current, solvedRef.current, maxComboRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, confirmExit, saveScore]);

  const checkCompleted = useCallback(
    (nextPicked: { id: number; ch: string }[]) => {
      if (nextPicked.length !== target.length) return;
      const attempt = nextPicked.map((x) => x.ch).join('');
      if (attempt === target) {
        const nextCombo = combo + 1;
        const nextMax = Math.max(maxCombo, nextCombo);
        const pts = 100 + target.length * 10 + nextCombo * 20;
        scoreRef.current += pts;
        solvedRef.current += 1;
        maxComboRef.current = nextMax;

        setScore(scoreRef.current);
        setSolvedCount(solvedRef.current);
        setCombo(nextCombo);
        setMaxCombo(nextMax);
        onSpeak(target, false);
        setTimeout(() => loadNextWord(), 260);
      } else {
        setShake(true);
        setCombo(0);
        setTimeout(() => {
          setShake(false);
          setPicked([]);
          setBank((prev) => prev.map((b) => ({ ...b, used: false })));
        }, 380);
      }
    },
    [target, combo, maxCombo, onSpeak, loadNextWord]
  );

  const pickBankTile = useCallback(
    (tileId: number) => {
      const found = bank.find((b) => b.id === tileId && !b.used);
      if (!found) return;
      const nextBank = bank.map((b) => (b.id === tileId ? { ...b, used: true } : b));
      const nextPicked = [...picked, { id: found.id, ch: found.ch }];
      setBank(nextBank);
      setPicked(nextPicked);
      checkCompleted(nextPicked);
    },
    [bank, picked, checkCompleted]
  );

  const unpickLast = useCallback(() => {
    if (!picked.length) return;
    const last = picked[picked.length - 1];
    setPicked((prev) => prev.slice(0, -1));
    setBank((prev) => prev.map((b) => (b.id === last.id ? { ...b, used: false } : b)));
  }, [picked]);

  const useHint = () => {
    const nextIdx = picked.length;
    if (nextIdx >= target.length) return;
    const neededChar = target[nextIdx];
    const matchTile = bank.find((b) => !b.used && b.ch === neededChar);
    if (matchTile) pickBankTile(matchTile.id);
  };

  useEffect(() => {
    if (phase !== 'playing' || confirmExit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        unpickLast();
        return;
      }
      const ch = e.key.toLowerCase();
      if (/^[a-z]$/.test(ch)) {
        const matchTile = bank.find((b) => !b.used && b.ch === ch);
        if (matchTile) {
          e.preventDefault();
          pickBankTile(matchTile.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, confirmExit, bank, pickBankTile, unpickLast]);

  const requestExit = () => {
    if (phase === 'playing') setConfirmExit(true);
    else {
      setPhase('idle');
      setConfirmExit(false);
    }
  };

  return (
    <div className="planeGameWrap">
      <div className="dictToolbar">
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
            Kỷ lục: <b>{personalBest.score}</b> điểm ({personalBest.wordsCleared} từ)
          </div>
        )}
      </div>

      <div className="planeLayout">
        <div className="matchBoardCard">
          <div className="gameStartBox">
            <div className="planeHeroIcon">
              <IconType size={34} />
            </div>
            <h3>Xếp chữ siêu tốc (60 giây)</h3>
            <p>
              Dựa vào nghĩa tiếng Việt, bấm các ô chữ cái hoặc gõ trực tiếp trên bàn phím để xếp
              lại đúng từ tiếng Anh trong 60 giây!
            </p>
            <button type="button" className="primary gameBigStartBtn" onClick={startGame}>
              Vào sân chơi toàn màn hình →
            </button>
          </div>
        </div>

        <aside className="planeBoardCard">
          <h3 className="planeBoardTitle">Bảng xếp hạng</h3>
          <p className="planeBoardSub">Xếp chữ siêu tốc · Top điểm cao nhất</p>
          {leaderboard.length === 0 ? (
            <div className="empty" style={{ padding: '20px 0' }}>
              Chưa có điểm nào. Thử sức ngay!
            </div>
          ) : (
            <div className="planeBoardList">
              {leaderboard.map((row, idx) => (
                <div key={row.id} className="planeBoardRow">
                  <span className={`rankNum ${idx < 3 ? 'top' : ''}`}>#{idx + 1}</span>
                  <div className="rankInfo">
                    <b>{row.displayName || 'Người chơi'}</b>
                    <span>
                      {row.wordsCleared} từ · Combo ×{row.maxCombo}
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
        <div className="gameFullscreen lightStage">
          <header className="gameFsHeader">
            <div className="gameFsLeft">
              <span className="gameFsIcon">
                <IconType size={19} />
              </span>
              <div>
                <div className="gameFsTitle">Xếp chữ siêu tốc</div>
                <div className="gameFsSub">Thử thách 60 giây</div>
              </div>
            </div>

            <div className="gameFsHudCenter">
              <div className="matchHudItem">
                <span>ĐIỂM</span>
                <b>{score}</b>
              </div>
              <div className="matchHudItem">
                <span>CÒN LẠI</span>
                <b style={{ color: timeLeft <= 10 && phase === 'playing' ? 'var(--rust)' : undefined }}>
                  {timeLeft}s
                </b>
              </div>
              <div className="matchHudItem">
                <span>ĐÃ XẾP</span>
                <b>{solvedCount}</b>
              </div>
              <div className="matchHudItem">
                <span>COMBO</span>
                <b>×{combo}</b>
              </div>
            </div>

            <button type="button" className="gameFsExitBtn light" onClick={requestExit}>
              <IconX size={16} />
              <span>Thoát trò chơi</span>
            </button>
          </header>

          <div className="gameFsBody">
            {phase === 'playing' && currentCard && (
              <div className="scrambleStage fsScrambleStage">
                <div className="scramblePrompt">
                  <span className="scrambleLabel">NGHĨA TIẾNG VIỆT</span>
                  <div className="scrambleVi fsScrambleVi">
                    {currentCard.meanings.map((m) => capFirst(m.text)).join(' · ')}
                  </div>
                </div>

                <div className={`scrambleSlots ${shake ? 'shake' : ''}`}>
                  {target.split('').map((_, idx) => {
                    const item = picked[idx];
                    return (
                      <button
                        key={idx}
                        type="button"
                        className={`scrambleSlot fsSlot ${item ? 'filled' : ''}`}
                        onClick={() => {
                          if (item && idx === picked.length - 1) unpickLast();
                        }}
                      >
                        {item ? item.ch.toUpperCase() : ''}
                      </button>
                    );
                  })}
                </div>

                <div className="scrambleBank">
                  {bank.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      disabled={b.used}
                      className={`scrambleKey fsKey ${b.used ? 'used' : ''}`}
                      onClick={() => pickBankTile(b.id)}
                    >
                      {b.ch.toUpperCase()}
                    </button>
                  ))}
                </div>

                <div className="scrambleTools">
                  <button
                    type="button"
                    className="ghost btnIconText"
                    onClick={() => onSpeak(target, false)}
                  >
                    <IconVolume size={16} />
                    <span>Nghe gợi ý</span>
                  </button>
                  <button type="button" className="ghost btnIconText" onClick={useHint}>
                    <IconLightbulb size={16} />
                    <span>Mở 1 chữ</span>
                  </button>
                  <button
                    type="button"
                    className="ghost btnIconText"
                    onClick={() => setBank((prev) => shuffleArray(prev))}
                  >
                    <IconShuffle size={16} />
                    <span>Xáo lại</span>
                  </button>
                  <button
                    type="button"
                    className="soft"
                    onClick={() => {
                      setCombo(0);
                      loadNextWord();
                    }}
                  >
                    Bỏ qua →
                  </button>
                </div>
              </div>
            )}

            {phase === 'over' && (
              <div className="gameStartBox">
                {isNewRecord && <span className="newRecordTag">KỶ LỤC MỚI!</span>}
                <h3>Hết giờ!</h3>
                <div className="matchFinalScore">{score} điểm</div>
                <p>
                  Xếp đúng <b>{solvedCount}</b> từ · Combo cao nhất <b>×{maxCombo}</b>
                </p>
                <div className="gameOverBtns">
                  <button type="button" className="soft" onClick={() => setPhase('idle')}>
                    Về trung tâm trò chơi
                  </button>
                  <button type="button" className="primary btnIconText" onClick={startGame}>
                    <IconRotateCcw size={16} />
                    <span>Chơi lại 60 giây</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {confirmExit && (
            <div className="gameConfirmBackdrop">
              <div className="gameConfirmBox">
                <h3>Thoát ván Xếp chữ?</h3>
                <p>Đồng hồ 60 giây đang tạm dừng. Nếu thoát ngay, điểm lượt này sẽ không được lưu.</p>
                <div className="gameConfirmBtns">
                  <button type="button" className="soft" onClick={() => setConfirmExit(false)}>
                    Tiếp tục chơi
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setConfirmExit(false);
                      setPhase('idle');
                    }}
                  >
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
