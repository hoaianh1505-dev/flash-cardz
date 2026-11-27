'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst, detectPOS, POS_SHORT } from '@/lib/pos';
import type { CardItem } from './FlashcardApp';
import { IconCheck, IconShuffle, IconStar, IconVolume } from './Icons';

interface Props {
  cards: CardItem[];
  onMarkLearned: (id: string, learned: boolean) => void;
  onToggleStar: (id: string) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

type PoolMode = 'unlearned' | 'starred' | 'all' | 'learned';
type PlayPhase = 'idle' | 'speaking-en' | 'speaking-vi' | 'waiting';

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanSpeechText(t: string): string {
  return String(t)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*[=/;|]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PassiveListening({
  cards,
  onMarkLearned,
  onToggleStar,
  onToast,
}: Props) {
  const [poolMode, setPoolMode] = useState<PoolMode>('unlearned');
  const [repeatCount, setRepeatCount] = useState<1 | 2 | 3>(2);
  const [gapSec, setGapSec] = useState<1.5 | 2.5 | 4>(2.5);
  const [slowMode, setSlowMode] = useState(false);
  const [readMeaning, setReadMeaning] = useState(true);
  const [sleepMinutes, setSleepMinutes] = useState<0 | 5 | 10 | 15 | 30>(0);
  const [sleepLeftSec, setSleepLeftSec] = useState<number>(0);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);

  const [queue, setQueue] = useState<CardItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<PlayPhase>('idle');
  const [currentRep, setCurrentRep] = useState(1);
  const [listenedCount, setListenedCount] = useState(0);

  // Audio playback refs for clean, leak-free cancellation
  const runIdRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pool = useMemo(() => {
    const filtered = cards.filter((c) => {
      if (poolMode === 'all') return true;
      if (poolMode === 'learned') return c.learned;
      if (poolMode === 'starred') return Boolean(c.starred);
      return !c.learned;
    });
    return filtered.length ? filtered : cards;
  }, [cards, poolMode]);

  // Keep queue in sync with card updates (star/learned) without resetting position
  useEffect(() => {
    if (!cards.length) {
      setQueue([]);
      return;
    }
    setQueue((prev) => {
      if (!prev.length) return shuffleArray(pool);
      const map = new Map(cards.map((c) => [c.id, c]));
      const updated = prev.map((c) => map.get(c.id)).filter((c): c is CardItem => Boolean(c));
      return updated.length ? updated : shuffleArray(pool);
    });
  }, [cards, pool]);

  const stopAudioNow = useCallback(() => {
    runIdRef.current += 1;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = '';
      } catch {
        /* ignore */
      }
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAudioNow();
  }, [stopAudioNow]);

  // Sleep timer countdown
  useEffect(() => {
    if (!playing || sleepMinutes === 0) return;
    const iv = setInterval(() => {
      setSleepLeftSec((prev) => {
        if (prev <= 1) {
          stopAudioNow();
          setPlaying(false);
          setPhase('idle');
          onToast('Đã hết thời gian hẹn giờ — tạm dừng phát audio', 'info');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [playing, sleepMinutes, stopAudioNow, onToast]);

  const waitMs = useCallback((ms: number, myRunId: number) => {
    return new Promise<boolean>((resolve) => {
      if (runIdRef.current !== myRunId) {
        resolve(false);
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        resolve(runIdRef.current === myRunId);
      }, ms);
    });
  }, []);

  const playTtsOnce = useCallback(
    async (text: string, lang: 'en' | 'vi', slow: boolean, myRunId: number): Promise<boolean> => {
      const clean = cleanSpeechText(text);
      if (!clean || runIdRef.current !== myRunId) return false;

      // Primary: /api/tts MP3 with Web Audio gain boost
      const okServer = await new Promise<boolean>((resolve) => {
        if (runIdRef.current !== myRunId) {
          resolve(false);
          return;
        }
        const url = `/api/tts?q=${encodeURIComponent(clean)}&lang=${lang}&slow=${slow ? '1' : '0'}`;
        const audio = new Audio(url);
        audio.crossOrigin = 'anonymous';
        audioRef.current = audio;

        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          resolve(ok && runIdRef.current === myRunId);
        };

        try {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AC) {
            if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
              audioCtxRef.current = new AC();
            }
            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            const src = ctx.createMediaElementSource(audio);
            const gain = ctx.createGain();
            gain.gain.value = 3.2;
            const comp = ctx.createDynamicsCompressor();
            src.connect(gain);
            gain.connect(comp);
            comp.connect(ctx.destination);
          }
        } catch {
          audio.volume = 1;
        }

        audio.onended = () => done(true);
        audio.onerror = () => done(false);
        audio.play().catch(() => done(false));
      });

      if (okServer || runIdRef.current !== myRunId) return runIdRef.current === myRunId;

      // Fallback: browser Web Speech Synthesis
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        return new Promise<boolean>((resolve) => {
          if (runIdRef.current !== myRunId) {
            resolve(false);
            return;
          }
          const u = new SpeechSynthesisUtterance(clean);
          u.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
          u.rate = slow ? 0.72 : 0.96;
          u.volume = 1;
          u.onend = () => resolve(runIdRef.current === myRunId);
          u.onerror = () => resolve(runIdRef.current === myRunId);
          window.speechSynthesis.speak(u);
        });
      }

      return runIdRef.current === myRunId;
    },
    []
  );

  const current = queue[idx] || null;

  // Main playback loop whenever playing or idx changes
  useEffect(() => {
    if (!playing || !current) {
      setPhase('idle');
      return;
    }

    stopAudioNow();
    const myRunId = runIdRef.current;

    const runCard = async () => {
      // 1. Speak English N times
      for (let r = 1; r <= repeatCount; r++) {
        if (runIdRef.current !== myRunId) return;
        setPhase('speaking-en');
        setCurrentRep(r);
        const ok = await playTtsOnce(current.word, 'en', slowMode, myRunId);
        if (!ok) return;
        if (r < repeatCount) {
          const waited = await waitMs(650, myRunId);
          if (!waited) return;
        }
      }

      // 2. Optionally speak Vietnamese meaning
      if (readMeaning && current.meanings.length > 0) {
        const waited = await waitMs(550, myRunId);
        if (!waited) return;
        setPhase('speaking-vi');
        const viText = current.meanings
          .slice(0, 2)
          .map((m) => m.text)
          .join(', ');
        const okVi = await playTtsOnce(viText, 'vi', false, myRunId);
        if (!okVi) return;
      }

      // 3. Pause before advancing to next card
      setPhase('waiting');
      setListenedCount((c) => c + 1);
      const waited = await waitMs(Math.round(gapSec * 1000), myRunId);
      if (!waited) return;

      setIdx((prev) => (prev + 1 < queue.length ? prev + 1 : 0));
    };

    runCard();

    return () => {
      stopAudioNow();
    };
  }, [
    playing,
    idx,
    current,
    repeatCount,
    slowMode,
    readMeaning,
    gapSec,
    queue.length,
    playTtsOnce,
    waitMs,
    stopAudioNow,
  ]);

  // Media Session API for lock-screen / hardware media keys
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !current) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: capFirst(current.word),
        artist: current.meanings.map((m) => capFirst(m.text)).join('; '),
        album: 'Flashcard TOEIC · Nghe thụ động',
      });
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('play', () => setPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => {
        stopAudioNow();
        setPlaying(false);
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        setIdx((prev) => (prev + 1 < queue.length ? prev + 1 : 0));
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        setIdx((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(0, queue.length - 1)));
      });
    } catch {
      /* ignore unsupported browsers */
    }
  }, [current, playing, queue.length, stopAudioNow]);

  const handleTogglePlay = () => {
    if (playing) {
      stopAudioNow();
      setPlaying(false);
      setPhase('idle');
    } else {
      if (sleepMinutes > 0 && sleepLeftSec === 0) {
        setSleepLeftSec(sleepMinutes * 60);
      }
      setPlaying(true);
    }
  };

  const handleSelectPool = (nextPoolMode: PoolMode) => {
    stopAudioNow();
    setPlaying(false);
    setPhase('idle');
    setPoolMode(nextPoolMode);
    const filtered = cards.filter((c) => {
      if (nextPoolMode === 'all') return true;
      if (nextPoolMode === 'learned') return c.learned;
      if (nextPoolMode === 'starred') return Boolean(c.starred);
      return !c.learned;
    });
    const src = filtered.length ? filtered : cards;
    setQueue(shuffleArray(src));
    setIdx(0);
  };

  const handleShuffle = () => {
    stopAudioNow();
    setQueue(shuffleArray(pool));
    setIdx(0);
    onToast('Đã trộn danh sách nghe thụ động', 'info');
  };

  const handleSelectSleep = (mins: 0 | 5 | 10 | 15 | 30) => {
    setSleepMinutes(mins);
    setSleepLeftSec(mins * 60);
  };

  if (!cards.length || !current) {
    return <div className="empty">Chưa có từ vựng nào để phát âm thanh.</div>;
  }

  const posTags = detectPOS(current);
  const upNext = Array.from({ length: Math.min(4, Math.max(0, queue.length - 1)) }, (_, i) => {
    const targetIdx = (idx + 1 + i) % queue.length;
    return { card: queue[targetIdx], targetIdx };
  });

  const phaseText =
    phase === 'speaking-en'
      ? `Đang đọc Tiếng Anh (${currentRep}/${repeatCount})`
      : phase === 'speaking-vi'
        ? 'Đang đọc Nghĩa Tiếng Việt'
        : phase === 'waiting'
          ? 'Nghỉ nhịp — sắp chuyển từ tiếp theo...'
          : 'Sẵn sàng phát rảnh tay';

  return (
    <div className="dictWrap">
      {/* Collapsible Settings Toolbar */}
      <div className="passiveConfigCard">
        <div className="passiveConfigTop">
          <div className="dictToolbarGroup">
            <span className="dictToolbarLabel">Nguồn từ:</span>
            <div className="segGroup">
              {(
                [
                  ['unlearned', 'Chưa thuộc'],
                  ['starred', 'Gắn sao'],
                  ['all', 'Tất cả'],
                  ['learned', 'Đã thuộc'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`segBtn ${poolMode === k ? 'active' : ''}`}
                  onClick={() => handleSelectPool(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="ghost small"
            onClick={() => setSettingsCollapsed((v) => !v)}
          >
            {settingsCollapsed ? 'Hiện tùy chỉnh ▼' : 'Ẩn tùy chỉnh ▲'}
          </button>
        </div>

        {!settingsCollapsed && (
          <div className="passiveConfigRows">
            <div className="dictToolbarGroup">
              <span className="dictToolbarLabel">Lặp tiếng Anh:</span>
              <div className="segGroup">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`segBtn ${repeatCount === n ? 'active' : ''}`}
                    onClick={() => setRepeatCount(n)}
                  >
                    {n} lần
                  </button>
                ))}
              </div>
            </div>

            <div className="dictToolbarGroup">
              <span className="dictToolbarLabel">Nghỉ chuyển từ:</span>
              <div className="segGroup">
                {([1.5, 2.5, 4] as const).map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    className={`segBtn ${gapSec === sec ? 'active' : ''}`}
                    onClick={() => setGapSec(sec)}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            <div className="dictToolbarGroup">
              <span className="dictToolbarLabel">Tốc độ:</span>
              <div className="segGroup">
                <button
                  type="button"
                  className={`segBtn ${!slowMode ? 'active' : ''}`}
                  onClick={() => setSlowMode(false)}
                >
                  Bình thường
                </button>
                <button
                  type="button"
                  className={`segBtn ${slowMode ? 'active' : ''}`}
                  onClick={() => setSlowMode(true)}
                >
                  Chậm
                </button>
              </div>
            </div>

            <div className="dictToolbarGroup">
              <span className="dictToolbarLabel">Đọc nghĩa Việt:</span>
              <div className="segGroup">
                <button
                  type="button"
                  className={`segBtn ${readMeaning ? 'active' : ''}`}
                  onClick={() => setReadMeaning(true)}
                >
                  Bật
                </button>
                <button
                  type="button"
                  className={`segBtn ${!readMeaning ? 'active' : ''}`}
                  onClick={() => setReadMeaning(false)}
                >
                  Tắt
                </button>
              </div>
            </div>

            <div className="dictToolbarGroup">
              <span className="dictToolbarLabel">Hẹn giờ tắt:</span>
              <div className="segGroup">
                {([0, 5, 10, 15, 30] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`segBtn ${sleepMinutes === m ? 'active' : ''}`}
                    onClick={() => handleSelectSleep(m)}
                  >
                    {m === 0 ? 'Không' : `${m}p`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Podcast / Hands-free Now Playing Stage */}
      <div className="dictStageCard passiveStage">
        <div className="dictStageTop">
          <span className="badge">
            Từ {idx + 1} / {queue.length}
          </span>
          <div className="passiveTopRight">
            {sleepMinutes > 0 && sleepLeftSec > 0 && (
              <span className="passiveTimerBadge">Tắt sau {formatCountdown(sleepLeftSec)}</span>
            )}
            <span className="dictStatLine">Đã nghe: {listenedCount} lượt</span>
          </div>
        </div>

        {/* Fixed-height Live Phase + Waveform Slot (Zero Layout Shift) */}
        <div className="passivePhaseSlot">
          <div className={`passiveWave ${playing && phase !== 'waiting' ? 'active' : ''}`}>
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className={`passivePhaseText ${phase}`}>{phaseText}</span>
        </div>

        {/* Word & Meaning Display */}
        <div className="passiveWordBlock">
          <h2 className="passiveWord">{capFirst(current.word)}</h2>
          <div className="posRow" style={{ justifyContent: 'center', marginBottom: 8 }}>
            {posTags.map((t) => (
              <span key={t} className={`posTag ${t}`}>
                {POS_SHORT[t]}
              </span>
            ))}
          </div>
          <p className="passiveMeaning">
            {current.meanings.map((m) => capFirst(m.text)).join(' · ')}
          </p>
        </div>

        {/* Media Controls */}
        <div className="passiveControls">
          <button
            type="button"
            className="ghost iconOnly"
            title="Trộn danh sách"
            onClick={handleShuffle}
          >
            <IconShuffle size={18} />
          </button>

          <button
            type="button"
            className="soft small"
            onClick={() => setIdx((prev) => (prev - 1 >= 0 ? prev - 1 : queue.length - 1))}
          >
            ← Trước
          </button>

          <button
            type="button"
            className={`passivePlayBtn ${playing ? 'playing' : ''}`}
            onClick={handleTogglePlay}
            aria-label={playing ? 'Tạm dừng phát' : 'Bắt đầu nghe thụ động'}
          >
            {playing ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="5" width="4.5" height="14" rx="1.4" />
                <rect x="13.5" y="5" width="4.5" height="14" rx="1.4" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7.5 5.2v13.6c0 .9 1 1.4 1.7.9l10.2-6.8c.7-.4.7-1.4 0-1.8L9.2 4.3c-.7-.5-1.7 0-1.7.9z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="soft small"
            onClick={() => setIdx((prev) => (prev + 1 < queue.length ? prev + 1 : 0))}
          >
            Tiếp →
          </button>

          <button
            type="button"
            className={`ghost iconOnly ${current.starred ? 'starActive' : ''}`}
            title={current.starred ? 'Bỏ gắn sao' : 'Gắn sao từ này'}
            onClick={() => onToggleStar(current.id)}
          >
            <IconStar size={18} filled={Boolean(current.starred)} />
          </button>
        </div>

        {/* Quick Mark Learned */}
        <div className="passiveQuickRow">
          <button
            type="button"
            className={`soft small btnIconText ${current.learned ? 'active' : ''}`}
            onClick={() => onMarkLearned(current.id, !current.learned)}
          >
            <IconCheck size={15} />
            <span>{current.learned ? 'Đã thuộc từ này' : 'Đánh dấu Đã thuộc'}</span>
          </button>
        </div>

        {/* Up Next Queue Strip */}
        {upNext.length > 0 && (
          <div className="passiveUpNext">
            <span className="passiveUpNextLabel">
              <IconVolume size={14} /> Sắp phát tiếp theo:
            </span>
            <div className="passiveUpNextList">
              {upNext.map(({ card, targetIdx }) => (
                <button
                  key={`${card.id}-${targetIdx}`}
                  type="button"
                  className="passiveUpNextChip"
                  onClick={() => setIdx(targetIdx)}
                >
                  <b>{capFirst(card.word)}</b>
                  <span>{capFirst(card.meanings[0]?.text || '')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
