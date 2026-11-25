'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst, detectPOS, keyOf, POS_LIST, POS_SHORT, PosKey } from '@/lib/pos';
import DictationPractice from './DictationPractice';
import IrregularView from './IrregularView';
import {
  IconBook,
  IconCheck,
  IconDatabase,
  IconDownload,
  IconEdit,
  IconFlame,
  IconHeadphones,
  IconLayers,
  IconList,
  IconLogout,
  IconMoon,
  IconPlus,
  IconQuiz,
  IconRepeat,
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
  prompt: string;
  subPrompt?: string;
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

type MainTab = 'study' | 'practice' | 'library' | 'irregular';
type PracticeSubTab = 'dictation' | 'quiz';

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

  // Top-level studio navigation
  const [activeTab, setActiveTab] = useState<MainTab>('study');
  const [practiceMode, setPracticeMode] = useState<PracticeSubTab>('dictation');

  // Study tab state
  const [mode, setMode] = useState<'all' | 'unlearned' | 'learned'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | PosKey>('all');
  const [shuffledIds, setShuffledIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [reverseMode, setReverseMode] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Preferences
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Modals (only lightweight utility modals: Add/Edit card & JSON Backup/Restore)
  const [activeModal, setActiveModal] = useState<null | 'edit' | 'data'>(null);

  // Edit / Add form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wordInput, setWordInput] = useState('');
  const [meaningInputs, setMeaningInputs] = useState<string[]>(['']);
  const [savingCard, setSavingCard] = useState(false);
  const wordInputRef = useRef<HTMLInputElement | null>(null);
  const meaningInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Vocabulary Library tab filters
  const [libStatus, setLibStatus] = useState<'all' | 'unlearned' | 'learned'>('all');
  const [libPos, setLibPos] = useState<'all' | PosKey>('all');
  const [libSearch, setLibSearch] = useState('');

  // Practice Quiz state (inline inside Practice tab)
  const [quizPoolMode, setQuizPoolMode] = useState<'unlearned' | 'all' | 'learned'>('unlearned');
  const [quizSize, setQuizSize] = useState<10 | 20 | 30>(10);
  const [quizDir, setQuizDir] = useState<'en-vi' | 'vi-en'>('en-vi');
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

  // Loud 4.5x Web Audio TTS pipeline
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

  // Study filtered deck
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

  useEffect(() => {
    if (currentCard?.id) {
      setRecentIds((prev) =>
        [currentCard.id, ...prev.filter((id) => id !== currentCard.id)].slice(0, 8)
      );
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

  const setCardLearnedById = useCallback(
    async (id: string, value: boolean) => {
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, learned: value } : c)));
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
        showToast('Lỗi đồng bộ tiến độ lên máy chủ', 'error');
      }
    },
    [showToast]
  );

  const mark = useCallback(
    async (value: boolean) => {
      if (!currentCard) return;
      const id = currentCard.id;
      setFlipped(false);
      stopSpeech();
      if ((mode === 'unlearned' && value) || (mode === 'learned' && !value)) {
        setShuffledIds((prev) => prev.filter((x) => x !== id));
      }
      await setCardLearnedById(id, value);
    },
    [currentCard, mode, stopSpeech, setCardLearnedById]
  );

  const markManyUnlearned = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      setCards((prev) => prev.map((c) => (idSet.has(c.id) ? { ...c, learned: false } : c)));
      showToast(`Đã đánh dấu ${ids.length} từ là chưa thuộc`, 'info');
      try {
        await fetch('/api/cards/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mark-unlearned', ids }),
        });
      } catch {
        showToast('Lỗi đồng bộ lên máy chủ', 'error');
      }
    },
    [showToast]
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
    if (next && activeTab === 'study' && currentCard) speak(currentCard.word, false);
  }, [autoSpeak, activeTab, currentCard, speak, showToast]);

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
    showToast('Đã trộn ngẫu nhiên bộ thẻ');
  };

  const jumpToCard = useCallback((id: string) => {
    setActiveTab('study');
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
    if (found) {
      setMode('all');
      setTypeFilter('all');
      setFlipped(false);
      setShuffledIds((prev) => [found.id, ...prev.filter((x) => x !== found.id)]);
      setCurrentIndex(0);
    }
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

  // Practice Quiz builder (inline inside Practice -> Trắc nghiệm)
  const buildQuiz = useCallback(
    (
      customSource?: CardItem[],
      customSize?: 10 | 20 | 30,
      customDir?: 'en-vi' | 'vi-en'
    ) => {
      if (cards.length < 4) {
        showToast('Cần ít nhất 4 thẻ để làm trắc nghiệm', 'error');
        return;
      }
      const dir = customDir ?? quizDir;
      const sz = customSize ?? quizSize;
      const filteredPool =
        customSource ??
        cards.filter((c) =>
          quizPoolMode === 'all' ? true : quizPoolMode === 'learned' ? c.learned : !c.learned
        );
      const src = filteredPool.length >= 4 ? filteredPool : cards;
      const chosen = shuffleArray(src).slice(0, Math.min(sz, src.length));

      const questions: QuizQuestion[] = chosen.map((card) => {
        if (dir === 'en-vi') {
          const correct = capFirst(card.meanings[0].text);
          const others = shuffleArray(cards.filter((c) => c.id !== card.id))
            .slice(0, 3)
            .map((c) => capFirst(c.meanings[0].text));
          const options = shuffleArray([correct, ...others]);
          return {
            card,
            prompt: capFirst(card.word),
            subPrompt: card.meanings[0]?.phonetic,
            options,
            correctIdx: options.indexOf(correct),
          };
        } else {
          const correct = capFirst(card.word);
          const others = shuffleArray(cards.filter((c) => c.id !== card.id))
            .slice(0, 3)
            .map((c) => capFirst(c.word));
          const options = shuffleArray([correct, ...others]);
          return {
            card,
            prompt: card.meanings.map((m) => capFirst(m.text)).join('; '),
            options,
            correctIdx: options.indexOf(correct),
          };
        }
      });

      setQuizState({ questions, i: 0, score: 0, answered: false, selectedIdx: null, wrong: [] });
      if (dir === 'en-vi' && autoSpeak && questions[0]) {
        speak(questions[0].card.word, false);
      }
    },
    [cards, quizDir, quizSize, quizPoolMode, showToast, autoSpeak, speak]
  );

  useEffect(() => {
    if (activeTab === 'practice' && practiceMode === 'quiz' && !quizState && cards.length >= 4) {
      buildQuiz();
    }
  }, [activeTab, practiceMode, quizState, cards.length, buildQuiz]);

  const handleQuizPick = useCallback(
    (idx: number) => {
      setQuizState((prev) => {
        if (!prev || prev.answered) return prev;
        const q = prev.questions[prev.i];
        const isCorrect = idx === q.correctIdx;
        const nextScore = isCorrect ? prev.score + 1 : prev.score;
        const nextWrong = isCorrect ? prev.wrong : [...prev.wrong, q.card];

        if (quizDir === 'vi-en') {
          speak(q.card.word, false);
        }

        setTimeout(() => {
          setQuizState((cur) => {
            if (!cur) return cur;
            const nextI = cur.i + 1;
            if (quizDir === 'en-vi' && autoSpeak && cur.questions[nextI]) {
              speak(cur.questions[nextI].card.word, false);
            }
            return { ...cur, i: nextI, answered: false, selectedIdx: null };
          });
        }, isCorrect ? 650 : 1250);

        return {
          ...prev,
          score: nextScore,
          answered: true,
          selectedIdx: idx,
          wrong: nextWrong,
        };
      });
    },
    [quizDir, autoSpeak, speak]
  );

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

  // Global keyboard shortcuts scoped to activeTab
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
      if (activeModal) return;

      const k = (e.key || '').toLowerCase();

      if (
        activeTab === 'practice' &&
        practiceMode === 'quiz' &&
        quizState &&
        quizState.i < quizState.questions.length
      ) {
        if (k >= '1' && k <= '4' && !quizState.answered) {
          e.preventDefault();
          handleQuizPick(Number(k) - 1);
        } else if (k === 'r' || k === 's') {
          e.preventDefault();
          speak(quizState.questions[quizState.i].card.word, false);
        }
        return;
      }

      if (activeTab !== 'study') return;

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
    activeTab,
    practiceMode,
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

  // Unified Vocabulary Library filtered data (status + POS + search + A-Z)
  const libData = useMemo(() => {
    const statusBase = cards.filter((c) =>
      libStatus === 'all' ? true : libStatus === 'learned' ? c.learned : !c.learned
    );
    const posCounts: Record<string, number> = {};
    statusBase.forEach((c) => detectPOS(c).forEach((t) => (posCounts[t] = (posCounts[t] || 0) + 1)));

    const q = keyOf(libSearch);
    const arr = statusBase.filter(
      (c) =>
        (libPos === 'all' || detectPOS(c).includes(libPos)) &&
        (!q || keyOf(c.word).includes(q) || c.meanings.some((m) => keyOf(m.text).includes(q)))
    );
    arr.sort((a, b) => sortKey(a.word).localeCompare(sortKey(b.word), 'en'));

    const letters: Record<string, number> = {};
    arr.forEach((c) => {
      const L = firstLetter(c.word);
      letters[L] = (letters[L] || 0) + 1;
    });

    return { statusBaseLen: statusBase.length, posCounts, arr, letters };
  }, [cards, libStatus, libPos, libSearch]);

  const jumpLetter = (prefix: string, L: string) => {
    const el = document.getElementById(`${prefix}-${L === '#' ? '0' : L}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Circular SVG ring math
  const ringRadius = 38;
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
      {/* Top Studio Navigation Bar */}
      <header className="topBar">
        <div className="topBarInner">
          <div className="topBrand">
            <span className="topBrandMark">
              <IconBook size={18} />
            </span>
            <div>
              <div className="topBrandName">Flashcard TOEIC</div>
              <div className="topBrandSub">
                {stats.learned}/{stats.total} đã thuộc ({stats.pct}%)
              </div>
            </div>
          </div>

          {/* 4 Main Studio Tabs */}
          <nav className="navTabs" aria-label="Điều hướng chính">
            <button
              type="button"
              className={`navTab ${activeTab === 'study' ? 'active' : ''}`}
              onClick={() => {
                stopSpeech();
                setActiveTab('study');
              }}
            >
              <IconBook size={16} />
              <span>Học thẻ</span>
            </button>
            <button
              type="button"
              className={`navTab ${activeTab === 'practice' ? 'active' : ''}`}
              onClick={() => {
                stopSpeech();
                setActiveTab('practice');
              }}
            >
              <IconHeadphones size={16} />
              <span>Luyện tập</span>
            </button>
            <button
              type="button"
              className={`navTab ${activeTab === 'library' ? 'active' : ''}`}
              onClick={() => {
                stopSpeech();
                setActiveTab('library');
              }}
            >
              <IconList size={16} />
              <span>Danh sách từ</span>
              <span className="navTabCount">{stats.total}</span>
            </button>
            <button
              type="button"
              className={`navTab ${activeTab === 'irregular' ? 'active' : ''}`}
              onClick={() => {
                stopSpeech();
                setActiveTab('irregular');
              }}
            >
              <IconLayers size={16} />
              <span>Bất quy tắc</span>
            </button>
          </nav>

          {/* Right Utility Actions */}
          <div className="topActions">
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
              title="Đổi giao diện sáng / tối"
              aria-label="Đổi giao diện sáng / tối"
            >
              {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>
            <button
              type="button"
              className="ghost small btnIconText"
              onClick={() => setActiveModal('data')}
              title="Sao lưu / phục hồi JSON"
            >
              <IconDatabase size={15} />
              <span>Dữ liệu</span>
            </button>
            <button type="button" className="primary small btnIconText" onClick={openAdd}>
              <IconPlus size={15} />
              <span>Thêm từ</span>
            </button>
            <span className="userBadge">
              <IconUser size={14} />
              <span>{username}</span>
            </span>
            <button
              type="button"
              className="ghost small btnIconText"
              onClick={handleLogout}
              title="Đăng xuất"
            >
              <IconLogout size={15} />
              <span>Thoát</span>
            </button>
          </div>
        </div>
      </header>

      {/* ==================== TAB 1: HỌC THẺ (STUDY STUDIO) ==================== */}
      {activeTab === 'study' && (
        <div className="studioGrid">
          {/* Left Rail: Mastery Overview + Quick Search + Status & POS Filters */}
          <aside className="studioRail" aria-label="Tiến độ và bộ lọc thẻ">
            <div className="railMasteryCard">
              <div className="railMasteryRow">
                <div className="railRingWrap">
                  <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
                    <circle
                      cx="46"
                      cy="46"
                      r={ringRadius}
                      fill="none"
                      stroke="var(--line-soft)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="46"
                      cy="46"
                      r={ringRadius}
                      fill="none"
                      stroke="var(--teal)"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      transform="rotate(-90 46 46)"
                      style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                    />
                  </svg>
                  <span className="railRingPct">{stats.pct}%</span>
                </div>
                <div className="railMasteryInfo">
                  <div className="railMasteryTitle">Tiến độ thuộc từ</div>
                  <div className="railMasteryNums">
                    <b>{stats.learned}</b> / {stats.total} thẻ
                  </div>
                  <div className="railMasteryRemain">Còn {stats.remain} từ cần ôn</div>
                </div>
              </div>

              <div className="railStreakBar">
                <IconFlame size={15} className="flameIcon" />
                <span>
                  Chuỗi {dailyDisplay.streak} ngày
                  {dailyDisplay.today > 0 ? ` · hôm nay +${dailyDisplay.today}` : ''}
                </span>
              </div>
            </div>

            {/* Quick jump search */}
            <div className="searchFieldWrap railSearch">
              <IconSearch size={16} className="searchFieldIcon" />
              <input
                value={quickSearch}
                onChange={(e) => handleQuickSearch(e.target.value)}
                placeholder="Tìm nhanh & nhảy tới thẻ..."
              />
            </div>

            {/* Status filter */}
            <div className="leftModeTabs" role="tablist" aria-label="Trạng thái thuộc">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'all'}
                className={`leftModeTab ${mode === 'all' ? 'active' : ''}`}
                onClick={() => handleModeChange('all')}
              >
                <span>Tất cả thẻ</span>
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

            {/* POS filter */}
            <div className="posListCard">
              <div className="railSectionCap">LỌC THEO TỪ LOẠI</div>
              <button
                type="button"
                className={`posListRow ${typeFilter === 'all' ? 'active' : ''}`}
                onClick={() => handleTypeChange('all')}
              >
                <span>Tất cả từ loại</span>
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

          {/* Main Flashcard Stage */}
          <main className="studioStage">
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
                  className="soft small btnIconText"
                  onClick={() => {
                    setPracticeMode('dictation');
                    setActiveTab('practice');
                  }}
                  title="Chuyển sang Luyện nghe chép chính tả từng từ"
                >
                  <IconHeadphones size={15} />
                  <span>Nghe chép từ</span>
                </button>
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
                  <IconRepeat size={13} />
                  <span>{reverseMode ? 'VI → EN' : 'EN → VI'}</span>
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
              className={`card studioCard ${flipped ? 'flipped' : ''}`}
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
              <div className="inner studioInner">
                <div className="face studioFace">
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
                      <div className="word studioWord">
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

                <div className="face back studioFace">
                  {reverseMode && currentCard ? (
                    <>
                      <div className="label">ENGLISH</div>
                      <div className="word studioWord">{capFirst(currentCard.word)}</div>
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

            {/* Primary Card Controls */}
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

            <div className="kbdHint">
              Phím tắt: <kbd>←</kbd> <kbd>→</kbd> chuyển thẻ · <kbd>Space</kbd> lật thẻ ·{' '}
              <kbd>C</kbd> chưa thuộc · <kbd>V</kbd> đã thuộc · <kbd>R</kbd> đọc to ·{' '}
              <kbd>A</kbd> tự động đọc
            </div>

            {/* Recently Studied Cards Strip */}
            {recentCards.length > 0 && (
              <div className="recentStrip">
                <span className="recentLabel">Vừa xem gần đây:</span>
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
        </div>
      )}

      {/* ==================== TAB 2: LUYỆN TẬP (DICTATION + QUIZ) ==================== */}
      {activeTab === 'practice' && (
        <div className="pageShell">
          <div className="practiceHeader">
            <div>
              <h1 className="pageTitle">Phòng luyện tập phản xạ</h1>
              <p className="pageSub">
                Luyện nghe chép chính tả từng từ chuẩn xác hoặc kiểm tra phản xạ trắc nghiệm 4 đáp
                án.
              </p>
            </div>

            <div className="practiceModeSwitch" role="tablist" aria-label="Chọn chế độ luyện tập">
              <button
                type="button"
                role="tab"
                aria-selected={practiceMode === 'dictation'}
                className={`practiceModeBtn ${practiceMode === 'dictation' ? 'active' : ''}`}
                onClick={() => {
                  stopSpeech();
                  setPracticeMode('dictation');
                }}
              >
                <IconHeadphones size={18} />
                <div>
                  <b>Nghe chép chính tả</b>
                  <span>Nghe từng từ &amp; gõ lại chính xác</span>
                </div>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={practiceMode === 'quiz'}
                className={`practiceModeBtn ${practiceMode === 'quiz' ? 'active' : ''}`}
                onClick={() => {
                  stopSpeech();
                  setPracticeMode('quiz');
                }}
              >
                <IconQuiz size={18} />
                <div>
                  <b>Trắc nghiệm phản xạ</b>
                  <span>Chọn nhanh nghĩa đúng (phím 1–4)</span>
                </div>
              </button>
            </div>
          </div>

          {practiceMode === 'dictation' ? (
            <DictationPractice
              cards={cards}
              isSpeaking={isSpeaking}
              onSpeak={speak}
              onMarkLearned={setCardLearnedById}
              onMarkManyUnlearned={markManyUnlearned}
            />
          ) : (
            <div className="dictWrap">
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
                        className={`segBtn ${quizPoolMode === k ? 'active' : ''}`}
                        onClick={() => {
                          setQuizPoolMode(k);
                          const pool = cards.filter((c) =>
                            k === 'all' ? true : k === 'learned' ? c.learned : !c.learned
                          );
                          buildQuiz(pool, quizSize, quizDir);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="dictToolbarGroup">
                  <span className="dictToolbarLabel">Chiều hỏi:</span>
                  <div className="segGroup">
                    <button
                      type="button"
                      className={`segBtn ${quizDir === 'en-vi' ? 'active' : ''}`}
                      onClick={() => {
                        setQuizDir('en-vi');
                        buildQuiz(undefined, quizSize, 'en-vi');
                      }}
                    >
                      Anh → Việt
                    </button>
                    <button
                      type="button"
                      className={`segBtn ${quizDir === 'vi-en' ? 'active' : ''}`}
                      onClick={() => {
                        setQuizDir('vi-en');
                        buildQuiz(undefined, quizSize, 'vi-en');
                      }}
                    >
                      Việt → Anh
                    </button>
                  </div>
                </div>

                <div className="dictToolbarGroup">
                  <span className="dictToolbarLabel">Số câu:</span>
                  <div className="segGroup">
                    {([10, 20, 30] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`segBtn ${quizSize === n ? 'active' : ''}`}
                        onClick={() => {
                          setQuizSize(n);
                          buildQuiz(undefined, n, quizDir);
                        }}
                      >
                        {n} câu
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="ghost small btnIconText"
                  onClick={() => buildQuiz()}
                >
                  <IconRotateCcw size={15} />
                  <span>Đổi đề mới</span>
                </button>
              </div>

              {quizState &&
                (quizState.i >= quizState.questions.length ? (
                  <div className="dictStageCard dictSummary">
                    <div className="dictScoreBig">
                      {quizState.score} / {quizState.questions.length}
                    </div>
                    <p className="dictSummarySub">
                      Độ chính xác{' '}
                      {Math.round((quizState.score / quizState.questions.length) * 100)}% · Trắc
                      nghiệm phản xạ
                    </p>

                    {quizState.wrong.length > 0 ? (
                      <div className="dictMissedBox">
                        <div className="dictMissedTitle">
                          Từ trả lời sai cần ôn lại ({quizState.wrong.length})
                        </div>
                        <div className="dictMissedList">
                          {quizState.wrong.map((m) => (
                            <div key={m.id} className="dictMissedRow">
                              <div>
                                <b>{capFirst(m.word)}</b>
                                <span>{m.meanings.map((x) => capFirst(x.text)).join('; ')}</span>
                              </div>
                              <button
                                type="button"
                                className="spkBig"
                                onClick={() => speak(m.word, false)}
                              >
                                <IconVolume size={15} />
                                <span>Nghe</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="dictPerfectMsg">
                        Tuyệt vời! Bạn đã trả lời chính xác toàn bộ câu hỏi trong lượt này.
                      </p>
                    )}

                    <div className="formBtns" style={{ justifyContent: 'center', marginTop: 22 }}>
                      {quizState.wrong.length > 0 && (
                        <>
                          <button
                            type="button"
                            className="soft btnIconText"
                            onClick={() =>
                              buildQuiz(
                                quizState.wrong.length >= 4 ? quizState.wrong : undefined,
                                quizSize,
                                quizDir
                              )
                            }
                          >
                            <IconRotateCcw size={15} />
                            <span>Làm đề mới</span>
                          </button>
                          <button
                            type="button"
                            className="danger btnIconText"
                            onClick={() => markManyUnlearned(quizState.wrong.map((w) => w.id))}
                          >
                            <IconX size={15} />
                            <span>Đánh dấu chưa thuộc ({quizState.wrong.length})</span>
                          </button>
                        </>
                      )}
                      <button type="button" className="primary" onClick={() => buildQuiz()}>
                        Làm lượt tiếp theo →
                      </button>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const q = quizState.questions[quizState.i];
                    return (
                      <div className="dictStageCard">
                        <div className="dictStageTop">
                          <span className="cardCountPill">
                            Câu {quizState.i + 1} / {quizState.questions.length}
                          </span>
                          <div className="dictTopStats">
                            <span>Điểm: {quizState.score}</span>
                          </div>
                        </div>

                        <div className="quizStagePrompt">
                          <div className="quizPromptMain">
                            <span>{q.prompt}</span>
                            {quizDir === 'en-vi' && (
                              <button
                                type="button"
                                className={`speakBtn ${isSpeaking ? 'speaking' : ''}`}
                                onClick={() => speak(q.card.word, false)}
                                title="Phát âm (R)"
                              >
                                <IconVolume size={18} />
                              </button>
                            )}
                          </div>
                          {q.subPrompt && <div className="phonTag">{q.subPrompt}</div>}
                        </div>

                        <div className="quizGridOptions">
                          {q.options.map((opt, idx) => {
                            let cls = 'quizGridOpt';
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
                                <span className="quizOptNum">{idx + 1}</span>
                                <span className="quizOptText">{opt}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="kbdHint" style={{ marginTop: 18 }}>
                          Mẹo: Nhấn phím <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> để chọn
                          nhanh đáp án · nhấn <kbd>R</kbd> để nghe phát âm
                        </div>
                      </div>
                    );
                  })()
                ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: DANH SÁCH TỪ (FILTERABLE LIBRARY) ==================== */}
      {activeTab === 'library' && (
        <div className="pageShell">
          <section className="pagePanel">
            <div className="pagePanelHead">
              <div>
                <h1 className="pageTitle">Danh sách từ vựng</h1>
                <p className="pageSub">
                  Hiển thị <b>{libData.arr.length}</b> / {stats.total} từ · Bấm vào từ bất kỳ để mở
                  trên thẻ học hoặc nghe phát âm trực tiếp.
                </p>
              </div>
              <button type="button" className="primary btnIconText" onClick={openAdd}>
                <IconPlus size={16} />
                <span>Thêm từ mới</span>
              </button>
            </div>

            {/* Filter Row: Status + Search */}
            <div className="libFilterRow">
              <div className="segGroup">
                <button
                  type="button"
                  className={`segBtn ${libStatus === 'all' ? 'active' : ''}`}
                  onClick={() => setLibStatus('all')}
                >
                  Tất cả ({stats.total})
                </button>
                <button
                  type="button"
                  className={`segBtn ${libStatus === 'unlearned' ? 'active' : ''}`}
                  onClick={() => setLibStatus('unlearned')}
                >
                  Chưa thuộc ({stats.remain})
                </button>
                <button
                  type="button"
                  className={`segBtn ${libStatus === 'learned' ? 'active' : ''}`}
                  onClick={() => setLibStatus('learned')}
                >
                  Đã thuộc ({stats.learned})
                </button>
              </div>

              <div className="searchFieldWrap" style={{ flex: 1, minWidth: 240 }}>
                <IconSearch size={16} className="searchFieldIcon" />
                <input
                  value={libSearch}
                  onChange={(e) => setLibSearch(e.target.value)}
                  placeholder="Tìm từ tiếng Anh hoặc nghĩa tiếng Việt..."
                />
              </div>
            </div>

            {/* POS Filter Chips */}
            <div className="catChips">
              <button
                type="button"
                className={`chip ${libPos === 'all' ? 'active' : ''}`}
                onClick={() => setLibPos('all')}
              >
                Tất cả từ loại <span className="chipN">{libData.statusBaseLen}</span>
              </button>
              {POS_LIST.map(([k, label]) => {
                const n = libData.posCounts[k] || 0;
                if (!n && libPos !== k) return null;
                return (
                  <button
                    key={k}
                    type="button"
                    className={`chip ${libPos === k ? 'active' : ''}`}
                    onClick={() => setLibPos(k)}
                  >
                    {label} <span className="chipN">{n}</span>
                  </button>
                );
              })}
            </div>

            {/* A-Z Jump Bar */}
            <div className="azBar">
              {'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((L) => (
                <button
                  key={L}
                  type="button"
                  className={libData.letters[L] ? '' : 'off'}
                  onClick={() => jumpLetter('lib', L)}
                >
                  {L}
                </button>
              ))}
            </div>

            {/* Vocabulary List */}
            <div className="libList">
              {libData.arr.length === 0 ? (
                <div className="empty">Không có từ vựng nào khớp với bộ lọc hiện tại.</div>
              ) : (
                (() => {
                  let curL = '';
                  return libData.arr.map((c) => {
                    const L = firstLetter(c.word);
                    const showH = L !== curL;
                    if (showH) curL = L;
                    const posTags = detectPOS(c).filter((t) => t !== 'other');
                    return (
                      <div key={c.id} className="libItemGroup">
                        {showH && (
                          <div
                            className="letterHead"
                            id={`lib-${L === '#' ? '0' : L}`}
                            style={{ marginBottom: 8, marginTop: 6 }}
                          >
                            <span>{L}</span>
                            <small>{libData.letters[L]} từ</small>
                          </div>
                        )}
                        <div className={`item libItem ${c.learned ? 'learned' : ''}`}>
                          <div
                            className="itemInfo"
                            onClick={() => jumpToCard(c.id)}
                            title="Bấm để mở thẻ này trong mục Học thẻ"
                          >
                            <div className="libWordLine">
                              <b className="itemWord">{capFirst(c.word)}</b>
                              {posTags.map((t) => (
                                <span key={t} className="libPosPill">
                                  {POS_SHORT[t]}
                                </span>
                              ))}
                              {c.meanings[0]?.phonetic && (
                                <span className="libPhonetic">{c.meanings[0].phonetic}</span>
                              )}
                            </div>
                            <span className="itemMeaning">
                              {c.meanings.map((m) => capFirst(m.text)).join('; ')}
                            </span>
                          </div>

                          <div className="libItemActions">
                            <button
                              type="button"
                              className="spkBig"
                              onClick={() => speak(c.word, false)}
                              title="Phát âm to rõ"
                            >
                              <IconVolume size={16} />
                              <span>Nghe</span>
                            </button>
                            <button
                              type="button"
                              className={`iconActionBtn ${c.learned ? 'success' : 'soft'}`}
                              onClick={() => setCardLearnedById(c.id, !c.learned)}
                              title={c.learned ? 'Đánh dấu chưa thuộc' : 'Đánh dấu đã thuộc'}
                              aria-label={c.learned ? 'Đánh dấu chưa thuộc' : 'Đánh dấu đã thuộc'}
                            >
                              {c.learned ? <IconCheck size={16} /> : <IconX size={16} />}
                            </button>
                            <button
                              type="button"
                              className="iconActionBtn soft"
                              onClick={() => openEdit(c)}
                              title="Sửa từ này"
                              aria-label="Sửa từ này"
                            >
                              <IconEdit size={15} />
                            </button>
                            <button
                              type="button"
                              className="iconActionBtn danger"
                              onClick={() => deleteCard(c)}
                              title="Xoá từ này"
                              aria-label="Xoá từ này"
                            >
                              <IconTrash size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </section>
        </div>
      )}

      {/* ==================== TAB 4: BẤT QUY TẮC (IRREGULAR VERBS) ==================== */}
      {activeTab === 'irregular' && (
        <div className="pageShell">
          <IrregularView onSpeak={speak} />
        </div>
      )}

      {/* ==================== MODAL: ADD / EDIT FLASHCARD ==================== */}
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
            <h2>{editingId ? 'Sửa flashcard' : 'Thêm flashcard mới'}</h2>

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

      {/* ==================== MODAL: BACKUP / RESTORE JSON ==================== */}
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
              Tất cả tiến độ học đã tự động lưu trên MongoDB cho tài khoản <b>{username}</b>. Bạn
              cũng có thể tải file sao lưu JSON về máy hoặc nhập từ file cũ.
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

      {/* Top-right Toast */}
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
