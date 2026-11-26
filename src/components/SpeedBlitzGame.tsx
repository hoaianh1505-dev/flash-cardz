'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst } from '@/lib/pos';
import type { CardItem } from './FlashcardApp';
import { IconCheck, IconRotateCcw, IconVolume, IconX, IconZap } from './Icons';

type BlitzSpeed = 'chill' | 'normal' | 'lightning';

const SPEED_CONFIG: Record<
  BlitzSpeed,
  { label: string; ms: number; scoreMul: number }
> = {
  chill: { label: 'Thư giãn (5s)', ms: 5000, scoreMul: 1.0 },
  normal: { label: 'Chuẩn (3.5s)', ms: 3500, scoreMul: 1.5 },
  lightning: { label: 'Tia chớp (2.2s)', ms: 2200, scoreMul: 2.4 },
};

interface BlitzQuestion {
  card: CardItem;
  shownMeaning: string;
  realMeaning: string;
  isTrue: boolean;
}

interface ScoreEntry {
  id: string;
  displayName?: string;
  subMode: string;
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

const GUEST_BLITZ_KEY = 'flashcardx_guest_blitz_scores_v1';

export default function SpeedBlitzGame({ cards, isGuest, onSpeak, onToast }: Props) {
  const [speed, setSpeed] = useState<BlitzSpeed>('normal');
  const [poolMode, setPoolMode] = useState<'unlearned' | 'all' | 'learned'>('unlearned');
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle');
  const [confirmExit, setConfirmExit] = useState(false);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [question, setQuestion] = useState<BlitzQuestion | null>(null);
  const [timePct, setTimePct] = useState(100);
  const [flash, setFlash] = useState<'idle' | 'ok' | 'err'>('idle');
  const [correction, setCorrection] = useState<string>('');
  const [isNewRecord, setIsNewRecord] = useState(false);

  const [personalBest, setPersonalBest] = useState<{ score: number; maxCombo: number } | null>(
    null
  );
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);

  const scoreRef = useRef(0);
  const clearedRef = useRef(0);
  const maxComboRef = useRef(0);
  const savedRef = useRef(false);
  const startedAtRef = useRef<number>(Date.now());
  const qStartRef = useRef<number>(Date.now());
  const qDurationRef = useRef<number>(3500);
  const lockedRef = useRef(false);

  const pool = useMemo(() => {
    const filtered = cards.filter((c) =>
      poolMode === 'all' ? true : poolMode === 'learned' ? c.learned : !c.learned
    );
    return filtered.length >= 4 ? filtered : cards;
  }, [cards, poolMode]);

  const loadScores = useCallback(async () => {
    if (isGuest) {
      try {
        const raw = localStorage.getItem(GUEST_BLITZ_KEY);
        if (raw) {
          const list: ScoreEntry[] = JSON.parse(raw);
          const sorted = [...list].sort((a, b) => b.score - a.score);
          if (sorted[0]) {
            setPersonalBest({ score: sorted[0].score, maxCombo: sorted[0].maxCombo });
          }
          setLeaderboard(sorted.slice(0, 8));
        }
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const res = await fetch('/api/games/scores?game=speed-blitz', { cache: 'no-store' });
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
    async (finalScore: number, wordsOk: number, bestCombo: number) => {
      if (savedRef.current || finalScore <= 0) return;
      savedRef.current = true;
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));

      if (isGuest) {
        try {
          const raw = localStorage.getItem(GUEST_BLITZ_KEY);
          const list: ScoreEntry[] = raw ? JSON.parse(raw) : [];
          const prevMax = list.reduce((m, x) => Math.max(m, x.score), 0);
          setIsNewRecord(finalScore > prevMax);
          const next: ScoreEntry[] = [
            {
              id: `gb-${Date.now()}`,
              displayName: 'Khách',
              subMode: speed,
              score: finalScore,
              wordsCleared: wordsOk,
              maxCombo: bestCombo,
            },
            ...list,
          ].slice(0, 20);
          localStorage.setItem(GUEST_BLITZ_KEY, JSON.stringify(next));
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
            game: 'speed-blitz',
            subMode: speed,
            score: finalScore,
            wordsCleared: wordsOk,
            maxCombo: bestCombo,
            wave: 1,
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
    [isGuest, speed, loadScores]
  );

  const nextQuestion = useCallback(
    (curCombo: number) => {
      if (pool.length < 4) return;
      const card = pool[Math.floor(Math.random() * pool.length)];
      const isTrue = Math.random() < 0.5;
      const realMeaning = capFirst(card.meanings[0]?.text || card.word);

      let shownMeaning = realMeaning;
      if (!isTrue) {
        const others = pool.filter((c) => c.id !== card.id);
        const decoy = others[Math.floor(Math.random() * others.length)];
        shownMeaning = capFirst(decoy.meanings[0]?.text || decoy.word);
      }

      const baseMs = SPEED_CONFIG[speed].ms;
      // Gently speed up as combo climbs
      const dynamicMs = Math.max(1500, baseMs - Math.min(curCombo, 15) * 65);
      qDurationRef.current = dynamicMs;
      qStartRef.current = Date.now();
      lockedRef.current = false;
      setTimePct(100);
      setFlash('idle');
      setCorrection('');
      setQuestion({ card, shownMeaning, realMeaning, isTrue });
      onSpeak(card.word, false);
    },
    [pool, speed, onSpeak]
  );

  const startGame = () => {
    if (pool.length < 4) {
      onToast('Cần ít nhất 4 từ vựng để chơi Đúng / Sai Tia Chớp', 'error');
      return;
    }
    setScore(0);
    setLives(3);
    setCombo(0);
    setMaxCombo(0);
    setCleared(0);
    setIsNewRecord(false);
    setConfirmExit(false);
    scoreRef.current = 0;
    clearedRef.current = 0;
    maxComboRef.current = 0;
    savedRef.current = false;
    startedAtRef.current = Date.now();
    setPhase('playing');
    nextQuestion(0);
  };

  const handleAnswer = useCallback(
    (pickedTrue: boolean | null) => {
      if (phase !== 'playing' || confirmExit || lockedRef.current || !question) return;
      lockedRef.current = true;

      const isCorrect = pickedTrue !== null && pickedTrue === question.isTrue;
      if (isCorrect) {
        const nextCombo = combo + 1;
        const nextMax = Math.max(maxCombo, nextCombo);
        const pts = Math.round((80 + Math.min(nextCombo, 12) * 20) * SPEED_CONFIG[speed].scoreMul);
        scoreRef.current += pts;
        clearedRef.current += 1;
        maxComboRef.current = nextMax;

        setScore(scoreRef.current);
        setCleared(clearedRef.current);
        setCombo(nextCombo);
        setMaxCombo(nextMax);
        setFlash('ok');

        setTimeout(() => {
          nextQuestion(nextCombo);
        }, 260);
      } else {
        setCombo(0);
        setFlash('err');
        setCorrection(`${capFirst(question.card.word)} = ${question.realMeaning}`);
        setLives((lv) => {
          const nextLv = lv - 1;
          if (nextLv <= 0) {
            setTimeout(() => {
              setPhase('over');
              saveScore(scoreRef.current, clearedRef.current, maxComboRef.current);
            }, 650);
          } else {
            setTimeout(() => {
              nextQuestion(0);
            }, 850);
          }
          return Math.max(0, nextLv);
        });
      }
    },
    [phase, confirmExit, question, combo, maxCombo, speed, nextQuestion, saveScore]
  );

  // Per-question countdown bar loop
  useEffect(() => {
    if (phase !== 'playing' || confirmExit || !question) return;
    const t = setInterval(() => {
      if (lockedRef.current) return;
      const elapsed = Date.now() - qStartRef.current;
      const pct = Math.max(0, 100 - (elapsed / qDurationRef.current) * 100);
      setTimePct(pct);
      if (pct <= 0) {
        handleAnswer(null);
      }
    }, 35);
    return () => clearInterval(t);
  }, [phase, confirmExit, question, handleAnswer]);

  // Fast keyboard shortcuts: Left/A = SAI, Right/D = ĐÚNG
  useEffect(() => {
    if (phase !== 'playing' || confirmExit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowLeft' || k === 'a') {
        e.preventDefault();
        handleAnswer(false);
      } else if (e.key === 'ArrowRight' || k === 'd') {
        e.preventDefault();
        handleAnswer(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, confirmExit, handleAnswer]);

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
          <span className="dictToolbarLabel">Tốc độ:</span>
          <div className="segGroup">
            {(['chill', 'normal', 'lightning'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`segBtn ${speed === k ? 'active' : ''}`}
                onClick={() => setSpeed(k)}
              >
                {SPEED_CONFIG[k].label}
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
            Kỷ lục: <b>{personalBest.score}</b> điểm (Combo ×{personalBest.maxCombo})
          </div>
        )}
      </div>

      <div className="planeLayout">
        <div className="matchBoardCard">
          <div className="gameStartBox">
            <div className="planeHeroIcon">
              <IconZap size={34} />
            </div>
            <h3>Phản xạ Đúng / Sai Tia Chớp</h3>
            <p>
              Phán đoán thật nhanh cặp từ Anh – Việt đang hiện là ĐÚNG hay SAI trước khi thanh thời
              gian cạn sạch! Dùng phím <kbd>←</kbd> (Sai) và <kbd>→</kbd> (Đúng) để đạt combo cực
              đại.
            </p>
            <button type="button" className="primary gameBigStartBtn" onClick={startGame}>
              Vào sân chơi toàn màn hình →
            </button>
          </div>
        </div>

        <aside className="planeBoardCard">
          <h3 className="planeBoardTitle">Bảng xếp hạng</h3>
          <p className="planeBoardSub">Đúng / Sai Tia Chớp · Top điểm cao nhất</p>
          {leaderboard.length === 0 ? (
            <div className="empty" style={{ padding: '20px 0' }}>
              Chưa có điểm nào. Thử phản xạ ngay!
            </div>
          ) : (
            <div className="planeBoardList">
              {leaderboard.map((row, idx) => (
                <div key={row.id} className="planeBoardRow">
                  <span className={`rankNum ${idx < 3 ? 'top' : ''}`}>#{idx + 1}</span>
                  <div className="rankInfo">
                    <b>{row.displayName || 'Người chơi'}</b>
                    <span>
                      {row.wordsCleared} câu · Combo ×{row.maxCombo}
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
                <IconZap size={19} />
              </span>
              <div>
                <div className="gameFsTitle">Đúng / Sai Tia Chớp</div>
                <div className="gameFsSub">{SPEED_CONFIG[speed].label}</div>
              </div>
            </div>

            <div className="gameFsHudCenter">
              <div className="matchHudItem">
                <span>ĐIỂM</span>
                <b>{score}</b>
              </div>
              <div className="matchHudItem">
                <span>ĐÚNG</span>
                <b>{cleared}</b>
              </div>
              <div className="matchHudItem">
                <span>COMBO</span>
                <b>×{combo}</b>
              </div>
              <div className="planeHudLives" aria-label={`Còn ${lives} mạng`}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`lifeDot ${i < lives ? 'on' : ''}`} />
                ))}
              </div>
            </div>

            <button type="button" className="gameFsExitBtn light" onClick={requestExit}>
              <IconX size={16} />
              <span>Thoát trò chơi</span>
            </button>
          </header>

          <div className="gameFsBody">
            {phase === 'playing' && question && (
              <div className={`blitzCard ${flash}`}>
                <div className="blitzTimeTrack">
                  <div
                    className={`blitzTimeFill ${timePct < 30 ? 'low' : ''}`}
                    style={{ width: `${timePct}%` }}
                  />
                </div>

                <div className="blitzWordRow">
                  <div className="blitzEn">{capFirst(question.card.word)}</div>
                  <button
                    type="button"
                    className="speakBtn"
                    onClick={() => onSpeak(question.card.word, false)}
                    title="Nghe phát âm"
                  >
                    <IconVolume size={18} />
                  </button>
                </div>

                <div className="blitzEquals">nghĩa là</div>
                <div className="blitzVi">{question.shownMeaning}</div>

                {correction && <div className="blitzCorrection">Đáp án đúng: {correction}</div>}

                <div className="blitzActions">
                  <button
                    type="button"
                    className="blitzBtn no btnIconText centerBtn"
                    onClick={() => handleAnswer(false)}
                  >
                    <IconX size={22} />
                    <span>SAI</span>
                    <kbd>←</kbd>
                  </button>
                  <button
                    type="button"
                    className="blitzBtn yes btnIconText centerBtn"
                    onClick={() => handleAnswer(true)}
                  >
                    <IconCheck size={22} />
                    <span>ĐÚNG</span>
                    <kbd>→</kbd>
                  </button>
                </div>
              </div>
            )}

            {phase === 'over' && (
              <div className="gameStartBox">
                {isNewRecord && <span className="newRecordTag">KỶ LỤC MỚI!</span>}
                <h3>Hết tim!</h3>
                <div className="matchFinalScore">{score} điểm</div>
                <p>
                  Trả lời đúng <b>{cleared}</b> câu · Combo cao nhất <b>×{maxCombo}</b>
                </p>
                <div className="gameOverBtns">
                  <button type="button" className="soft" onClick={() => setPhase('idle')}>
                    Về trung tâm trò chơi
                  </button>
                  <button type="button" className="primary btnIconText" onClick={startGame}>
                    <IconRotateCcw size={16} />
                    <span>Chơi lại ngay</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {confirmExit && (
            <div className="gameConfirmBackdrop">
              <div className="gameConfirmBox">
                <h3>Thoát ván Tia Chớp?</h3>
                <p>Đồng hồ đang tạm dừng. Nếu thoát bây giờ, điểm số của ván này sẽ không được lưu.</p>
                <div className="gameConfirmBtns">
                  <button
                    type="button"
                    className="soft"
                    onClick={() => {
                      qStartRef.current = Date.now() - ((100 - timePct) / 100) * qDurationRef.current;
                      setConfirmExit(false);
                    }}
                  >
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
