'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst, detectPOS, keyOf, POS_SHORT } from '@/lib/pos';
import type { CardItem } from './FlashcardApp';
import {
  IconCheck,
  IconEye,
  IconHeadphones,
  IconLightbulb,
  IconRotateCcw,
  IconVolume,
  IconX,
} from './Icons';

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Extract the primary single word/phrase to dictate cleanly (before = or /) */
function targetTextOf(word: string): string {
  const cleaned = word.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const first = cleaned.split(/\s*[=/]\s*/)[0]?.trim() || cleaned;
  return first;
}

interface Props {
  cards: CardItem[];
  isSpeaking: boolean;
  onSpeak: (text: string, slow?: boolean) => void;
  onMarkLearned: (id: string, learned: boolean) => void;
  onMarkManyUnlearned: (ids: string[]) => void;
  onSessionComplete?: (summary: {
    mode: 'dictation';
    score: number;
    total: number;
    durationSec: number;
    missedWords: string[];
    missedIds: string[];
  }) => void;
}

export default function DictationPractice({
  cards,
  isSpeaking,
  onSpeak,
  onMarkLearned,
  onMarkManyUnlearned,
  onSessionComplete,
}: Props) {
  const [poolMode, setPoolMode] = useState<'unlearned' | 'all' | 'learned'>('unlearned');
  const [sessionSize, setSessionSize] = useState<10 | 20 | 50>(10);
  const [queue, setQueue] = useState<CardItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState<'typing' | 'correct' | 'revealed'>('typing');
  const [showMeaningHint, setShowMeaningHint] = useState(false);
  const [hintChars, setHintChars] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [missed, setMissed] = useState<CardItem[]>([]);
  const startedAtRef = useRef<number>(Date.now());
  const reportedRef = useRef<boolean>(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const pool = useMemo(() => {
    const filtered = cards.filter((c) =>
      poolMode === 'all' ? true : poolMode === 'learned' ? c.learned : !c.learned
    );
    return filtered.length ? filtered : cards;
  }, [cards, poolMode]);

  const startNewSession = useCallback(
    (customPool?: CardItem[], customSize?: 10 | 20 | 50) => {
      const src = customPool ?? pool;
      const sz = customSize ?? sessionSize;
      const chosen = shuffleArray(src).slice(0, Math.min(sz, src.length));
      setQueue(chosen);
      setIdx(0);
      setTyped('');
      setStatus('typing');
      setShowMeaningHint(false);
      setHintChars(0);
      setScore(0);
      setStreak(0);
      setMissed([]);
      startedAtRef.current = Date.now();
      reportedRef.current = false;
      if (chosen[0]) {
        setTimeout(() => {
          onSpeak(targetTextOf(chosen[0].word), false);
          inputRef.current?.focus();
        }, 120);
      }
    },
    [pool, sessionSize, onSpeak]
  );

  // Initialize first session on mount
  useEffect(() => {
    if (cards.length && queue.length === 0) {
      startNewSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length]);

  const current = queue[idx] || null;
  const targetWord = current ? targetTextOf(current.word) : '';
  const finished = queue.length > 0 && idx >= queue.length;

  useEffect(() => {
    if (finished && !reportedRef.current && onSessionComplete) {
      reportedRef.current = true;
      onSessionComplete({
        mode: 'dictation',
        score,
        total: queue.length,
        durationSec: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
        missedWords: missed.map((m) => m.word),
        missedIds: missed.map((m) => m.id),
      });
    }
  }, [finished, onSessionComplete, score, queue.length, missed]);

  const playAudio = useCallback(
    (slow = false) => {
      if (targetWord) {
        onSpeak(targetWord, slow);
        inputRef.current?.focus();
      }
    },
    [targetWord, onSpeak]
  );

  const advanceNext = useCallback(() => {
    const nextIdx = idx + 1;
    setIdx(nextIdx);
    setTyped('');
    setStatus('typing');
    setShowMeaningHint(false);
    setHintChars(0);
    if (queue[nextIdx]) {
      setTimeout(() => {
        onSpeak(targetTextOf(queue[nextIdx].word), false);
        inputRef.current?.focus();
      }, 90);
    }
  }, [idx, queue, onSpeak]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;

    if (status !== 'typing') {
      advanceNext();
      return;
    }

    const userClean = keyOf(typed).replace(/\s+/g, ' ');
    if (!userClean) {
      playAudio(false);
      return;
    }

    const rawClean = current.word.replace(/\([^)]*\)/g, ' ');
    const validTargets = [
      keyOf(targetWord),
      keyOf(current.word),
      ...rawClean.split(/[/=]/).map((x) => keyOf(x)),
    ].filter(Boolean);

    if (validTargets.includes(userClean)) {
      setStatus('correct');
      setScore((s) => s + 1);
      setStreak((st) => st + 1);
      onSpeak(targetWord, false);
    } else {
      // Reveal answer & record missed
      setStatus('revealed');
      setStreak(0);
      setMissed((prev) => (prev.some((m) => m.id === current.id) ? prev : [...prev, current]));
      onSpeak(targetWord, false);
    }
  };

  const giveUpAndReveal = () => {
    if (!current || status !== 'typing') return;
    setStatus('revealed');
    setStreak(0);
    setMissed((prev) => (prev.some((m) => m.id === current.id) ? prev : [...prev, current]));
    onSpeak(targetWord, false);
    inputRef.current?.focus();
  };

  const revealOneMoreLetter = () => {
    if (!targetWord) return;
    const nextCount = Math.min(targetWord.length, hintChars + 1);
    setHintChars(nextCount);
    setTyped(targetWord.slice(0, nextCount));
    inputRef.current?.focus();
  };

  // Masked pattern preview (e.g. "a c _ _ _ _ _ _ _ _")
  const maskedPattern = useMemo(() => {
    if (!targetWord) return '';
    return targetWord
      .split('')
      .map((ch, i) => {
        if (ch === ' ' || ch === '-') return ch;
        if (i < hintChars) return ch;
        return '_';
      })
      .join(' ');
  }, [targetWord, hintChars]);

  if (!cards.length) {
    return <div className="empty">Chưa có từ vựng nào trong bộ thẻ.</div>;
  }

  return (
    <div className="dictWrap">
      {/* Top configuration bar */}
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
                onClick={() => {
                  setPoolMode(k);
                  const nextPool = cards.filter((c) =>
                    k === 'all' ? true : k === 'learned' ? c.learned : !c.learned
                  );
                  startNewSession(nextPool.length ? nextPool : cards, sessionSize);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="dictToolbarGroup">
          <span className="dictToolbarLabel">Số từ:</span>
          <div className="segGroup">
            {([10, 20, 50] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={`segBtn ${sessionSize === n ? 'active' : ''}`}
                onClick={() => {
                  setSessionSize(n);
                  startNewSession(pool, n);
                }}
              >
                {n} từ
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="ghost small btnIconText"
          onClick={() => startNewSession()}
        >
          <IconRotateCcw size={15} />
          <span>Đổi đề mới</span>
        </button>
      </div>

      {/* Main Dictation Stage */}
      {finished ? (
        <div className="dictStageCard dictSummary">
          <div className="dictScoreBig">
            {score} / {queue.length}
          </div>
          <p className="dictSummarySub">
            Độ chính xác {Math.round((score / queue.length) * 100)}% · Luyện nghe chép chính tả
          </p>

          {missed.length > 0 ? (
            <div className="dictMissedBox">
              <div className="dictMissedTitle">Từ nghe nhầm / cần ôn lại ({missed.length})</div>
              <div className="dictMissedList">
                {missed.map((m) => (
                  <div key={m.id} className="dictMissedRow">
                    <div>
                      <b>{capFirst(m.word)}</b>
                      <span>{m.meanings.map((x) => capFirst(x.text)).join('; ')}</span>
                    </div>
                    <button
                      type="button"
                      className="spkBig"
                      onClick={() => onSpeak(targetTextOf(m.word), false)}
                    >
                      <IconVolume size={15} />
                      <span>Nghe</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="dictPerfectMsg">Xuất sắc! Bạn đã nghe và gõ chính xác toàn bộ các từ.</p>
          )}

          <div className="formBtns" style={{ justifyContent: 'center', marginTop: 22 }}>
            {missed.length > 0 && (
              <>
                <button
                  type="button"
                  className="soft btnIconText"
                  onClick={() => startNewSession(missed, sessionSize)}
                >
                  <IconRotateCcw size={15} />
                  <span>Luyện lại {missed.length} từ sai</span>
                </button>
                <button
                  type="button"
                  className="danger btnIconText"
                  onClick={() => onMarkManyUnlearned(missed.map((m) => m.id))}
                >
                  <IconX size={15} />
                  <span>Đánh dấu chưa thuộc</span>
                </button>
              </>
            )}
            <button type="button" className="primary" onClick={() => startNewSession()}>
              Làm lượt tiếp theo →
            </button>
          </div>
        </div>
      ) : (
        current && (
          <div className="dictStageCard">
            <div className="dictStageTop">
              <span className="cardCountPill">
                Từ {idx + 1} / {queue.length}
              </span>
              <div className="dictTopStats">
                <span>Đúng: {score}</span>
                {streak >= 2 && <span className="dictCombo">Liên tiếp ×{streak}</span>}
              </div>
            </div>

            {/* Big speaker focal button */}
            <div className="dictAudioCenter">
              <button
                type="button"
                className={`dictSpeakerOrb ${isSpeaking ? 'speaking' : ''}`}
                onClick={() => playAudio(false)}
                title="Bấm để nghe lại từ tiếng Anh"
              >
                <IconHeadphones size={34} />
              </button>
              <div className="dictAudioBtns">
                <button
                  type="button"
                  className="soft small btnIconText"
                  onClick={() => playAudio(false)}
                >
                  <IconVolume size={15} />
                  <span>Nghe lại</span>
                </button>
                <button
                  type="button"
                  className="ghost small btnIconText"
                  onClick={revealOneMoreLetter}
                  disabled={status !== 'typing'}
                >
                  <IconLightbulb size={15} />
                  <span>Gợi ý chữ ({hintChars}/{targetWord.length})</span>
                </button>
                <button
                  type="button"
                  className="ghost small btnIconText"
                  onClick={() => setShowMeaningHint((v) => !v)}
                  disabled={status !== 'typing'}
                >
                  <IconEye size={15} />
                  <span>{showMeaningHint ? 'Ẩn nghĩa Việt' : 'Xem nghĩa Việt'}</span>
                </button>
              </div>
            </div>

            {/* Character slot guide */}
            <div className="dictMaskLine" aria-label="Độ dài từ">
              {status === 'typing' ? maskedPattern : targetWord}
              <span className="dictCharCount">{targetWord.length} ký tự</span>
            </div>

            {/* Optional Vietnamese hint */}
            {(showMeaningHint || status !== 'typing') && (
              <div className="dictMeaningBox">
                <div className="dictMeaningVi">
                  {current.meanings.map((m) => capFirst(m.text)).join(' · ')}
                </div>
                <div className="dictMeaningSub">
                  {detectPOS(current)
                    .filter((t) => t !== 'other')
                    .map((t) => POS_SHORT[t])
                    .join(' ')}
                  {current.meanings[0]?.phonetic ? `  ${current.meanings[0].phonetic}` : ''}
                </div>
              </div>
            )}

            {/* Input form */}
            <form className="dictForm" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                value={typed}
                readOnly={status !== 'typing'}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.ctrlKey && e.key === ' ') {
                    e.preventDefault();
                    playAudio(false);
                  }
                }}
                className={`dictInput ${
                  status === 'correct' ? 'ok' : status === 'revealed' ? 'err' : ''
                }`}
                placeholder="Nghe và gõ từ tiếng Anh bạn nghe được..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />

              <div className="dictActionRow">
                {status === 'typing' ? (
                  <>
                    <button
                      type="button"
                      className="ghost"
                      onClick={giveUpAndReveal}
                    >
                      Xem đáp án
                    </button>
                    <button type="submit" className="primary">
                      Kiểm tra (Enter)
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={current.learned ? 'soft btnIconText' : 'success btnIconText'}
                      onClick={() => onMarkLearned(current.id, !current.learned)}
                    >
                      <IconCheck size={16} />
                      <span>{current.learned ? 'Đã thuộc' : 'Đánh dấu Đã thuộc'}</span>
                    </button>
                    <button type="submit" className="primary">
                      Từ tiếp theo (Enter) →
                    </button>
                  </>
                )}
              </div>
            </form>

            {/* Feedback banner when answered */}
            {status !== 'typing' && (
              <div className={`dictResultBanner ${status === 'correct' ? 'ok' : 'err'}`}>
                {status === 'correct' ? (
                  <span>
                    Chính xác! <b>{capFirst(current.word)}</b>
                  </span>
                ) : (
                  <span>
                    Đáp án đúng: <b>{capFirst(current.word)}</b>
                    {typed.trim() ? ` (bạn gõ: "${typed.trim()}")` : ''}
                  </span>
                )}
              </div>
            )}

            <div className="kbdHint" style={{ marginTop: 14 }}>
              Mẹo: Nhấn <kbd>Ctrl</kbd> + <kbd>Space</kbd> để nghe lại ngay khi đang gõ · nhấn{' '}
              <kbd>Enter</kbd> để kiểm tra &amp; qua câu tiếp
            </div>
          </div>
        )
      )}
    </div>
  );
}
