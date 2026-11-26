'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst } from '@/lib/pos';
import { gameMusic } from '@/lib/gameMusic';
import type { CardItem } from './FlashcardApp';
import { IconGrid, IconMusic, IconRotateCcw, IconX } from './Icons';

interface TileItem {
  uid: string;
  cardId: string;
  kind: 'en' | 'vi';
  text: string;
  speakText: string;
  matched: boolean;
}

interface ScoreEntry {
  id: string;
  displayName?: string;
  subMode: string;
  score: number;
  wordsCleared: number;
  maxCombo: number;
  durationSec: number;
}

interface Props {
  cards: CardItem[];
  isGuest: boolean;
  onSpeak: (text: string, slow?: boolean) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

const GUEST_MATCH_KEY = 'flashcardx_guest_match_scores_v1';

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function MatchPairsGame({ cards, isGuest, onSpeak, onToast }: Props) {
  const [pairCount, setPairCount] = useState<6 | 8>(6);
  const [poolMode, setPoolMode] = useState<'unlearned' | 'all' | 'learned'>('unlearned');
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [confirmExit, setConfirmExit] = useState(false);
  const [musicOn, setMusicOn] = useState(true);

  const [tiles, setTiles] = useState<TileItem[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [wrongPair, setWrongPair] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const [personalBest, setPersonalBest] = useState<{ score: number; durationSec: number } | null>(
    null
  );
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);

  const startRef = useRef<number>(0);

  const pool = useMemo(() => {
    const filtered = cards.filter((c) =>
      poolMode === 'all' ? true : poolMode === 'learned' ? c.learned : !c.learned
    );
    return filtered.length >= pairCount ? filtered : cards;
  }, [cards, poolMode, pairCount]);

  const loadScores = useCallback(async () => {
    if (isGuest) {
      try {
        const raw = localStorage.getItem(GUEST_MATCH_KEY);
        if (raw) {
          const list: ScoreEntry[] = JSON.parse(raw);
          const sorted = [...list].sort((a, b) => b.score - a.score);
          if (sorted[0]) {
            setPersonalBest({ score: sorted[0].score, durationSec: sorted[0].durationSec });
          }
          setLeaderboard(sorted.slice(0, 8));
        }
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const res = await fetch('/api/games/scores?game=match-pairs', { cache: 'no-store' });
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

  useEffect(() => {
    if (phase === 'playing' && !confirmExit && musicOn) {
      gameMusic.start('arcade');
    } else {
      gameMusic.stop();
    }
    return () => gameMusic.stop();
  }, [phase, confirmExit, musicOn]);

  useEffect(() => {
    if (phase !== 'playing' || confirmExit) return;
    const t = setInterval(() => {
      setElapsedMs((prev) => prev + 100);
    }, 100);
    return () => clearInterval(t);
  }, [phase, confirmExit]);

  const saveResult = useCallback(
    async (finalScore: number, cleared: number, bestCombo: number, durationSec: number) => {
      const subMode = `${pairCount}-pairs`;
      if (isGuest) {
        try {
          const raw = localStorage.getItem(GUEST_MATCH_KEY);
          const list: ScoreEntry[] = raw ? JSON.parse(raw) : [];
          const prevMax = list.reduce((m, x) => Math.max(m, x.score), 0);
          setIsNewRecord(finalScore > prevMax);
          const next: ScoreEntry[] = [
            {
              id: `gm-${Date.now()}`,
              displayName: 'Khách',
              subMode,
              score: finalScore,
              wordsCleared: cleared,
              maxCombo: bestCombo,
              durationSec,
            },
            ...list,
          ].slice(0, 20);
          localStorage.setItem(GUEST_MATCH_KEY, JSON.stringify(next));
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
            game: 'match-pairs',
            subMode,
            score: finalScore,
            wordsCleared: cleared,
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
    [isGuest, pairCount, loadScores]
  );

  const startGame = () => {
    if (pool.length < pairCount) {
      onToast(`Cần ít nhất ${pairCount} thẻ để chơi Ghép cặp`, 'error');
      return;
    }
    const chosen = shuffleArray(pool).slice(0, pairCount);
    const deck: TileItem[] = shuffleArray([
      ...chosen.map((c) => ({
        uid: `en-${c.id}`,
        cardId: c.id,
        kind: 'en' as const,
        text: capFirst(c.word),
        speakText: c.word,
        matched: false,
      })),
      ...chosen.map((c) => ({
        uid: `vi-${c.id}`,
        cardId: c.id,
        kind: 'vi' as const,
        text: capFirst(c.meanings[0]?.text || c.word),
        speakText: c.word,
        matched: false,
      })),
    ]);

    setTiles(deck);
    setSelectedUid(null);
    setWrongPair([]);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setMistakes(0);
    setElapsedMs(0);
    setIsNewRecord(false);
    setConfirmExit(false);
    startRef.current = Date.now();
    setPhase('playing');
  };

  const handlePick = (tile: TileItem) => {
    if (phase !== 'playing' || confirmExit || tile.matched || wrongPair.length > 0) return;

    if (tile.kind === 'en') {
      onSpeak(tile.speakText, false);
    }

    if (!selectedUid) {
      setSelectedUid(tile.uid);
      return;
    }

    if (selectedUid === tile.uid) {
      setSelectedUid(null);
      return;
    }

    const first = tiles.find((t) => t.uid === selectedUid);
    if (!first) {
      setSelectedUid(tile.uid);
      return;
    }

    if (first.cardId === tile.cardId && first.kind !== tile.kind) {
      const nextCombo = combo + 1;
      const nextMax = Math.max(maxCombo, nextCombo);
      const pts = 120 + nextCombo * 25;
      const nextScore = score + pts;

      const updated = tiles.map((t) =>
        t.cardId === tile.cardId ? { ...t, matched: true } : t
      );
      setTiles(updated);
      setSelectedUid(null);
      setCombo(nextCombo);
      setMaxCombo(nextMax);
      setScore(nextScore);

      if (updated.every((t) => t.matched)) {
        const sec = Math.max(1, Math.round(elapsedMs / 1000));
        const speedBonus = Math.max(0, (pairCount * 10 - sec) * 15);
        const totalFinal = nextScore + speedBonus;
        setScore(totalFinal);
        setPhase('done');
        saveResult(totalFinal, pairCount, nextMax, sec);
      }
    } else {
      setWrongPair([first.uid, tile.uid]);
      setSelectedUid(null);
      setCombo(0);
      setMistakes((m) => m + 1);
      setScore((s) => Math.max(0, s - 20));
      setTimeout(() => setWrongPair([]), 420);
    }
  };

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
          <span className="dictToolbarLabel">Số cặp:</span>
          <div className="segGroup">
            {([6, 8] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={`segBtn ${pairCount === n ? 'active' : ''}`}
                onClick={() => setPairCount(n)}
              >
                {n} cặp ({n * 2} thẻ)
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
            Kỷ lục: <b>{personalBest.score}</b> điểm ({personalBest.durationSec}s)
          </div>
        )}
      </div>

      <div className="planeLayout">
        <div className="matchBoardCard">
          <div className="gameStartBox">
            <div className="planeHeroIcon">
              <IconGrid size={34} />
            </div>
            <h3>Ghép cặp tốc độ (Match Pairs)</h3>
            <p>
              Chạm 1 thẻ tiếng Anh và 1 thẻ nghĩa tiếng Việt tương ứng để ghép đôi thật nhanh. Càng
              nhanh và ít sai, điểm thưởng tốc độ càng cao!
            </p>
            <button type="button" className="primary gameBigStartBtn" onClick={startGame}>
              Vào sân chơi toàn màn hình →
            </button>
          </div>
        </div>

        <aside className="planeBoardCard">
          <h3 className="planeBoardTitle">Bảng xếp hạng</h3>
          <p className="planeBoardSub">Ghép cặp tốc độ · Top điểm cao nhất</p>
          {leaderboard.length === 0 ? (
            <div className="empty" style={{ padding: '20px 0' }}>
              Chưa có điểm nào. Ghép cặp ngay để lên Top!
            </div>
          ) : (
            <div className="planeBoardList">
              {leaderboard.map((row, idx) => (
                <div key={row.id} className="planeBoardRow">
                  <span className={`rankNum ${idx < 3 ? 'top' : ''}`}>#{idx + 1}</span>
                  <div className="rankInfo">
                    <b>{row.displayName || 'Người chơi'}</b>
                    <span>
                      {row.wordsCleared} cặp · {row.durationSec}s · ×{row.maxCombo}
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
                <IconGrid size={19} />
              </span>
              <div>
                <div className="gameFsTitle">Ghép cặp tốc độ</div>
                <div className="gameFsSub">{pairCount} cặp ({pairCount * 2} thẻ)</div>
              </div>
            </div>

            <div className="gameFsHudCenter">
              <div className="matchHudItem">
                <span>ĐIỂM</span>
                <b>{score}</b>
              </div>
              <div className="matchHudItem">
                <span>THỜI GIAN</span>
                <b>{(elapsedMs / 1000).toFixed(1)}s</b>
              </div>
              <div className="matchHudItem">
                <span>COMBO</span>
                <b>×{combo}</b>
              </div>
              <div className="matchHudItem">
                <span>SAI</span>
                <b>{mistakes}</b>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className={`iconBtn ${musicOn ? 'success' : 'ghost'}`}
                onClick={() => setMusicOn((m) => !m)}
                title={musicOn ? 'Tắt nhạc nền' : 'Bật nhạc nền'}
                aria-label="Nhạc nền"
              >
                <IconMusic size={17} />
              </button>
              <button type="button" className="gameFsExitBtn light" onClick={requestExit}>
                <IconX size={16} />
                <span>Thoát trò chơi</span>
              </button>
            </div>
          </header>

          <div className="gameFsBody">
            {phase === 'playing' && (
              <div className={`matchGrid fsMatchGrid ${pairCount === 8 ? 'grid16' : 'grid12'}`}>
                {tiles.map((t) => {
                  const isSel = selectedUid === t.uid;
                  const isWrong = wrongPair.includes(t.uid);
                  return (
                    <button
                      key={t.uid}
                      type="button"
                      disabled={t.matched}
                      className={`matchTile fsMatchTile ${t.kind} ${isSel ? 'selected' : ''} ${
                        isWrong ? 'wrong' : ''
                      } ${t.matched ? 'matched' : ''}`}
                      onClick={() => handlePick(t)}
                    >
                      <span className="matchTileKind">{t.kind === 'en' ? 'EN' : 'VI'}</span>
                      <span className="matchTileText">{t.text}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {phase === 'done' && (
              <div className="gameStartBox">
                {isNewRecord && <span className="newRecordTag">KỶ LỤC MỚI!</span>}
                <h3>Hoàn thành xuất sắc!</h3>
                <div className="matchFinalScore">{score} điểm</div>
                <p>
                  Thời gian <b>{(elapsedMs / 1000).toFixed(1)}s</b> · Combo cao nhất{' '}
                  <b>×{maxCombo}</b> · Sai <b>{mistakes}</b> lần
                </p>
                <div className="gameOverBtns">
                  <button type="button" className="soft" onClick={() => setPhase('idle')}>
                    Về trung tâm trò chơi
                  </button>
                  <button type="button" className="primary btnIconText" onClick={startGame}>
                    <IconRotateCcw size={16} />
                    <span>Chơi lượt mới</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {confirmExit && (
            <div className="gameConfirmBackdrop">
              <div className="gameConfirmBox">
                <h3>Thoát ván Ghép cặp?</h3>
                <p>Đồng hồ đang tạm dừng. Nếu thoát bây giờ, kết quả lượt này sẽ không được lưu.</p>
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
