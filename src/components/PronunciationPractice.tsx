'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst, detectPOS, POS_SHORT } from '@/lib/pos';
import type { CardItem } from './FlashcardApp';
import { IconCheck, IconMic, IconRotateCcw, IconVolume, IconX } from './Icons';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanTarget(word: string): string {
  const cleaned = word.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.split(/\s*[=/]\s*/)[0]?.trim() || cleaned;
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function scorePronunciation(targetRaw: string, alternatives: string[]): {
  pct: number;
  bestHeard: string;
} {
  const target = normalizeText(targetRaw);
  if (!target || !alternatives.length) return { pct: 0, bestHeard: '' };

  let bestPct = 0;
  let bestHeard = alternatives[0] || '';

  for (const alt of alternatives) {
    const heard = normalizeText(alt);
    if (!heard) continue;
    if (heard === target || heard.split(' ').includes(target)) {
      return { pct: 100, bestHeard: alt.trim() };
    }
    const dist = levenshtein(target, heard);
    const maxLen = Math.max(target.length, heard.length);
    const pct = Math.max(0, Math.round((1 - dist / maxLen) * 100));
    if (pct > bestPct) {
      bestPct = pct;
      bestHeard = alt.trim();
    }
  }

  return { pct: bestPct, bestHeard };
}

interface Props {
  cards: CardItem[];
  isSpeaking: boolean;
  onSpeak: (text: string, slow?: boolean) => void;
  onMarkLearned: (id: string, learned: boolean) => void;
  onMarkManyUnlearned: (ids: string[]) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  onSessionComplete?: (summary: {
    mode: 'speaking';
    score: number;
    total: number;
    durationSec: number;
    missedWords: string[];
    missedIds: string[];
  }) => void;
}

export default function PronunciationPractice({
  cards,
  isSpeaking,
  onSpeak,
  onMarkLearned,
  onMarkManyUnlearned,
  onToast,
  onSessionComplete,
}: Props) {
  const [poolMode, setPoolMode] = useState<'unlearned' | 'all' | 'learned'>('unlearned');
  const [sessionSize, setSessionSize] = useState<10 | 20 | 30>(10);
  const [accent, setAccent] = useState<'en-US' | 'en-GB'>('en-US');
  const [supported, setSupported] = useState(true);

  const [queue, setQueue] = useState<CardItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [result, setResult] = useState<{ pct: number; heard: string; passed: boolean } | null>(
    null
  );
  const [passedCount, setPassedCount] = useState(0);
  const [missed, setMissed] = useState<CardItem[]>([]);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const reportedRef = useRef<boolean>(false);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const pool = useMemo(() => {
    const filtered = cards.filter((c) =>
      poolMode === 'all' ? true : poolMode === 'learned' ? c.learned : !c.learned
    );
    return filtered.length ? filtered : cards;
  }, [cards, poolMode]);

  const stopListening = useCallback(() => {
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    }
    setListening(false);
  }, []);

  const startNewSession = useCallback(
    (customPool?: CardItem[], customSize?: 10 | 20 | 30) => {
      stopListening();
      const src = customPool ?? pool;
      const sz = customSize ?? sessionSize;
      const chosen = shuffleArray(src).slice(0, Math.min(sz, src.length));
      setQueue(chosen);
      setIdx(0);
      setInterimText('');
      setResult(null);
      setPassedCount(0);
      setMissed([]);
      startedAtRef.current = Date.now();
      reportedRef.current = false;
      if (chosen[0]) {
        setTimeout(() => onSpeak(cleanTarget(chosen[0].word), false), 140);
      }
    },
    [pool, sessionSize, stopListening, onSpeak]
  );

  useEffect(() => {
    if (cards.length && queue.length === 0) {
      startNewSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length]);

  const current = queue[idx] || null;
  const targetWord = current ? cleanTarget(current.word) : '';
  const finished = queue.length > 0 && idx >= queue.length;

  useEffect(() => {
    if (finished && !reportedRef.current && onSessionComplete) {
      reportedRef.current = true;
      onSessionComplete({
        mode: 'speaking',
        score: passedCount,
        total: queue.length,
        durationSec: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
        missedWords: missed.map((m) => m.word),
        missedIds: missed.map((m) => m.id),
      });
    }
  }, [finished, onSessionComplete, passedCount, queue.length, missed]);

  const beginListen = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || !current) {
      onToast('Trình duyệt này chưa hỗ trợ nhận diện giọng nói. Hãy dùng Chrome hoặc Edge!', 'error');
      return;
    }

    if (listening) {
      stopListening();
      return;
    }

    setResult(null);
    setInterimText('');

    const rec = new Ctor();
    rec.lang = accent;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 5;

    rec.onstart = () => {
      setListening(true);
    };

    rec.onresult = (e) => {
      const lastRes = e.results[e.results.length - 1];
      if (!lastRes) return;

      const alts: string[] = [];
      for (let i = 0; i < lastRes.length; i++) {
        if (lastRes[i]?.transcript) alts.push(lastRes[i].transcript);
      }
      setInterimText(alts[0] || '');

      if (lastRes.isFinal) {
        const scored = scorePronunciation(targetWord, alts);
        const passed = scored.pct >= 75;
        setResult({ pct: scored.pct, heard: scored.bestHeard || alts[0] || '', passed });
        if (passed) {
          setPassedCount((p) => p + 1);
          setMissed((prev) => prev.filter((m) => m.id !== current.id));
        } else {
          setMissed((prev) => (prev.some((m) => m.id === current.id) ? prev : [...prev, current]));
        }
      }
    };

    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed') {
        onToast('Bạn chưa cấp quyền Micro cho trang web. Hãy bấm biểu tượng ổ khoá trên thanh địa chỉ để bật Micro!', 'error');
      } else if (e.error === 'no-speech') {
        onToast('Không nghe thấy giọng nói nào, hãy bấm Micro và đọc to rõ hơn nhé!', 'warning');
      }
    };

    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const advanceNext = (markMissedIfSkipped = false) => {
    stopListening();
    if (markMissedIfSkipped && current && !result?.passed) {
      setMissed((prev) => (prev.some((m) => m.id === current.id) ? prev : [...prev, current]));
    }
    const nextIdx = idx + 1;
    setIdx(nextIdx);
    setResult(null);
    setInterimText('');
    if (queue[nextIdx]) {
      setTimeout(() => onSpeak(cleanTarget(queue[nextIdx].word), false), 120);
    }
  };

  if (!cards.length) {
    return <div className="empty">Chưa có từ vựng nào trong bộ thẻ.</div>;
  }

  return (
    <div className="dictWrap">
      {!supported && (
        <div className="speakUnsupportedBanner">
          Trình duyệt hiện tại chưa hỗ trợ Web Speech Recognition. Vui lòng mở bằng{' '}
          <b>Google Chrome</b>, <b>Microsoft Edge</b> hoặc <b>Safari</b> để luyện nói vào Micro!
        </div>
      )}

      {/* Configuration Toolbar */}
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
          <span className="dictToolbarLabel">Giọng chấm:</span>
          <div className="segGroup">
            <button
              type="button"
              className={`segBtn ${accent === 'en-US' ? 'active' : ''}`}
              onClick={() => setAccent('en-US')}
            >
              Anh – Mỹ (US)
            </button>
            <button
              type="button"
              className={`segBtn ${accent === 'en-GB' ? 'active' : ''}`}
              onClick={() => setAccent('en-GB')}
            >
              Anh – Anh (UK)
            </button>
          </div>
        </div>

        <div className="dictToolbarGroup">
          <span className="dictToolbarLabel">Số từ:</span>
          <div className="segGroup">
            {([10, 20, 30] as const).map((n) => (
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
          <span>Đổi bộ mới</span>
        </button>
      </div>

      {/* Main Speaking / Shadowing Stage */}
      {finished ? (
        <div className="dictStageCard dictSummary">
          <div className="dictScoreBig">
            {passedCount} / {queue.length}
          </div>
          <p className="dictSummarySub">
            Đạt chuẩn {Math.round((passedCount / queue.length) * 100)}% · Luyện phát âm Shadowing
          </p>

          {missed.length > 0 ? (
            <div className="dictMissedBox">
              <div className="dictMissedTitle">Từ phát âm chưa chuẩn ({missed.length})</div>
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
                      onClick={() => onSpeak(cleanTarget(m.word), false)}
                    >
                      <IconVolume size={15} />
                      <span>Nghe mẫu</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="dictPerfectMsg">
              Xuất sắc! Bạn đã phát âm chuẩn toàn bộ {queue.length} từ trong lượt này.
            </p>
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
                  <span>Luyện lại {missed.length} từ chưa chuẩn</span>
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
              Luyện lượt tiếp theo →
            </button>
          </div>
        </div>
      ) : (
        current && (
          <div className="dictStageCard speakStageCard">
            <div className="dictStageTop">
              <span className="cardCountPill">
                Từ {idx + 1} / {queue.length}
              </span>
              <div className="dictTopStats">
                <span>Đạt chuẩn: {passedCount}</span>
              </div>
            </div>

            {/* Target Word + Phonetic + Meaning */}
            <div className="speakWordBlock">
              <div className="speakTargetWord">{capFirst(current.word)}</div>
              <div className="posBadge" style={{ marginTop: 8 }}>
                {detectPOS(current)
                  .filter((t) => t !== 'other')
                  .map((t) => (
                    <span key={t} className="posTagWarm">
                      {POS_SHORT[t]}
                    </span>
                  ))}
              </div>
              {current.meanings[0]?.phonetic && (
                <div className="phonTag">{current.meanings[0].phonetic}</div>
              )}
              <div className="speakMeaningVi">
                {current.meanings.map((m) => capFirst(m.text)).join(' · ')}
              </div>

              <button
                type="button"
                className={`soft btnIconText ${isSpeaking ? 'speaking' : ''}`}
                onClick={() => onSpeak(targetWord, false)}
                style={{ marginTop: 14 }}
              >
                <IconVolume size={17} />
                <span>Nghe phát âm mẫu</span>
              </button>
            </div>

            {/* Big Interactive Microphone Orb */}
            <div className="micArea">
              <button
                type="button"
                disabled={!supported}
                className={`micOrb ${listening ? 'listening' : ''}`}
                onClick={beginListen}
                aria-label={listening ? 'Đang nghe... bấm để dừng' : 'Bấm để đọc vào Micro'}
              >
                <IconMic size={36} />
              </button>
              <div className="micStatusLabel">
                {listening
                  ? 'Đang lắng nghe... hãy đọc to từ tiếng Anh!'
                  : 'Bấm vào Micro rồi đọc to từ phía trên'}
              </div>
            </div>

            {/* Fixed-height Result Slot — ZERO layout shift when result appears */}
            <div className="speakResultSlot">
              {result ? (
                <div className={`speakResultBox ${result.passed ? 'ok' : 'err'}`}>
                  <div className="speakResultPct">{result.pct}%</div>
                  <div className="speakResultMeta">
                    <b>
                      {result.pct === 100
                        ? 'Phát âm cực chuẩn!'
                        : result.passed
                          ? 'Khá chuẩn! Bạn đã vượt qua.'
                          : 'Chưa khớp lắm — hãy nghe mẫu rồi thử đọc lại nhé!'}
                    </b>
                    <span>
                      Micro nghe được: <b>“{result.heard || '(không rõ)'}”</b>
                    </span>
                  </div>
                </div>
              ) : interimText ? (
                <div className="speakResultPlaceholder active">
                  Đang nhận diện: <b>“{interimText}”</b>
                </div>
              ) : (
                <div className="speakResultPlaceholder">
                  Kết quả chấm điểm phát âm sẽ hiển thị tại đây
                </div>
              )}
            </div>

            {/* Bottom Controls */}
            <div className="dictActionRow" style={{ marginTop: 18 }}>
              <button
                type="button"
                className="ghost"
                onClick={() => advanceNext(true)}
              >
                Bỏ qua từ này
              </button>
              {result?.passed && (
                <button
                  type="button"
                  className={current.learned ? 'soft btnIconText' : 'success btnIconText'}
                  onClick={() => onMarkLearned(current.id, !current.learned)}
                >
                  <IconCheck size={16} />
                  <span>{current.learned ? 'Đã thuộc' : 'Đánh dấu Đã thuộc'}</span>
                </button>
              )}
              <button
                type="button"
                className="primary"
                onClick={() => advanceNext(false)}
              >
                Từ tiếp theo →
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
