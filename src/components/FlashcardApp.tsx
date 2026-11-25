'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst, detectPOS, keyOf, POS_LIST, POS_SHORT, PosKey } from '@/lib/pos';
import IrregularModal from './IrregularModal';
import GrammarModal from './GrammarModal';
import {
  IconBook,
  IconCheck,
  IconDatabase,
  IconDownload,
  IconEdit,
  IconFlame,
  IconLayers,
  IconList,
  IconLogout,
  IconMoon,
  IconPlus,
  IconQuiz,
  IconRotateCcw,
  IconSearch,
  IconShuffle,
  IconSun,
  IconTrash,
  IconUpload,
  IconUser,
  IconVolume,
  IconVolumeOff,
  IconX,
} from './Icons';

export interface MeaningItem {
  text: string;
  type?: string;
  phonetic?: string;
}

export interface CardItem {
  id: string;
  word: string;
  meanings: MeaningItem[];
  learned: boolean;
}

export interface DailyStats {
  streak: number;
  lastDate: string;
  todayCount: number;
}

interface QuizQuestion {
  card: CardItem;
  options: string[];
  correctIdx: number;
}

interface QuizState {
  questions: QuizQuestion[];
  i: number;
  score: number;
  answered: boolean;
  selectedIdx: number | null;
  wrong: CardItem[];
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sortKey(w: string): string {
  return String(w).trim().toLowerCase().replace(/^[^a-z0-9]+/i, '');
}

function firstLetter(w: string): string {
  const c = sortKey(w).charAt(0);
  return /[a-z]/i.test(c) ? c.toUpperCase() : '#';
}

function cleanForSpeech(t: string): string {
  return String(t)
    .replace(/\s*[=/;|]\s*/g, ', ')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function todayVietnamStr(): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(
    now.getUTCDate()
  ).padStart(2, '0')}`;
}

function dayDiff(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000
  );
}

interface Props {
  username: string;
}

export default function FlashcardApp({ username }: Props) {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<DailyStats>({ streak: 0, lastDate: '', todayCount: 0 });

  const [mode, setMode] = useState<'all' | 'unlearned' | 'learned'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | PosKey>('all');
  const [shuffledIds, setShuffledIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');

  // Preferences
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Modals
  const [activeModal, setActiveModal] = useState<
    null | 'edit' | 'review' | 'quiz' | 'data' | 'cat' | 'irr' | 'grammar'
  >(null);

  // Reverse study mode (EN -> VI vs VI -> EN)
  const [reverseMode, setReverseMode] = useState(false);

  // Spelling practice under flashcard
  const [spellInput, setSpellInput] = useState('');
  const [spellStatus, setSpellStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');

  // Recently viewed cards (up to 6)
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Edit / Add form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wordInput, setWordInput] = useState('');
  const [meaningInputs, setMeaningInputs] = useState<string[]>(['']);
  const [savingCard, setSavingCard] = useState(false);
  const wordInputRef = useRef<HTMLInputElement | null>(null);
  const meaningInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Review modal
  const [reviewMode, setReviewMode] = useState<'all' | 'learned' | 'unlearned'>('all');
  const [reviewSearch, setReviewSearch] = useState('');

  // Category modal
  const [catFilter, setCatFilter] = useState<'all' | PosKey>('all');
  const [catSearch, setCatSearch] = useState('');

  // Quiz modal
  const [quizState, setQuizState] = useState<QuizState | null>(null);

  // Data modal
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  // Top-right Toast
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'success' | 'error' }>({
    msg: '',
    type: 'info',
  });
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Loud 4.5x Web Audio TTS pipeline (AudioBufferSourceNode at 1.0x pitch + GainNode + Limiter)
  const enVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speakSeqRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  // Touch swipe refs
  const touchRef = useRef({ x0: 0, y0: 0, t0: 0, tracking: false });
  const suppressFlipRef = useRef(false);
  const flashcardRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ msg, type });
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  useEffect(() => {
    const savedTheme =
      (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
    setTheme(savedTheme);

    try {
      setAutoSpeak(localStorage.getItem('toeic_flashcards_autospeak') === '1');
    } catch {
      /* ignore */
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const pickVoice = () => {
        const vs = window.speechSynthesis.getVoices();
        if (!vs.length) return;
        const en = vs.filter((v) => /^en[-_]/i.test(v.lang));
        const us = en.filter((v) => /^en[-_]US$/i.test(v.lang));
        enVoiceRef.current =
          us.find((v) => /google|natural|online|samantha|aria|jenny|zira|alex/i.test(v.name)) ||
          us[0] ||
          en[0] ||
          null;
      };
      pickVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
    }

    (async () => {
      try {
        const res = await fetch('/api/cards', { cache: 'no-store' });
        if (res.status === 401) {
          window.location.href = '/';
          return;
        }
        const data = await res.json();
        if (Array.isArray(data.cards)) {
          setCards(data.cards);
          setShuffledIds(shuffleArray(data.cards.map((c: CardItem) => c.id)));
        }
        if (data.daily) setDaily(data.daily);
      } catch {
        showToast('Không thể tải dữ liệu từ máy chủ', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const stopSpeech = useCallback(() => {
    speakSeqRef.current++;
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
      } catch {
        /* ignore */
      }
      activeSourceRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    setIsSpeaking(false);
  }, []);

  const speakFallback = useCallback((cleaned: string, slow: boolean, my: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (my === speakSeqRef.current) setIsSpeaking(false);
      return;
    }
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      if (synth.paused) synth.resume();
      const u = new SpeechSynthesisUtterance(cleaned);
      u.lang = 'en-US';
      u.volume = 1.0;
      if (enVoiceRef.current) u.voice = enVoiceRef.current;
      u.rate = slow ? 0.65 : 0.96;
      u.onstart = () => {
        if (my === speakSeqRef.current) setIsSpeaking(true);
      };
      u.onend = u.onerror = () => {
        if (my === speakSeqRef.current) setIsSpeaking(false);
      };
      synth.speak(u);
    } catch {
      if (my === speakSeqRef.current) setIsSpeaking(false);
    }
  }, []);

  // 4.5x loud, crystal-clear TTS via Web Audio GainNode + DynamicsCompressor
  const speak = useCallback(
    async (text: string, slow?: boolean) => {
      const cleaned = cleanForSpeech(text);
      if (!cleaned) return;

      stopSpeech();
      const my = ++speakSeqRef.current;
      setIsSpeaking(true);

      const isSlow = slow === true;
      const cacheKey = `${cleaned.toLowerCase()}|${isSlow ? '1' : '0'}`;

      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) {
          speakFallback(cleaned, isSlow, my);
          return;
        }

        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        let audioBuf = audioBufferCacheRef.current.get(cacheKey);
        if (!audioBuf) {
          const res = await fetch(
            `/api/tts?q=${encodeURIComponent(cleaned)}&slow=${isSlow ? '1' : '0'}`
          );
          if (!res.ok) throw new Error('TTS HTTP error');
          const arrBuf = await res.arrayBuffer();
          audioBuf = await ctx.decodeAudioData(arrBuf);
          if (audioBufferCacheRef.current.size > 180) {
            const oldest = audioBufferCacheRef.current.keys().next().value;
            if (oldest) audioBufferCacheRef.current.delete(oldest);
          }
          audioBufferCacheRef.current.set(cacheKey, audioBuf);
        }

        if (my !== speakSeqRef.current) return;

        const source = ctx.createBufferSource();
        source.buffer = audioBuf;

        // Strong 4.5x gain with limiter compressor for loud, punchy, distortion-free voice
        const gain = ctx.createGain();
        gain.gain.value = 4.5;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 6;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.002;
        compressor.release.value = 0.08;

        source.connect(gain);
        gain.connect(compressor);
        compressor.connect(ctx.destination);

        activeSourceRef.current = source;
        source.onended = () => {
          if (activeSourceRef.current === source) activeSourceRef.current = null;
          if (my === speakSeqRef.current) setIsSpeaking(false);
        };
        source.start(0);
      } catch {
        if (my === speakSeqRef.current) {
          speakFallback(cleaned, isSlow, my);
        }
      }
    },
    [stopSpeech, speakFallback]
  );

  // Filtered view
  const view = useMemo(() => {
    const filtered = cards.filter(
      (c) =>
        (mode === 'all' || (mode === 'learned' ? c.learned : !c.learned)) &&
        (typeFilter === 'all' || detectPOS(c).includes(typeFilter))
    );
    const byId = new Map(filtered.map((c) => [c.id, c]));
    const ordered: CardItem[] = [];
    const seen = new Set<string>();
    for (const id of shuffledIds) {
      const item = byId.get(id);
      if (item) {
        ordered.push(item);
        seen.add(id);
      }
    }
    for (const item of filtered) {
      if (!seen.has(item.id)) ordered.push(item);
    }
    return ordered;
  }, [cards, mode, typeFilter, shuffledIds]);

  const safeIndex = view.length ? Math.min(currentIndex, view.length - 1) : 0;
  const currentCard = view[safeIndex] || null;

  useEffect(() => {
    if (currentIndex >= view.length && view.length > 0) {
      setCurrentIndex(view.length - 1);
    }
  }, [currentIndex, view.length]);

  useEffect(() => {
    document.title = `Flashcard TOEIC — ${cards.length} từ vựng`;
  }, [cards.length]);

  // Track recently viewed cards & reset spelling input when card changes
  useEffect(() => {
    setSpellInput('');
    setSpellStatus('idle');
    if (currentCard?.id) {
      setRecentIds((prev) => [currentCard.id, ...prev.filter((id) => id !== currentCard.id)].slice(0, 7));
    }
  }, [currentCard?.id]);

  const recentCards = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    return recentIds
      .filter((id) => id !== currentCard?.id)
      .map((id) => byId.get(id))
      .filter((c): c is CardItem => Boolean(c))
      .slice(0, 6);
  }, [cards, recentIds, currentCard?.id]);

  const checkSpelling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCard) return;
    const typed = keyOf(spellInput);
    if (!typed) return;
    // Accept exact word or any synonym separated by = or /
    const cleanWord = currentCard.word.replace(/\([^)]*\)/g, ' ');
    const validAnswers = [
      keyOf(currentCard.word),
      keyOf(cleanWord),
      ...cleanWord.split(/[/=]/).map((s) => keyOf(s)),
    ].filter(Boolean);
    if (validAnswers.includes(typed)) {
      setSpellStatus('correct');
      speak(currentCard.word, false);
      showToast('Chính xác! Chuẩn chính tả.', 'success');
    } else {
      setSpellStatus('wrong');
      showToast(`Chưa đúng — đáp án: ${capFirst(currentCard.word)}`, 'error');
    }
  };

  const stats = useMemo(() => {
    const total = cards.length;
    const learned = cards.filter((c) => c.learned).length;
    return {
      total,
      learned,
      remain: total - learned,
      pct: total ? Math.round((learned / total) * 100) : 0,
    };
  }, [cards]);

  const typeCounts = useMemo(() => {
    const base = cards.filter(
      (c) => mode === 'all' || (mode === 'learned' ? c.learned : !c.learned)
    );
    const counts: Record<string, number> = {};
    base.forEach((c) => detectPOS(c).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    return { baseLen: base.length, counts };
  }, [cards, mode]);

  const dailyDisplay = useMemo(() => {
    const t = todayVietnamStr();
    const active = daily.lastDate === t;
    const streak =
      active || (daily.lastDate && dayDiff(daily.lastDate, t) === 1) ? daily.streak || 0 : 0;
    const n = active ? daily.todayCount || 0 : 0;
    return { streak, today: n };
  }, [daily]);

  const speakCurrent = useCallback(() => {
    if (currentCard) speak(currentCard.word, false);
  }, [currentCard, speak]);

  const nextCard = useCallback(() => {
    if (!view.length) return;
    const nextIdx = (safeIndex + 1) % view.length;
    setCurrentIndex(nextIdx);
    setFlipped(false);
    stopSpeech();
    if (autoSpeak && view[nextIdx]) speak(view[nextIdx].word, false);
  }, [view, safeIndex, stopSpeech, autoSpeak, speak]);

  const previousCard = useCallback(() => {
    if (!view.length) return;
    const prevIdx = (safeIndex - 1 + view.length) % view.length;
    setCurrentIndex(prevIdx);
    setFlipped(false);
    stopSpeech();
    if (autoSpeak && view[prevIdx]) speak(view[prevIdx].word, false);
  }, [view, safeIndex, stopSpeech, autoSpeak, speak]);

  const flipCard = useCallback(() => {
    if (suppressFlipRef.current) return;
    const sel = window.getSelection?.()?.toString();
    if (sel && sel.trim()) return;
    if (view.length) setFlipped((f) => !f);
  }, [view.length]);

  const mark = useCallback(
    async (value: boolean) => {
      if (!currentCard) return;
      const id = currentCard.id;

      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, learned: value } : c)));
      setFlipped(false);
      stopSpeech();
      if ((mode === 'unlearned' && value) || (mode === 'learned' && !value)) {
        setShuffledIds((prev) => prev.filter((x) => x !== id));
      }
      showToast(
        value ? 'Đã chuyển vào mục Đã thuộc' : 'Đã chuyển vào mục Chưa thuộc',
        value ? 'success' : 'info'
      );

      try {
        const res = await fetch(`/api/cards/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ learned: value }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.daily) setDaily(data.daily);
        }
      } catch {
        showToast('Lỗi lưu tiến độ lên máy chủ', 'error');
      }
    },
    [currentCard, mode, stopSpeech, showToast]
  );

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('toeic_flashcards_theme', next);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleAutoSpeak = useCallback(() => {
    const next = !autoSpeak;
    setAutoSpeak(next);
    try {
      localStorage.setItem('toeic_flashcards_autospeak', next ? '1' : '0');
    } catch {
      /* ignore */
    }
    showToast(next ? 'Tự động đọc: BẬT' : 'Tự động đọc: TẮT');
    if (next && currentCard) speak(currentCard.word, false);
  }, [autoSpeak, currentCard, speak, showToast]);

  const handleModeChange = (m: 'all' | 'unlearned' | 'learned') => {
    setMode(m);
    setCurrentIndex(0);
    setFlipped(false);
    setShuffledIds(shuffleArray(cards.map((c) => c.id)));
  };

  const handleTypeChange = (t: 'all' | PosKey) => {
    setTypeFilter(t);
    setCurrentIndex(0);
    setFlipped(false);
    setShuffledIds(shuffleArray(cards.map((c) => c.id)));
  };

  const handleShuffle = () => {
    setShuffledIds(shuffleArray(cards.map((c) => c.id)));
    setCurrentIndex(0);
    setFlipped(false);
    showToast('Đã trộn ngẫu nhiên các thẻ');
  };

  const jumpToCard = useCallback((id: string) => {
    setMode('all');
    setTypeFilter('all');
    setFlipped(false);
    setActiveModal(null);
    setShuffledIds((prev) => {
      const rest = prev.filter((x) => x !== id);
      return [id, ...rest];
    });
    setCurrentIndex(0);
    setTimeout(() => {
      flashcardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }, []);

  const handleQuickSearch = (val: string) => {
    setQuickSearch(val);
    const q = keyOf(val);
    if (!q) return;
    const found = cards.find(
      (c) => keyOf(c.word).includes(q) || c.meanings.some((m) => keyOf(m.text).includes(q))
    );
    if (found) jumpToCard(found.id);
  };

  const openAdd = () => {
    setEditingId(null);
    setWordInput('');
    setMeaningInputs(['']);
    setActiveModal('edit');
    setTimeout(() => wordInputRef.current?.focus(), 50);
  };

  const openEdit = (card: CardItem) => {
    setEditingId(card.id);
    setWordInput(card.word);
    setMeaningInputs(card.meanings.map((m) => m.text));
    setActiveModal('edit');
    setTimeout(() => wordInputRef.current?.focus(), 50);
  };

  const saveCard = async (keepOpen = false) => {
    const w = wordInput.trim();
    const cleaned = meaningInputs.map((x) => x.trim()).filter(Boolean);
    if (!w || !cleaned.length) {
      showToast('Vui lòng nhập từ và ít nhất một nghĩa.', 'error');
      return;
    }

    setSavingCard(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/cards/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: w,
            meanings: cleaned.map((text) => ({ text })),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Lỗi cập nhật thẻ.', 'error');
          return;
        }
        setCards((prev) => prev.map((c) => (c.id === editingId ? data.card : c)));
        setActiveModal(null);
        showToast('Đã cập nhật flashcard', 'success');
      } else {
        const res = await fetch('/api/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: w,
            meanings: cleaned.map((text) => ({ text })),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Lỗi thêm thẻ.', 'error');
          return;
        }
        if (data.merged) {
          setCards((prev) => prev.map((c) => (c.id === data.card.id ? data.card : c)));
          showToast(
            data.addedAny
              ? `Đã gộp nghĩa mới vào "${capFirst(data.card.word)}"`
              : 'Từ này đã có sẵn nghĩa đó rồi',
            'info'
          );
        } else {
          setCards((prev) => [data.card, ...prev]);
          setShuffledIds((prev) => [data.card.id, ...prev]);
          setMode('all');
          setTypeFilter('all');
          setCurrentIndex(0);
          showToast(`Đã thêm: ${capFirst(data.card.word)}`, 'success');
        }

        if (keepOpen) {
          setWordInput('');
          setMeaningInputs(['']);
          setTimeout(() => wordInputRef.current?.focus(), 20);
        } else {
          setActiveModal(null);
        }
      }
    } catch {
      showToast('Không thể kết nối máy chủ.', 'error');
    } finally {
      setSavingCard(false);
    }
  };

  const deleteCard = async (card: CardItem) => {
    if (
      !confirm(`Xoá toàn bộ thẻ "${capFirst(card.word)}" (gồm ${card.meanings.length} nghĩa)?`)
    )
      return;
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    setShuffledIds((prev) => prev.filter((x) => x !== card.id));
    showToast('Đã xoá flashcard');
    try {
      await fetch(`/api/cards/${card.id}`, { method: 'DELETE' });
    } catch {
      showToast('Lỗi xoá thẻ trên máy chủ', 'error');
    }
  };

  const toggleLearnedInList = async (card: CardItem) => {
    const nextVal = !card.learned;
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, learned: nextVal } : c)));
    showToast(
      nextVal ? 'Đã chuyển vào mục Đã thuộc' : 'Đã chuyển vào mục Chưa thuộc',
      nextVal ? 'success' : 'info'
    );
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learned: nextVal }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.daily) setDaily(data.daily);
      }
    } catch {
      showToast('Lỗi đồng bộ lên máy chủ', 'error');
    }
  };

  const openQuiz = useCallback(() => {
    const pool = view.length >= 4 ? view : cards;
    if (pool.length < 4) {
      showToast('Cần ít nhất 4 thẻ để trắc nghiệm', 'error');
      return;
    }
    const n = Math.min(10, pool.length);
    const chosen = shuffleArray(pool).slice(0, n);
    const questions: QuizQuestion[] = chosen.map((card) => {
      const correct = capFirst(card.meanings[0].text);
      const others = shuffleArray(pool.filter((c) => c.id !== card.id))
        .slice(0, 3)
        .map((c) => capFirst(c.meanings[0].text));
      const options = shuffleArray([correct, ...others]);
      return { card, options, correctIdx: options.indexOf(correct) };
    });
    setQuizState({ questions, i: 0, score: 0, answered: false, selectedIdx: null, wrong: [] });
    setActiveModal('quiz');
    if (autoSpeak && questions[0]) speak(questions[0].card.word, false);
  }, [view, cards, showToast, autoSpeak, speak]);

  const handleQuizPick = useCallback(
    (idx: number) => {
      setQuizState((prev) => {
        if (!prev || prev.answered) return prev;
        const q = prev.questions[prev.i];
        const isCorrect = idx === q.correctIdx;
        const nextScore = isCorrect ? prev.score + 1 : prev.score;
        const nextWrong = isCorrect ? prev.wrong : [...prev.wrong, q.card];

        setTimeout(() => {
          setQuizState((cur) => {
            if (!cur) return cur;
            const nextI = cur.i + 1;
            if (autoSpeak && cur.questions[nextI]) {
              speak(cur.questions[nextI].card.word, false);
            }
            return { ...cur, i: nextI, answered: false, selectedIdx: null };
          });
        }, isCorrect ? 650 : 1200);

        return {
          ...prev,
          score: nextScore,
          answered: true,
          selectedIdx: idx,
          wrong: nextWrong,
        };
      });
    },
    [autoSpeak, speak]
  );

  const markWrongUnlearned = async () => {
    if (!quizState?.wrong.length) return;
    const ids = quizState.wrong.map((c) => c.id);
    const idSet = new Set(ids);
    setCards((prev) => prev.map((c) => (idSet.has(c.id) ? { ...c, learned: false } : c)));
    setActiveModal(null);
    showToast(`Đã đánh dấu ${ids.length} từ là chưa thuộc`);
    try {
      await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-unlearned', ids }),
      });
    } catch {
      showToast('Lỗi đồng bộ lên máy chủ', 'error');
    }
  };

  const exportData = () => {
    const payload = cards.map((c, idx) => ({
      id: idx + 1,
      word: c.word,
      meanings: c.meanings,
      learned: c.learned,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flashcard-toeic-${username}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Đã tải xuống file sao lưu JSON', 'success');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) || !parsed.length) throw new Error('File JSON không hợp lệ.');
      const res = await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', cards: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Nhập dữ liệu thất bại.');
      setCards(data.cards);
      setShuffledIds(shuffleArray(data.cards.map((c: CardItem) => c.id)));
      setCurrentIndex(0);
      setActiveModal(null);
      showToast(`Đã phục hồi ${data.cards.length} thẻ từ file`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'File không hợp lệ.', 'error');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const resetProgress = async () => {
    if (
      !confirm(
        'Đặt lại toàn bộ trạng thái "đã thuộc" về "chưa thuộc"? Các thẻ tự thêm vẫn được giữ nguyên.'
      )
    )
      return;
    setCards((prev) => prev.map((c) => ({ ...c, learned: false })));
    setActiveModal(null);
    showToast('Đã đặt lại tiến độ học');
    try {
      await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-progress' }),
      });
    } catch {
      showToast('Lỗi đồng bộ lên máy chủ', 'error');
    }
  };

  const handleLogout = async () => {
    stopSpeech();
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        setActiveModal(null);
        stopSpeech();
        return;
      }
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = (e.key || '').toLowerCase();

      if (activeModal === 'quiz' && quizState && quizState.i < quizState.questions.length) {
        if (k >= '1' && k <= '4' && !quizState.answered) {
          e.preventDefault();
          handleQuizPick(Number(k) - 1);
        } else if (k === 'r' || k === 's') {
          e.preventDefault();
          speak(quizState.questions[quizState.i].card.word, false);
        }
        return;
      }

      if (activeModal) return;

      if (e.key === 'ArrowRight') nextCard();
      else if (e.key === 'ArrowLeft') previousCard();
      else if (e.key === ' ') {
        e.preventDefault();
        flipCard();
      } else if (k === 'c') {
        e.preventDefault();
        mark(false);
      } else if (k === 'v') {
        e.preventDefault();
        mark(true);
      } else if (k === 'r' || k === 's') {
        e.preventDefault();
        speakCurrent();
      } else if (k === 'a') {
        e.preventDefault();
        toggleAutoSpeak();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    activeModal,
    quizState,
    handleQuizPick,
    speak,
    stopSpeech,
    nextCard,
    previousCard,
    flipCard,
    mark,
    speakCurrent,
    toggleAutoSpeak,
  ]);

  const reviewFiltered = useMemo(() => {
    const q = keyOf(reviewSearch);
    const arr = cards.filter(
      (c) =>
        (reviewMode === 'all' || (reviewMode === 'learned' ? c.learned : !c.learned)) &&
        (keyOf(c.word).includes(q) || c.meanings.some((m) => keyOf(m.text).includes(q)))
    );
    arr.sort((a, b) => sortKey(a.word).localeCompare(sortKey(b.word), 'en'));
    const letters: Record<string, number> = {};
    arr.forEach((c) => {
      const L = firstLetter(c.word);
      letters[L] = (letters[L] || 0) + 1;
    });
    return { arr, letters };
  }, [cards, reviewMode, reviewSearch]);

  const catData = useMemo(() => {
    const counts: Record<string, number> = {};
    cards.forEach((c) => detectPOS(c).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    const q = keyOf(catSearch);
    const arr = cards.filter(
      (c) =>
        (catFilter === 'all' || detectPOS(c).includes(catFilter)) &&
        (keyOf(c.word).includes(q) || c.meanings.some((m) => keyOf(m.text).includes(q)))
    );
    arr.sort((a, b) => sortKey(a.word).localeCompare(sortKey(b.word), 'en'));
    const letters: Record<string, number> = {};
    arr.forEach((c) => {
      const L = firstLetter(c.word);
      letters[L] = (letters[L] || 0) + 1;
    });
    return { counts, arr, letters };
  }, [cards, catFilter, catSearch]);

  const jumpLetter = (prefix: string, L: string) => {
    const el = document.getElementById(`${prefix}-${L === '#' ? '0' : L}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Circular SVG ring math
  const ringRadius = 46;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - stats.pct / 100);

  if (loading) {
    return (
      <div className="authWrap">
        <div className="authCard" style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>Flashcard TOEIC</h1>
          <p className="note">Đang tải bộ thẻ của {username}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="workspaceRoot">
      {/* Top sticky navigation bar matching reference design */}
      <header className="topBar">
        <div className="topBarInner">
          <div className="topBrand">
            <span className="topBrandMark">
              <IconBook size={18} />
            </span>
            <span className="topBrandName">Flashcard TOEIC</span>
            <span className="topCountPill">{stats.total} từ vựng</span>
          </div>

          <div className="topSearchWrap">
            <IconSearch size={16} className="searchFieldIcon" />
            <input
              value={quickSearch}
              onChange={(e) => handleQuickSearch(e.target.value)}
              placeholder="Tìm nhanh & nhảy tới thẻ..."
            />
          </div>

          <div className="topActions">
            <span className="userBadge">
              <IconUser size={14} />
              <span>{username}</span>
            </span>
            <button
              type="button"
              className={`iconBtn ${autoSpeak ? 'success' : 'ghost'}`}
              onClick={toggleAutoSpeak}
              title="Tự động đọc khi chuyển thẻ (A)"
              aria-label="Tự động đọc"
            >
              {autoSpeak ? <IconVolume size={18} /> : <IconVolumeOff size={18} />}
            </button>
            <button
              type="button"
              className="iconBtn ghost"
              onClick={toggleTheme}
              title="Đổi giao diện sáng/tối"
              aria-label="Đổi giao diện sáng/tối"
            >
              {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>
            <button
              type="button"
              className="ghost btnIconText"
              onClick={() => setActiveModal('data')}
              title="Sao lưu / phục hồi JSON"
            >
              <IconDatabase size={16} />
              <span>Dữ liệu</span>
            </button>
            <button type="button" className="primary btnIconText" onClick={openAdd}>
              <IconPlus size={16} />
              <span>Thêm từ</span>
            </button>
            <button
              type="button"
              className="ghost btnIconText"
              onClick={handleLogout}
              title="Đăng xuất"
            >
              <IconLogout size={15} />
              <span>Thoát</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main 3-column workspace */}
      <div className="triGrid">
        {/* LEFT COLUMN: Mode selector + Vertical POS list */}
        <aside className="leftCol" aria-label="Lọc từ vựng">
          <div className="leftModeTabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'all'}
              className={`leftModeTab ${mode === 'all' ? 'active' : ''}`}
              onClick={() => handleModeChange('all')}
            >
              <span>Tất cả</span>
              <span className="leftModeNum">{stats.total}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'unlearned'}
              className={`leftModeTab ${mode === 'unlearned' ? 'active' : ''}`}
              onClick={() => handleModeChange('unlearned')}
            >
              <span>Chưa thuộc</span>
              <span className="leftModeNum">{stats.remain}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'learned'}
              className={`leftModeTab ${mode === 'learned' ? 'active' : ''}`}
              onClick={() => handleModeChange('learned')}
            >
              <span>Đã thuộc</span>
              <span className="leftModeNum">{stats.learned}</span>
            </button>
          </div>

          <div className="posListCard">
            <button
              type="button"
              className={`posListRow ${typeFilter === 'all' ? 'active' : ''}`}
              onClick={() => handleTypeChange('all')}
            >
              <span>Tất cả</span>
              <span className="posListNum">{typeCounts.baseLen}</span>
            </button>
            {POS_LIST.map(([k, label]) => {
              const n = typeCounts.counts[k] || 0;
              if (!n && typeFilter !== k) return null;
              return (
                <button
                  key={k}
                  type="button"
                  className={`posListRow ${typeFilter === k ? 'active' : ''}`}
                  onClick={() => handleTypeChange(k)}
                >
                  <span>{label}</span>
                  <span className="posListNum">{n}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* CENTER COLUMN: Card status bar + Big centered Flashcard + Action row */}
        <main className="centerCol">
          <div className="centerTopBar">
            <div className="centerTopLeft">
              <span className="centerCounter">
                {view.length ? `${safeIndex + 1} / ${view.length}` : '0 / 0'}
              </span>
              {currentCard && (
                <span className={`cardStatePill ${currentCard.learned ? 'ok' : ''}`}>
                  <span className={`dot ${currentCard.learned ? 'ok' : ''}`} />
                  {currentCard.learned ? 'Đã thuộc' : 'Chưa thuộc'}
                </span>
              )}
            </div>

            <div className="centerTopActions">
              <button
                type="button"
                className={`dirPillBtn ${reverseMode ? 'active' : ''}`}
                onClick={() => {
                  setReverseMode((r) => !r);
                  setFlipped(false);
                  showToast(
                    !reverseMode ? 'Chế độ: Nghĩa Việt → Từ Anh' : 'Chế độ: Từ Anh → Nghĩa Việt'
                  );
                }}
                title="Đảo chiều mặt trước / mặt sau"
              >
                {reverseMode ? 'VI → EN' : 'EN → VI'}
              </button>
              <button
                type="button"
                className="barIconBtn"
                onClick={handleShuffle}
                title="Trộn ngẫu nhiên"
                aria-label="Trộn ngẫu nhiên"
              >
                <IconShuffle size={18} />
              </button>
              {currentCard && (
                <>
                  <button
                    type="button"
                    className={`barIconBtn ${isSpeaking ? 'speaking' : ''}`}
                    onClick={speakCurrent}
                    title="Phát âm to rõ (R)"
                    aria-label="Phát âm"
                  >
                    <IconVolume size={19} />
                  </button>
                  <button
                    type="button"
                    className="barIconBtn"
                    onClick={() => openEdit(currentCard)}
                    title="Sửa thẻ"
                    aria-label="Sửa thẻ"
                  >
                    <IconEdit size={18} />
                  </button>
                  <button
                    type="button"
                    className="barIconBtn dangerHover"
                    onClick={() => deleteCard(currentCard)}
                    title="Xoá thẻ này"
                    aria-label="Xoá thẻ này"
                  >
                    <IconTrash size={18} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 3D Flip Flashcard */}
          <div
            ref={flashcardRef}
            className={`card triCard ${flipped ? 'flipped' : ''}`}
            onClick={flipCard}
            onTouchStart={(e) => {
              if (e.touches.length !== 1) {
                touchRef.current.tracking = false;
                return;
              }
              touchRef.current = {
                x0: e.touches[0].clientX,
                y0: e.touches[0].clientY,
                t0: Date.now(),
                tracking: true,
              };
            }}
            onTouchEnd={(e) => {
              if (!touchRef.current.tracking) return;
              touchRef.current.tracking = false;
              const t = e.changedTouches[0];
              const dx = t.clientX - touchRef.current.x0;
              const dy = t.clientY - touchRef.current.y0;
              if (
                Math.abs(dx) > 55 &&
                Math.abs(dx) > Math.abs(dy) * 1.5 &&
                Date.now() - touchRef.current.t0 < 700
              ) {
                suppressFlipRef.current = true;
                setTimeout(() => {
                  suppressFlipRef.current = false;
                }, 350);
                if (dx < 0) nextCard();
                else previousCard();
              }
            }}
          >
            <div className="inner triInner">
              <div className="face triFace">
                {reverseMode && currentCard ? (
                  <>
                    <div className="label">TIẾNG VIỆT</div>
                    <div className="meaningList">
                      {currentCard.meanings.map((m, idx) => (
                        <div key={idx} className="meaningItem">
                          {capFirst(m.text)}
                        </div>
                      ))}
                    </div>
                    <div className="hint">Bấm vào thẻ hoặc nhấn Space để xem từ tiếng Anh</div>
                  </>
                ) : (
                  <>
                    <div className="label">ENGLISH</div>
                    <div className="word triWord">
                      {currentCard
                        ? capFirst(currentCard.word)
                        : typeFilter !== 'all' && cards.length
                          ? 'Không có thẻ thuộc loại từ này'
                          : mode === 'learned'
                            ? 'Chưa có thẻ đã thuộc'
                            : mode === 'unlearned'
                              ? 'Bạn đã thuộc hết bộ thẻ này'
                              : 'Chưa có flashcard'}
                    </div>
                    {currentCard && (
                      <>
                        <div className="posBadge">
                          {detectPOS(currentCard)
                            .filter((t) => t !== 'other')
                            .map((t) => (
                              <span key={t} className="posTagWarm">
                                {POS_SHORT[t]}
                              </span>
                            ))}
                        </div>
                        {currentCard.meanings[0]?.phonetic && (
                          <div className="phonTag">{currentCard.meanings[0].phonetic}</div>
                        )}
                      </>
                    )}
                    <div className="hint">Bấm vào thẻ hoặc nhấn Space để xem nghĩa</div>
                  </>
                )}
              </div>

              <div className="face back triFace">
                {reverseMode && currentCard ? (
                  <>
                    <div className="label">ENGLISH</div>
                    <div className="word triWord">{capFirst(currentCard.word)}</div>
                    <div className="posBadge">
                      {detectPOS(currentCard)
                        .filter((t) => t !== 'other')
                        .map((t) => (
                          <span key={t} className="posTagWarm">
                            {POS_SHORT[t]}
                          </span>
                        ))}
                    </div>
                    {currentCard.meanings[0]?.phonetic && (
                      <div className="phonTag">{currentCard.meanings[0].phonetic}</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="label">TIẾNG VIỆT</div>
                    <div className="meaningList">
                      {currentCard?.meanings.map((m, idx) => (
                        <div key={idx} className="meaningItem">
                          {capFirst(m.text)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Row directly below card */}
          <div className="triControls">
            <button type="button" className="triBtnOutline" onClick={previousCard}>
              ← Trước
            </button>
            <button
              type="button"
              className="triBtnOutline triBtnUnlearned btnIconText centerBtn"
              onClick={() => mark(false)}
            >
              <IconX size={16} />
              <span>Chưa thuộc</span>
              <span className="keyTag">[C]</span>
            </button>
            <button
              type="button"
              className="triBtnSolid btnIconText centerBtn"
              onClick={() => mark(true)}
            >
              <IconCheck size={16} />
              <span>Đã thuộc</span>
              <span className="keyTagSolid">[V]</span>
            </button>
            <button type="button" className="triBtnSolid" onClick={nextCard}>
              Tiếp →
            </button>
          </div>

          {/* Spelling Practice Panel (fills lower stage purposefully) */}
          {currentCard && (
            <form className="spellCard" onSubmit={checkSpelling}>
              <div className="spellHead">
                <span className="spellTitle">Luyện gõ chính tả</span>
                <span className="spellHint">
                  {reverseMode
                    ? 'Nhập từ tiếng Anh tương ứng với nghĩa trên thẻ'
                    : `Nghĩa: ${capFirst(currentCard.meanings[0].text)}`}
                </span>
              </div>
              <div className="spellRow">
                <input
                  value={spellInput}
                  onChange={(e) => {
                    setSpellInput(e.target.value);
                    if (spellStatus !== 'idle') setSpellStatus('idle');
                  }}
                  className={
                    spellStatus === 'correct'
                      ? 'spellOk'
                      : spellStatus === 'wrong'
                        ? 'spellErr'
                        : ''
                  }
                  placeholder="Gõ lại từ tiếng Anh rồi nhấn Enter để kiểm tra..."
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="submit" className="soft">
                  Kiểm tra
                </button>
              </div>
            </form>
          )}

          {/* Recently Studied Cards Strip */}
          {recentCards.length > 0 && (
            <div className="recentStrip">
              <span className="recentLabel">Vừa xem:</span>
              <div className="recentChips">
                {recentCards.map((rc) => (
                  <button
                    key={rc.id}
                    type="button"
                    className={`recentChip ${rc.learned ? 'ok' : ''}`}
                    onClick={() => jumpToCard(rc.id)}
                    title={rc.meanings.map((m) => capFirst(m.text)).join('; ')}
                  >
                    {capFirst(rc.word)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* RIGHT COLUMN: Circular Progress + Quiz Banner + Lookup & Manage */}
        <aside className="rightCol" aria-label="Tiến độ và công cụ">
          {/* Circular Progress Card */}
          <div className="rightCard progressCard">
            <h3 className="rightCardTitle">Tiến độ học tập</h3>
            <div className="ringWrap">
              <svg width="116" height="116" viewBox="0 0 116 116" aria-hidden="true">
                <circle
                  cx="58"
                  cy="58"
                  r={ringRadius}
                  fill="none"
                  stroke="var(--line-soft)"
                  strokeWidth="9"
                />
                <circle
                  cx="58"
                  cy="58"
                  r={ringRadius}
                  fill="none"
                  stroke="var(--teal)"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 58 58)"
                  style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                />
              </svg>
              <span className="ringText">{stats.pct}%</span>
            </div>
            <div className="ringSub">
              {stats.learned} / {stats.total} đã thuộc
            </div>
            <div className="streakBadge">
              <IconFlame size={15} className="flameIcon" />
              <span>
                Chuỗi {dailyDisplay.streak} ngày
                {dailyDisplay.today > 0 ? ` · +${dailyDisplay.today}` : ''}
              </span>
            </div>
          </div>

          {/* Quiz Banner Card */}
          <div className="quizBanner">
            <div>
              <div className="quizBannerTitle">Trắc nghiệm nhanh</div>
              <div className="quizBannerSub">Kiểm tra 10 từ ngẫu nhiên</div>
            </div>
            <button type="button" className="quizBannerBtn" onClick={openQuiz}>
              Bắt đầu
            </button>
          </div>

          {/* Lookup & Manage Card */}
          <div className="rightCard">
            <h3 className="rightCardTitle">Tra cứu &amp; Quản lý</h3>
            <div className="toolStack">
              <button
                type="button"
                className="toolRowCard"
                onClick={() => setActiveModal('grammar')}
              >
                <div className="toolRowText">
                  <b>Ngữ pháp &amp; IPA TOEIC</b>
                  <span>12 thì, từ loại Part 5, liên từ &amp; 44 âm IPA</span>
                </div>
                <span className="openPill">Mở</span>
              </button>

              <button
                type="button"
                className="toolRowCard"
                onClick={() => setActiveModal('irr')}
              >
                <div className="toolRowText">
                  <b>Động từ bất quy tắc</b>
                  <span>100 từ thông dụng &amp; 360 từ V1/V2/V3</span>
                </div>
                <span className="openPill">Mở</span>
              </button>

              <button
                type="button"
                className="toolRowCard"
                onClick={() => {
                  setCatFilter('all');
                  setCatSearch('');
                  setActiveModal('cat');
                }}
              >
                <div className="toolRowText">
                  <b>Theo từ loại</b>
                  <span>Xem danh, động, tính, cụm từ</span>
                </div>
                <span className="openPill">Mở</span>
              </button>

              <button
                type="button"
                className="toolRowCard"
                onClick={() => {
                  setReviewMode('all');
                  setReviewSearch('');
                  setActiveModal('review');
                }}
              >
                <div className="toolRowText">
                  <b>Quản lý từ vựng</b>
                  <span>Xem A-Z, sửa, gộp, xoá</span>
                </div>
                <span className="openPill">Mở</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Add / Edit Modal */}
      {activeModal === 'edit' && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="box">
            <button
              type="button"
              className="closeX"
              onClick={() => setActiveModal(null)}
              aria-label="Đóng"
            >
              <IconX size={20} />
            </button>
            <h2>{editingId ? 'Sửa flashcard' : 'Thêm flashcard'}</h2>

            <label>
              Từ / cụm từ tiếng Anh
              <input
                ref={wordInputRef}
                value={wordInput}
                onChange={(e) => setWordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    meaningInputRefs.current[0]?.focus();
                  }
                }}
                placeholder="Ví dụ: precise"
                autoComplete="off"
              />
            </label>

            {meaningInputs.map((val, idx) => (
              <div key={idx} className="meaningRow">
                <input
                  ref={(el) => {
                    meaningInputRefs.current[idx] = el;
                  }}
                  value={val}
                  onChange={(e) => {
                    const copy = [...meaningInputs];
                    copy[idx] = e.target.value;
                    setMeaningInputs(copy);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveCard(!editingId);
                    }
                  }}
                  placeholder="Nghĩa tiếng Việt, ví dụ: chính xác"
                  autoComplete="off"
                />
                {meaningInputs.length > 1 && (
                  <button
                    type="button"
                    className="rowRemove"
                    onClick={() => setMeaningInputs((prev) => prev.filter((_, i) => i !== idx))}
                    title="Bỏ nghĩa này"
                    aria-label="Bỏ nghĩa này"
                  >
                    <IconX size={14} />
                  </button>
                )}
              </div>
            ))}

            <div className="formBtns" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="ghost small btnIconText"
                onClick={() => setMeaningInputs((prev) => [...prev, ''])}
              >
                <IconPlus size={14} />
                <span>Thêm nghĩa</span>
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="soft" onClick={() => setActiveModal(null)}>
                  Huỷ
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={savingCard}
                  onClick={() => saveCard(false)}
                >
                  {savingCard ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review / Manage Modal */}
      {activeModal === 'review' && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="box wide">
            <button
              type="button"
              className="closeX"
              onClick={() => setActiveModal(null)}
              aria-label="Đóng"
            >
              <IconX size={20} />
            </button>
            <h2 className="titleWithIcon">
              <IconList size={22} />
              <span>Quản lý Flashcard</span>
            </h2>
            <div className="tabs">
              <button
                type="button"
                className={`tab ${reviewMode === 'all' ? 'active' : ''}`}
                onClick={() => setReviewMode('all')}
              >
                Tất cả ({stats.total})
              </button>
              <button
                type="button"
                className={`tab ${reviewMode === 'learned' ? 'active' : ''}`}
                onClick={() => setReviewMode('learned')}
              >
                Đã thuộc ({stats.learned})
              </button>
              <button
                type="button"
                className={`tab ${reviewMode === 'unlearned' ? 'active' : ''}`}
                onClick={() => setReviewMode('unlearned')}
              >
                Chưa thuộc ({stats.remain})
              </button>
            </div>
            <div className="searchFieldWrap">
              <IconSearch size={16} className="searchFieldIcon" />
              <input
                value={reviewSearch}
                onChange={(e) => setReviewSearch(e.target.value)}
                placeholder="Tìm từ tiếng Anh hoặc nghĩa..."
              />
            </div>
            <div className="azBar">
              {'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((L) => (
                <button
                  key={L}
                  type="button"
                  className={reviewFiltered.letters[L] ? '' : 'off'}
                  onClick={() => jumpLetter('rv', L)}
                >
                  {L}
                </button>
              ))}
            </div>
            <div className="list">
              {reviewFiltered.arr.length === 0 ? (
                <div className="empty">Không có flashcard phù hợp.</div>
              ) : (
                (() => {
                  let curL = '';
                  return reviewFiltered.arr.map((c) => {
                    const L = firstLetter(c.word);
                    const showH = L !== curL;
                    if (showH) curL = L;
                    return (
                      <div key={c.id}>
                        {showH && (
                          <div
                            className="letterHead"
                            id={`rv-${L === '#' ? '0' : L}`}
                            style={{ marginBottom: 8 }}
                          >
                            {L}
                            <small>{reviewFiltered.letters[L]} từ</small>
                          </div>
                        )}
                        <div
                          className={`item ${c.learned ? 'learned' : ''} ${
                            currentCard?.id === c.id ? 'current' : ''
                          }`}
                        >
                          <div
                            className="itemInfo"
                            onClick={() => jumpToCard(c.id)}
                            title="Bấm để mở thẻ này"
                          >
                            <b className="itemWord">
                              {capFirst(c.word)}
                              {c.meanings.length > 1 && (
                                <span
                                  style={{
                                    color: 'var(--ink-faint)',
                                    fontWeight: 400,
                                    fontSize: 15,
                                    marginLeft: 8,
                                  }}
                                >
                                  ({c.meanings.length} nghĩa)
                                </span>
                              )}
                            </b>
                            <span className="itemMeaning">
                              {c.meanings.map((m) => capFirst(m.text)).join('; ')}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="spkBig"
                            onClick={() => speak(c.word, false)}
                            title="Phát âm"
                          >
                            <IconVolume size={16} />
                            <span>Nghe</span>
                          </button>
                          <button
                            type="button"
                            className={c.learned ? 'success' : 'soft'}
                            onClick={() => toggleLearnedInList(c)}
                            title={c.learned ? 'Đánh dấu chưa thuộc' : 'Đánh dấu đã thuộc'}
                            aria-label={c.learned ? 'Đánh dấu chưa thuộc' : 'Đánh dấu đã thuộc'}
                          >
                            {c.learned ? <IconCheck size={16} /> : <IconX size={16} />}
                          </button>
                          <button
                            type="button"
                            className="soft"
                            onClick={() => openEdit(c)}
                            title="Sửa"
                            aria-label="Sửa"
                          >
                            <IconEdit size={15} />
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => deleteCard(c)}
                            title="Xoá"
                            aria-label="Xoá"
                          >
                            <IconTrash size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quiz Modal */}
      {activeModal === 'quiz' && quizState && (
        <div
          className="modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              stopSpeech();
              setActiveModal(null);
            }
          }}
        >
          <div className="box">
            <button
              type="button"
              className="closeX"
              onClick={() => {
                stopSpeech();
                setActiveModal(null);
              }}
              aria-label="Đóng"
            >
              <IconX size={20} />
            </button>
            <h2 className="titleWithIcon">
              <IconQuiz size={21} />
              <span>Trắc nghiệm nhanh</span>
            </h2>
            {quizState.i >= quizState.questions.length ? (
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 40,
                    fontWeight: 700,
                    margin: '10px 0',
                  }}
                >
                  {quizState.score}/{quizState.questions.length}
                </div>
                <p className="note">Số câu trả lời đúng</p>
                {quizState.wrong.length > 0 ? (
                  <>
                    <div className="note" style={{ margin: '16px 0 8px', textAlign: 'left' }}>
                      <b>Từ cần ôn lại ({quizState.wrong.length})</b>
                    </div>
                    <div className="list" style={{ maxHeight: '32vh', textAlign: 'left' }}>
                      {quizState.wrong.map((q) => (
                        <div key={q.id} className="item">
                          <div className="itemInfo" style={{ cursor: 'default' }}>
                            <b className="itemWord">{capFirst(q.word)}</b>
                            <span className="itemMeaning">
                              {q.meanings.map((m) => capFirst(m.text)).join('; ')}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="soft"
                            onClick={() => speak(q.word, false)}
                            title="Phát âm"
                            aria-label="Phát âm"
                          >
                            <IconVolume size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="note" style={{ marginTop: 12 }}>
                    Bạn đã trả lời đúng toàn bộ câu hỏi!
                  </p>
                )}
                <div className="formBtns" style={{ justifyContent: 'center' }}>
                  {quizState.wrong.length > 0 && (
                    <button
                      type="button"
                      className="danger btnIconText"
                      onClick={markWrongUnlearned}
                    >
                      <IconX size={15} />
                      <span>Đánh dấu chưa thuộc</span>
                    </button>
                  )}
                  <button type="button" className="soft" onClick={() => setActiveModal(null)}>
                    Đóng
                  </button>
                  <button type="button" className="primary" onClick={openQuiz}>
                    Làm lại
                  </button>
                </div>
              </div>
            ) : (
              (() => {
                const q = quizState.questions[quizState.i];
                return (
                  <>
                    <div className="quizQ">
                      <div className="note">
                        Câu {quizState.i + 1} / {quizState.questions.length} · Điểm:{' '}
                        {quizState.score}
                      </div>
                      <div className="qWord">
                        {capFirst(q.card.word)}
                        <button
                          type="button"
                          className={`speakBtn ${isSpeaking ? 'speaking' : ''}`}
                          onClick={() => speak(q.card.word, false)}
                          title="Phát âm (R)"
                          aria-label="Phát âm"
                        >
                          <IconVolume size={16} />
                        </button>
                      </div>
                      {q.card.meanings[0]?.phonetic && (
                        <div className="phonTag">{q.card.meanings[0].phonetic}</div>
                      )}
                    </div>
                    <div className="quizOptions">
                      {q.options.map((opt, idx) => {
                        let cls = 'quizOpt';
                        if (quizState.answered) {
                          if (idx === q.correctIdx) cls += ' correct';
                          else if (idx === quizState.selectedIdx) cls += ' wrong';
                        }
                        return (
                          <button
                            key={idx}
                            type="button"
                            className={cls}
                            disabled={quizState.answered}
                            onClick={() => handleQuizPick(idx)}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Backup / Restore Modal */}
      {activeModal === 'data' && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="box">
            <button
              type="button"
              className="closeX"
              onClick={() => setActiveModal(null)}
              aria-label="Đóng"
            >
              <IconX size={20} />
            </button>
            <h2 className="titleWithIcon">
              <IconDatabase size={21} />
              <span>Sao lưu / phục hồi</span>
            </h2>
            <p className="note" style={{ marginBottom: 14 }}>
              Tất cả tiến độ đã được tự động đồng bộ lên MongoDB cho tài khoản <b>{username}</b>.
              Bạn cũng có thể tải file JSON hoặc nhập file sao lưu cũ.
            </p>
            <div className="formBtns" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="soft btnIconText" onClick={exportData}>
                <IconDownload size={15} />
                <span>Tải xuống JSON</span>
              </button>
              <button
                type="button"
                className="soft btnIconText"
                disabled={importing}
                onClick={() => importFileRef.current?.click()}
              >
                <IconUpload size={15} />
                <span>{importing ? 'Đang nhập...' : 'Phục hồi từ file'}</span>
              </button>
              <button type="button" className="danger btnIconText" onClick={resetProgress}>
                <IconRotateCcw size={15} />
                <span>Đặt lại tiến độ</span>
              </button>
            </div>
            <input
              ref={importFileRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
        </div>
      )}

      {/* Category Modal */}
      {activeModal === 'cat' && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="box wide">
            <button
              type="button"
              className="closeX"
              onClick={() => setActiveModal(null)}
              aria-label="Đóng"
            >
              <IconX size={20} />
            </button>
            <h2 className="titleWithIcon">
              <IconLayers size={21} />
              <span>Từ vựng theo từ loại</span>
            </h2>
            <div className="catChips">
              <button
                type="button"
                className={`chip ${catFilter === 'all' ? 'active' : ''}`}
                onClick={() => setCatFilter('all')}
              >
                Tất cả <span className="chipN">{cards.length}</span>
              </button>
              {POS_LIST.map(([k, label]) => {
                const n = catData.counts[k] || 0;
                if (!n) return null;
                return (
                  <button
                    key={k}
                    type="button"
                    className={`chip ${catFilter === k ? 'active' : ''}`}
                    onClick={() => setCatFilter(k)}
                  >
                    {label} <span className="chipN">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="searchFieldWrap">
              <IconSearch size={16} className="searchFieldIcon" />
              <input
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                placeholder="Tìm trong danh sách..."
              />
            </div>
            <div className="azBar">
              {'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((L) => (
                <button
                  key={L}
                  type="button"
                  className={catData.letters[L] ? '' : 'off'}
                  onClick={() => jumpLetter('ct', L)}
                >
                  {L}
                </button>
              ))}
            </div>
            <div className="list">
              {catData.arr.length === 0 ? (
                <div className="empty">Không có từ phù hợp.</div>
              ) : (
                (() => {
                  let curL = '';
                  return catData.arr.map((c) => {
                    const L = firstLetter(c.word);
                    const showH = L !== curL;
                    if (showH) curL = L;
                    return (
                      <div key={c.id}>
                        {showH && (
                          <div
                            className="letterHead"
                            id={`ct-${L === '#' ? '0' : L}`}
                            style={{ marginBottom: 8 }}
                          >
                            {L}
                            <small>{catData.letters[L]} từ</small>
                          </div>
                        )}
                        <div className={`item ${c.learned ? 'learned' : ''}`}>
                          <div
                            className="itemInfo"
                            onClick={() => jumpToCard(c.id)}
                            title="Bấm để mở thẻ này"
                          >
                            <b className="itemWord">
                              {capFirst(c.word)}{' '}
                              <span
                                style={{
                                  color: 'var(--ink-faint)',
                                  fontWeight: 400,
                                  fontSize: 14,
                                }}
                              >
                                {detectPOS(c)
                                  .map((x) => POS_SHORT[x])
                                  .join(' · ')}
                              </span>
                            </b>
                            <span className="itemMeaning">
                              {c.meanings.map((m) => capFirst(m.text)).join('; ')}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="spkBig"
                            onClick={() => speak(c.word, false)}
                            title="Phát âm"
                          >
                            <IconVolume size={16} />
                            <span>Nghe</span>
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Irregular Verbs Modal */}
      {activeModal === 'irr' && (
        <IrregularModal
          onClose={() => setActiveModal(null)}
          onSpeak={speak}
          onToast={showToast}
        />
      )}

      {/* TOEIC Grammar & IPA Reference Modal */}
      {activeModal === 'grammar' && (
        <GrammarModal
          onClose={() => setActiveModal(null)}
          onSpeak={(text) => speak(text, false)}
        />
      )}

      <div
        role="status"
        aria-live="polite"
        className={`toast toast-${toast.type} ${toastVisible ? 'show' : ''}`}
      >
        {toast.msg}
      </div>
    </div>
  );
}
