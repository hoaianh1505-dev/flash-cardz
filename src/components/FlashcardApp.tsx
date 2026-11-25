'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import defaultToeic from '@/data/default-toeic.json';
import { capFirst, detectPOS, keyOf, POS_LIST, POS_SHORT, PosKey } from '@/lib/pos';
import DictationPractice from './DictationPractice';
import IrregularView from './IrregularView';
import PlaneShooterGame from './PlaneShooterGame';
import Toast, { ToastType } from './Toast';
import {
  IconBarChart,
  IconBook,
  IconCheck,
  IconDatabase,
  IconDownload,
  IconEdit,
  IconFlame,
  IconHeadphones,
  IconLayers,
  IconList,
  IconLogIn,
  IconLogout,
  IconMenu,
  IconMoon,
  IconNote,
  IconPlane,
  IconPlus,
  IconQuiz,
  IconRepeat,
  IconRotateCcw,
  IconSearch,
  IconShuffle,
  IconStar,
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
  starred?: boolean;
  note?: string;
  reviewCount?: number;
  wrongCount?: number;
  nextReviewAt?: string | null;
}

export interface DailyStats {
  streak: number;
  lastDate: string;
  todayCount: number;
}

export interface StudySessionItem {
  id: string;
  mode: 'dictation' | 'quiz';
  score: number;
  total: number;
  accuracy: number;
  durationSec: number;
  missedWords: string[];
  createdAt: string;
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
  startedAt: number;
  reported: boolean;
}

type MainTab = 'study' | 'practice' | 'library' | 'irregular' | 'stats';
type PracticeSubTab = 'dictation' | 'quiz' | 'plane';

const GUEST_CARDS_KEY = 'flashcardx_guest_cards_v1';
const GUEST_DAILY_KEY = 'flashcardx_guest_daily_v1';
const GUEST_SESSIONS_KEY = 'flashcardx_guest_sessions_v1';
const GUEST_GOAL_KEY = 'flashcardx_guest_goal_v1';
const PREFS_KEY = 'flashcardx_prefs_v1';

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

function buildStarterGuestCards(): CardItem[] {
  const raw = defaultToeic as { word: string; meanings: MeaningItem[] }[];
  return raw.map((item, idx) => ({
    id: `guest-${idx + 1}`,
    word: item.word,
    meanings: item.meanings,
    learned: false,
    starred: false,
    note: '',
    reviewCount: 0,
    wrongCount: 0,
    nextReviewAt: null,
  }));
}

interface Props {
  username: string;
  isGuest?: boolean;
  onRequestAuth?: () => void;
}

export default function FlashcardApp({ username, isGuest = false, onRequestAuth }: Props) {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<DailyStats>({ streak: 0, lastDate: '', todayCount: 0 });
  const [dailyGoal, setDailyGoal] = useState<number>(20);
  const [sessions, setSessions] = useState<StudySessionItem[]>([]);

  // App Shell navigation
  const [activeTab, setActiveTab] = useState<MainTab>('study');
  const [practiceMode, setPracticeMode] = useState<PracticeSubTab>('dictation');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Study tab state
  const [mode, setMode] = useState<'all' | 'unlearned' | 'learned' | 'starred'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | PosKey>('all');
  const [shuffledIds, setShuffledIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [reverseMode, setReverseMode] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Inline note editor on current card
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  // Preferences
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);

  // Modals (Add/Edit card & JSON Backup/Restore)
  const [activeModal, setActiveModal] = useState<null | 'edit' | 'data'>(null);

  // Edit / Add form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wordInput, setWordInput] = useState('');
  const [meaningInputs, setMeaningInputs] = useState<string[]>(['']);
  const [noteInput, setNoteInput] = useState('');
  const [savingCard, setSavingCard] = useState(false);
  const wordInputRef = useRef<HTMLInputElement | null>(null);
  const meaningInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Vocabulary Library tab filters + server-side pagination
  const [libStatus, setLibStatus] = useState<'all' | 'unlearned' | 'learned' | 'starred'>('all');
  const [libPos, setLibPos] = useState<'all' | PosKey>('all');
  const [libLetter, setLibLetter] = useState<string>('all');
  const [libSearch, setLibSearch] = useState('');
  const [libSearchDebounced, setLibSearchDebounced] = useState('');
  const [libPage, setLibPage] = useState(1);
  const [libLimit, setLibLimit] = useState<25 | 50 | 100>(50);
  const [libLoading, setLibLoading] = useState(false);
  const [libRefreshTick, setLibRefreshTick] = useState(0);
  const [libRemote, setLibRemote] = useState<{
    items: CardItem[];
    total: number;
    page: number;
    totalPages: number;
    statusBaseLen: number;
    statusCounts: { all: number; unlearned: number; learned: number; starred: number };
    posCounts: Record<string, number>;
    letterCounts: Record<string, number>;
  } | null>(null);
  const libScrollRef = useRef<HTMLDivElement | null>(null);

  // Practice Quiz state
  const [quizPoolMode, setQuizPoolMode] = useState<'unlearned' | 'all' | 'learned'>('unlearned');
  const [quizSize, setQuizSize] = useState<10 | 20 | 30>(10);
  const [quizDir, setQuizDir] = useState<'en-vi' | 'vi-en'>('en-vi');
  const [quizState, setQuizState] = useState<QuizState | null>(null);

  // Data modal
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  // Top-right Toast
  const [toast, setToast] = useState<{ id: number; msg: string; type: ToastType }>({
    id: 0,
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

  const showToast = useCallback((msg: string, type: ToastType = 'info') => {
    setToast({ id: Date.now(), msg, type });
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2600);
  }, []);

  // Persist Guest data to localStorage
  const persistGuestCards = useCallback(
    (nextCards: CardItem[]) => {
      if (!isGuest) return;
      try {
        localStorage.setItem(GUEST_CARDS_KEY, JSON.stringify(nextCards));
      } catch {
        /* ignore quota */
      }
    },
    [isGuest]
  );

  const persistGuestDaily = useCallback(
    (nextDaily: DailyStats) => {
      if (!isGuest) return;
      try {
        localStorage.setItem(GUEST_DAILY_KEY, JSON.stringify(nextDaily));
      } catch {
        /* ignore */
      }
    },
    [isGuest]
  );

  const persistGuestSessions = useCallback(
    (nextSessions: StudySessionItem[]) => {
      if (!isGuest) return;
      try {
        localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(nextSessions.slice(0, 30)));
      } catch {
        /* ignore */
      }
    },
    [isGuest]
  );

  useEffect(() => {
    const savedTheme =
      (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
    setTheme(savedTheme);

    try {
      const rawPrefs = localStorage.getItem(PREFS_KEY);
      if (rawPrefs) {
        const p = JSON.parse(rawPrefs) as Partial<{
          autoSpeak: boolean;
          reverseMode: boolean;
          activeTab: MainTab;
          practiceMode: PracticeSubTab;
          mode: 'all' | 'unlearned' | 'learned' | 'starred';
          typeFilter: 'all' | PosKey;
          libLimit: 25 | 50 | 100;
          quizDir: 'en-vi' | 'vi-en';
          quizSize: 10 | 20 | 30;
          quizPoolMode: 'unlearned' | 'all' | 'learned';
        }>;
        if (typeof p.autoSpeak === 'boolean') setAutoSpeak(p.autoSpeak);
        if (typeof p.reverseMode === 'boolean') setReverseMode(p.reverseMode);
        if (p.activeTab && ['study', 'practice', 'library', 'irregular', 'stats'].includes(p.activeTab)) {
          setActiveTab(p.activeTab);
        }
        if (p.practiceMode === 'dictation' || p.practiceMode === 'quiz' || p.practiceMode === 'plane') {
          setPracticeMode(p.practiceMode);
        }
        if (p.mode && ['all', 'unlearned', 'learned', 'starred'].includes(p.mode)) {
          setMode(p.mode);
        }
        if (p.typeFilter) setTypeFilter(p.typeFilter);
        if (p.libLimit === 25 || p.libLimit === 50 || p.libLimit === 100) setLibLimit(p.libLimit);
        if (p.quizDir === 'en-vi' || p.quizDir === 'vi-en') setQuizDir(p.quizDir);
        if (p.quizSize === 10 || p.quizSize === 20 || p.quizSize === 30) setQuizSize(p.quizSize);
        if (p.quizPoolMode && ['unlearned', 'all', 'learned'].includes(p.quizPoolMode)) {
          setQuizPoolMode(p.quizPoolMode);
        }
      } else {
        setAutoSpeak(localStorage.getItem('toeic_flashcards_autospeak') === '1');
      }
    } catch {
      /* ignore */
    }
    setPrefsReady(true);

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

    if (isGuest) {
      try {
        const rawCards = localStorage.getItem(GUEST_CARDS_KEY);
        const loadedCards: CardItem[] = rawCards ? JSON.parse(rawCards) : buildStarterGuestCards();
        if (!rawCards) {
          localStorage.setItem(GUEST_CARDS_KEY, JSON.stringify(loadedCards));
        }
        setCards(loadedCards);
        setShuffledIds(shuffleArray(loadedCards.map((c) => c.id)));

        const rawDaily = localStorage.getItem(GUEST_DAILY_KEY);
        if (rawDaily) setDaily(JSON.parse(rawDaily));

        const rawGoal = localStorage.getItem(GUEST_GOAL_KEY);
        if (rawGoal) setDailyGoal(Math.max(5, Number(rawGoal) || 20));

        const rawSessions = localStorage.getItem(GUEST_SESSIONS_KEY);
        if (rawSessions) setSessions(JSON.parse(rawSessions));
      } catch {
        const starter = buildStarterGuestCards();
        setCards(starter);
        setShuffledIds(shuffleArray(starter.map((c) => c.id)));
      } finally {
        setLoading(false);
      }
      return;
    }

    (async () => {
      try {
        const [cardsRes, sessRes] = await Promise.all([
          fetch('/api/cards', { cache: 'no-store' }),
          fetch('/api/sessions', { cache: 'no-store' }),
        ]);
        if (cardsRes.status === 401) {
          window.location.href = '/';
          return;
        }
        const data = await cardsRes.json();
        if (Array.isArray(data.cards)) {
          setCards(data.cards);
          setShuffledIds(shuffleArray(data.cards.map((c: CardItem) => c.id)));
        }
        if (data.daily) setDaily(data.daily);
        if (data.dailyGoal) setDailyGoal(data.dailyGoal);

        if (sessRes.ok) {
          const sData = await sessRes.json();
          if (Array.isArray(sData.sessions)) setSessions(sData.sessions);
        }
      } catch {
        showToast('Không thể tải dữ liệu từ máy chủ', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [isGuest, showToast]);

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
        (mode === 'all' ||
          (mode === 'learned' ? c.learned : mode === 'unlearned' ? !c.learned : !!c.starred)) &&
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
      setNoteOpen(false);
      setNoteDraft(currentCard.note || '');
      setRecentIds((prev) =>
        [currentCard.id, ...prev.filter((id) => id !== currentCard.id)].slice(0, 8)
      );
    }
  }, [currentCard?.id, currentCard?.note]);

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
    const starred = cards.filter((c) => c.starred).length;
    return {
      total,
      learned,
      remain: total - learned,
      starred,
      pct: total ? Math.round((learned / total) * 100) : 0,
    };
  }, [cards]);

  const typeCounts = useMemo(() => {
    const base = cards.filter(
      (c) =>
        mode === 'all' ||
        (mode === 'learned' ? c.learned : mode === 'unlearned' ? !c.learned : !!c.starred)
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

  const bumpGuestDaily = useCallback(() => {
    const t = todayVietnamStr();
    setDaily((prev) => {
      const next = { ...prev };
      if (next.lastDate !== t) {
        next.streak = next.lastDate && dayDiff(next.lastDate, t) === 1 ? (next.streak || 0) + 1 : 1;
        next.lastDate = t;
        next.todayCount = 0;
      }
      next.todayCount = (next.todayCount || 0) + 1;
      persistGuestDaily(next);
      return next;
    });
  }, [persistGuestDaily]);

  const setCardLearnedById = useCallback(
    async (id: string, value: boolean) => {
      let wasLearned = false;
      setCards((prev) => {
        const next = prev.map((c) => {
          if (c.id !== id) return c;
          wasLearned = c.learned;
          return {
            ...c,
            learned: value,
            reviewCount: (c.reviewCount || 0) + 1,
            wrongCount: value ? c.wrongCount || 0 : (c.wrongCount || 0) + 1,
          };
        });
        persistGuestCards(next);
        return next;
      });

      showToast(
        value ? 'Đã chuyển vào mục Đã thuộc' : 'Đã chuyển vào mục Chưa thuộc',
        value ? 'success' : 'info'
      );

      if (isGuest) {
        if (value && !wasLearned) bumpGuestDaily();
        return;
      }

      try {
        const res = await fetch(`/api/cards/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ learned: value }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.daily) setDaily(data.daily);
          if (activeTab === 'library') setLibRefreshTick((t) => t + 1);
        }
      } catch {
        showToast('Lỗi đồng bộ tiến độ lên máy chủ', 'error');
      }
    },
    [isGuest, persistGuestCards, bumpGuestDaily, showToast]
  );

  const toggleStarById = useCallback(
    async (card: CardItem) => {
      const nextVal = !card.starred;
      setCards((prev) => {
        const next = prev.map((c) => (c.id === card.id ? { ...c, starred: nextVal } : c));
        persistGuestCards(next);
        return next;
      });
      showToast(nextVal ? 'Đã gắn sao từ quan trọng' : 'Đã bỏ gắn sao', nextVal ? 'success' : 'info');

      if (isGuest) return;
      try {
        await fetch(`/api/cards/${card.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ starred: nextVal }),
        });
        if (activeTab === 'library') setLibRefreshTick((t) => t + 1);
      } catch {
        showToast('Lỗi lưu gắn sao lên máy chủ', 'error');
      }
    },
    [isGuest, persistGuestCards, showToast]
  );

  const saveCardNote = async (card: CardItem, noteText: string) => {
    const trimmed = noteText.trim().slice(0, 400);
    setCards((prev) => {
      const next = prev.map((c) => (c.id === card.id ? { ...c, note: trimmed } : c));
      persistGuestCards(next);
      return next;
    });
    setNoteOpen(false);
    showToast(trimmed ? 'Đã lưu ghi chú cho thẻ' : 'Đã xoá ghi chú', 'success');

    if (isGuest) return;
    try {
      await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: trimmed }),
      });
    } catch {
      showToast('Lỗi lưu ghi chú lên máy chủ', 'error');
    }
  };

  const mark = useCallback(
    async (value: boolean) => {
      if (!currentCard) return;
      const id = currentCard.id;
      const willRemoveFromView =
        (mode === 'unlearned' && value) || (mode === 'learned' && !value);
      const nextWordAfterMark = willRemoveFromView
        ? view[safeIndex + 1]?.word || view[0]?.word
        : undefined;

      setFlipped(false);
      stopSpeech();
      if (willRemoveFromView) {
        setShuffledIds((prev) => prev.filter((x) => x !== id));
      }
      await setCardLearnedById(id, value);
      if (autoSpeak && nextWordAfterMark && nextWordAfterMark !== currentCard.word) {
        speak(nextWordAfterMark, false);
      }
    },
    [currentCard, mode, view, safeIndex, stopSpeech, setCardLearnedById, autoSpeak, speak]
  );

  const markManyUnlearned = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      setCards((prev) => {
        const next = prev.map((c) => (idSet.has(c.id) ? { ...c, learned: false } : c));
        persistGuestCards(next);
        return next;
      });
      showToast(`Đã đánh dấu ${ids.length} từ là chưa thuộc`, 'info');
      if (isGuest) return;
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
    [isGuest, persistGuestCards, showToast]
  );

  const recordPracticeSession = useCallback(
    async (summary: {
      mode: 'dictation' | 'quiz';
      score: number;
      total: number;
      durationSec: number;
      missedWords: string[];
      missedIds: string[];
    }) => {
      const accuracy = Math.round((summary.score / Math.max(1, summary.total)) * 100);
      const localItem: StudySessionItem = {
        id: `sess-${Date.now()}`,
        mode: summary.mode,
        score: summary.score,
        total: summary.total,
        accuracy,
        durationSec: summary.durationSec,
        missedWords: summary.missedWords,
        createdAt: new Date().toISOString(),
      };

      // Update local wrongCount on missed cards
      if (summary.missedIds.length) {
        const missSet = new Set(summary.missedIds);
        setCards((prev) => {
          const next = prev.map((c) =>
            missSet.has(c.id) ? { ...c, wrongCount: (c.wrongCount || 0) + 1 } : c
          );
          persistGuestCards(next);
          return next;
        });
      }

      if (isGuest) {
        setSessions((prev) => {
          const next = [localItem, ...prev].slice(0, 30);
          persistGuestSessions(next);
          return next;
        });
        return;
      }

      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(summary),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.session) {
            setSessions((prev) => [data.session, ...prev].slice(0, 30));
          }
        }
      } catch {
        /* non-blocking */
      }
    },
    [isGuest, persistGuestCards, persistGuestSessions]
  );

  const updateDailyGoal = async (nextGoal: number) => {
    setDailyGoal(nextGoal);
    showToast(`Đã đặt mục tiêu ${nextGoal} từ / ngày`, 'success');
    if (isGuest) {
      try {
        localStorage.setItem(GUEST_GOAL_KEY, String(nextGoal));
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await fetch('/api/user/goal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyGoal: nextGoal }),
      });
    } catch {
      /* ignore */
    }
  };

  // Auto-persist all user UI preferences to localStorage whenever they change
  useEffect(() => {
    if (!prefsReady) return;
    try {
      localStorage.setItem('toeic_flashcards_autospeak', autoSpeak ? '1' : '0');
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          autoSpeak,
          reverseMode,
          activeTab,
          practiceMode,
          mode,
          typeFilter,
          libLimit,
          quizDir,
          quizSize,
          quizPoolMode,
        })
      );
    } catch {
      /* ignore */
    }
  }, [
    prefsReady,
    autoSpeak,
    reverseMode,
    activeTab,
    practiceMode,
    mode,
    typeFilter,
    libLimit,
    quizDir,
    quizSize,
    quizPoolMode,
  ]);

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

  const handleModeChange = (m: 'all' | 'unlearned' | 'learned' | 'starred') => {
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
    setSidebarOpen(false);
    setShuffledIds((prev) => [id, ...prev.filter((x) => x !== id)]);
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
    setNoteInput('');
    setActiveModal('edit');
    setTimeout(() => wordInputRef.current?.focus(), 50);
  };

  const openEdit = (card: CardItem) => {
    setEditingId(card.id);
    setWordInput(card.word);
    setMeaningInputs(card.meanings.map((m) => m.text));
    setNoteInput(card.note || '');
    setActiveModal('edit');
    setTimeout(() => wordInputRef.current?.focus(), 50);
  };

  const saveCard = async (keepOpen = false) => {
    const w = wordInput.trim();
    const cleaned = meaningInputs.map((x) => x.trim()).filter(Boolean);
    const noteTrim = noteInput.trim().slice(0, 400);
    if (!w || !cleaned.length) {
      showToast('Vui lòng nhập từ và ít nhất một nghĩa.', 'error');
      return;
    }

    if (isGuest) {
      if (editingId) {
        setCards((prev) => {
          const next = prev.map((c) =>
            c.id === editingId
              ? { ...c, word: w, meanings: cleaned.map((text) => ({ text })), note: noteTrim }
              : c
          );
          persistGuestCards(next);
          return next;
        });
        setActiveModal(null);
        showToast('Đã cập nhật flashcard', 'success');
      } else {
        const newCard: CardItem = {
          id: `guest-${Date.now()}`,
          word: w,
          meanings: cleaned.map((text) => ({ text })),
          learned: false,
          starred: false,
          note: noteTrim,
          reviewCount: 0,
          wrongCount: 0,
        };
        setCards((prev) => {
          const next = [newCard, ...prev];
          persistGuestCards(next);
          return next;
        });
        setShuffledIds((prev) => [newCard.id, ...prev]);
        setMode('all');
        setTypeFilter('all');
        setCurrentIndex(0);
        showToast(`Đã thêm: ${capFirst(w)}`, 'success');
        if (keepOpen) {
          setWordInput('');
          setMeaningInputs(['']);
          setNoteInput('');
          setTimeout(() => wordInputRef.current?.focus(), 20);
        } else {
          setActiveModal(null);
        }
      }
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
            note: noteTrim,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Lỗi cập nhật thẻ.', 'error');
          return;
        }
        setCards((prev) => prev.map((c) => (c.id === editingId ? data.card : c)));
        setLibRefreshTick((t) => t + 1);
        setActiveModal(null);
        showToast('Đã cập nhật flashcard', 'success');
      } else {
        const res = await fetch('/api/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: w,
            meanings: cleaned.map((text) => ({ text })),
            note: noteTrim,
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
        setLibRefreshTick((t) => t + 1);

        if (keepOpen) {
          setWordInput('');
          setMeaningInputs(['']);
          setNoteInput('');
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
    setCards((prev) => {
      const next = prev.filter((c) => c.id !== card.id);
      persistGuestCards(next);
      return next;
    });
    setShuffledIds((prev) => prev.filter((x) => x !== card.id));
    showToast('Đã xoá flashcard');
    if (isGuest) return;
    try {
      await fetch(`/api/cards/${card.id}`, { method: 'DELETE' });
      setLibRefreshTick((t) => t + 1);
    } catch {
      showToast('Lỗi xoá thẻ trên máy chủ', 'error');
    }
  };

  // Practice Quiz builder
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

      setQuizState({
        questions,
        i: 0,
        score: 0,
        answered: false,
        selectedIdx: null,
        wrong: [],
        startedAt: Date.now(),
        reported: false,
      });
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

  // Log completed quiz session
  useEffect(() => {
    if (quizState && quizState.i >= quizState.questions.length && !quizState.reported) {
      setQuizState((prev) => (prev ? { ...prev, reported: true } : prev));
      recordPracticeSession({
        mode: 'quiz',
        score: quizState.score,
        total: quizState.questions.length,
        durationSec: Math.max(1, Math.round((Date.now() - quizState.startedAt) / 1000)),
        missedWords: quizState.wrong.map((w) => w.word),
        missedIds: quizState.wrong.map((w) => w.id),
      });
    }
  }, [quizState, recordPracticeSession]);

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
      starred: !!c.starred,
      note: c.note || '',
    }));
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flashcard-toeic-${isGuest ? 'guest' : username}.json`;
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

      if (isGuest) {
        const imported: CardItem[] = parsed
          .filter((item) => item?.word && Array.isArray(item?.meanings) && item.meanings.length)
          .map((item, idx) => ({
            id: `guest-imp-${Date.now()}-${idx}`,
            word: String(item.word).trim(),
            meanings: item.meanings,
            learned: !!item.learned,
            starred: !!item.starred,
            note: typeof item.note === 'string' ? item.note : '',
          }));
        setCards(imported);
        persistGuestCards(imported);
        setShuffledIds(shuffleArray(imported.map((c) => c.id)));
        setCurrentIndex(0);
        setActiveModal(null);
        showToast(`Đã phục hồi ${imported.length} thẻ vào Tài khoản khách`, 'success');
        return;
      }

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
    setCards((prev) => {
      const next = prev.map((c) => ({ ...c, learned: false }));
      persistGuestCards(next);
      return next;
    });
    setActiveModal(null);
    showToast('Đã đặt lại tiến độ học');
    if (isGuest) return;
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
    if (isGuest) {
      onRequestAuth?.();
      return;
    }
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        setActiveModal(null);
        setSidebarOpen(false);
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

  // Debounce Library search input
  useEffect(() => {
    const t = setTimeout(() => {
      setLibSearchDebounced(libSearch);
      setLibPage(1);
    }, 200);
    return () => clearTimeout(t);
  }, [libSearch]);

  // Server-side filtered & paginated Library fetch (for logged-in accounts)
  useEffect(() => {
    if (activeTab !== 'library' || isGuest) return;
    let cancelled = false;
    setLibLoading(true);
    const params = new URLSearchParams({
      status: libStatus,
      pos: libPos,
      letter: libLetter,
      q: libSearchDebounced,
      page: String(libPage),
      limit: String(libLimit),
    });
    fetch(`/api/cards/list?${params.toString()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('HTTP error'))))
      .then((data) => {
        if (!cancelled) {
          setLibRemote(data);
          libScrollRef.current?.scrollTo({ top: 0 });
        }
      })
      .catch(() => {
        if (!cancelled) showToast('Không thể tải danh sách từ vựng', 'error');
      })
      .finally(() => {
        if (!cancelled) setLibLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    isGuest,
    libStatus,
    libPos,
    libLetter,
    libSearchDebounced,
    libPage,
    libLimit,
    libRefreshTick,
    showToast,
  ]);

  // Unified Vocabulary Library data (API for logged-in, local paginated mirror for Guest)
  const libView = useMemo(() => {
    if (!isGuest && libRemote) {
      return libRemote;
    }
    const statusBase = cards.filter((c) =>
      libStatus === 'all'
        ? true
        : libStatus === 'learned'
          ? c.learned
          : libStatus === 'unlearned'
            ? !c.learned
            : !!c.starred
    );
    const posCounts: Record<string, number> = {};
    statusBase.forEach((c) => detectPOS(c).forEach((t) => (posCounts[t] = (posCounts[t] || 0) + 1)));

    const q = keyOf(libSearchDebounced);
    const posSearchFiltered = statusBase.filter(
      (c) =>
        (libPos === 'all' || detectPOS(c).includes(libPos)) &&
        (!q || keyOf(c.word).includes(q) || c.meanings.some((m) => keyOf(m.text).includes(q)))
    );

    const letterCounts: Record<string, number> = {};
    posSearchFiltered.forEach((c) => {
      const L = firstLetter(c.word);
      letterCounts[L] = (letterCounts[L] || 0) + 1;
    });

    const finalList =
      libLetter !== 'all'
        ? posSearchFiltered.filter((c) => firstLetter(c.word) === libLetter)
        : posSearchFiltered;
    finalList.sort((a, b) => sortKey(a.word).localeCompare(sortKey(b.word), 'en'));

    const total = finalList.length;
    const totalPages = Math.max(1, Math.ceil(total / libLimit));
    const safePage = Math.min(libPage, totalPages);
    const start = (safePage - 1) * libLimit;

    return {
      items: finalList.slice(start, start + libLimit),
      total,
      page: safePage,
      totalPages,
      statusBaseLen: statusBase.length,
      statusCounts: {
        all: stats.total,
        unlearned: stats.remain,
        learned: stats.learned,
        starred: stats.starred,
      },
      posCounts,
      letterCounts,
    };
  }, [
    isGuest,
    libRemote,
    cards,
    libStatus,
    libPos,
    libLetter,
    libSearchDebounced,
    libPage,
    libLimit,
    stats,
  ]);

  // Analytics computed metrics
  const analytics = useMemo(() => {
    const avgAccuracy = sessions.length
      ? Math.round(sessions.reduce((acc, s) => acc + s.accuracy, 0) / sessions.length)
      : 0;
    const hardCards = cards
      .filter((c) => c.starred || (c.wrongCount || 0) > 0)
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0) || (b.starred ? 1 : 0) - (a.starred ? 1 : 0))
      .slice(0, 20);
    return { avgAccuracy, hardCards };
  }, [cards, sessions]);

  const jumpLetter = (prefix: string, L: string) => {
    const el = document.getElementById(`${prefix}-${L === '#' ? '0' : L}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const pageTitleMap: Record<MainTab, string> = {
    study: 'Học thẻ Flashcard',
    practice: 'Phòng luyện tập',
    library: 'Danh sách từ vựng',
    irregular: 'Động từ bất quy tắc',
    stats: 'Thống kê & Tiến độ',
  };

  const switchTab = (next: MainTab) => {
    stopSpeech();
    setActiveTab(next);
    setSidebarOpen(false);
  };

  const goalPct = Math.min(100, Math.round((dailyDisplay.today / Math.max(1, dailyGoal)) * 100));

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
    <div className="appShell">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div className="sidebarBackdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* ==================== LEFT APP SIDEBAR (FIXED, COMPACT 100VH) ==================== */}
      <aside className={`appSidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Menu điều hướng">
        <div className="sidebarTop">
          <div className="sidebarBrand">
            <span className="topBrandMark">
              <IconBook size={18} />
            </span>
            <div>
              <div className="topBrandName">Flashcard TOEIC</div>
              <div className="topBrandSub">{isGuest ? 'Chế độ Khách' : 'Cloud Sync'}</div>
            </div>
          </div>
          <button
            type="button"
            className="sidebarCloseBtn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Đóng menu"
          >
            <IconX size={18} />
          </button>
        </div>

        <nav className="sidebarNav">
          <button
            type="button"
            className={`sidebarItem ${activeTab === 'study' ? 'active' : ''}`}
            onClick={() => switchTab('study')}
          >
            <IconBook size={18} />
            <span>Học thẻ</span>
          </button>
          <button
            type="button"
            className={`sidebarItem ${activeTab === 'practice' ? 'active' : ''}`}
            onClick={() => switchTab('practice')}
          >
            <IconHeadphones size={18} />
            <span>Luyện tập</span>
          </button>
          <button
            type="button"
            className={`sidebarItem ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => switchTab('library')}
          >
            <IconList size={18} />
            <span>Danh sách từ</span>
            <span className="sidebarBadge">{stats.total}</span>
          </button>
          <button
            type="button"
            className={`sidebarItem ${activeTab === 'irregular' ? 'active' : ''}`}
            onClick={() => switchTab('irregular')}
          >
            <IconLayers size={18} />
            <span>Bất quy tắc</span>
          </button>
          <button
            type="button"
            className={`sidebarItem ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => switchTab('stats')}
          >
            <IconBarChart size={18} />
            <span>Thống kê</span>
          </button>
        </nav>

        {/* Compact Progress Widget inside Sidebar */}
        <div className="sidebarProgressBox">
          <div className="sidebarProgTop">
            <span>Đã thuộc</span>
            <b>{stats.pct}%</b>
          </div>
          <div className="sidebarProgTrack">
            <div className="sidebarProgFill" style={{ width: `${stats.pct}%` }} />
          </div>
          <div className="sidebarProgMeta">
            <span>
              {stats.learned} / {stats.total} từ
            </span>
            <span className="sidebarStreakInline">
              <IconFlame size={13} className="flameIcon" />
              {dailyDisplay.streak} ngày
            </span>
          </div>

          <div className="sidebarGoalRow">
            <span>Mục tiêu hôm nay</span>
            <b>
              {dailyDisplay.today}/{dailyGoal}
            </b>
          </div>
          <div className="sidebarProgTrack thin">
            <div className="sidebarProgFill gold" style={{ width: `${goalPct}%` }} />
          </div>
        </div>

        {/* Sidebar Footer: Account */}
        <div className="sidebarFooter">
          <div className="sidebarUser">
            <span className="sidebarAvatar">
              <IconUser size={16} />
            </span>
            <div className="sidebarUserInfo">
              <b>{username}</b>
              <span>{isGuest ? 'Lưu trên trình duyệt' : 'Đã đồng bộ Cloud'}</span>
            </div>
          </div>
          <button
            type="button"
            className={`sidebarAuthBtn ${isGuest ? 'primary' : 'ghost'}`}
            onClick={handleLogout}
          >
            {isGuest ? <IconLogIn size={15} /> : <IconLogout size={15} />}
            <span>{isGuest ? 'Đăng nhập / Lưu Cloud' : 'Đăng xuất'}</span>
          </button>
        </div>
      </aside>

      {/* ==================== RIGHT MAIN AREA (SLIM HEADER + CONTENT) ==================== */}
      <div className="appMain">
        <header className="appHeader">
          <div className="appHeaderLeft">
            <button
              type="button"
              className="iconBtn ghost mobileMenuBtn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Mở menu"
            >
              <IconMenu size={19} />
            </button>
            <h1 className="appHeaderTitle">{pageTitleMap[activeTab]}</h1>

            {activeTab === 'study' && (
              <div className="headerSearchWrap">
                <IconSearch size={15} className="searchFieldIcon" />
                <input
                  value={quickSearch}
                  onChange={(e) => handleQuickSearch(e.target.value)}
                  placeholder="Tìm nhanh & nhảy tới thẻ..."
                />
              </div>
            )}
          </div>

          <div className="appHeaderRight">
            <button
              type="button"
              className={`iconBtn ${autoSpeak ? 'success' : 'ghost'}`}
              onClick={toggleAutoSpeak}
              title="Tự động đọc khi chuyển thẻ (A)"
              aria-label="Tự động đọc"
            >
              {autoSpeak ? <IconVolume size={17} /> : <IconVolumeOff size={17} />}
            </button>
            <button
              type="button"
              className="iconBtn ghost"
              onClick={toggleTheme}
              title="Đổi giao diện sáng / tối"
              aria-label="Đổi giao diện sáng / tối"
            >
              {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
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
          </div>
        </header>

        <main className="appContent">
          {/* ==================== TAB 1: HỌC THẺ ==================== */}
          {activeTab === 'study' && (
            <div className="studyCleanWrap">
              {/* Compact Horizontal Filter Strip (replaces tall left rail) */}
              <div className="studyFilterBar">
                <div className="segGroup" role="tablist" aria-label="Trạng thái thẻ">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'all'}
                    className={`segBtn ${mode === 'all' ? 'active' : ''}`}
                    onClick={() => handleModeChange('all')}
                  >
                    Tất cả ({stats.total})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'unlearned'}
                    className={`segBtn ${mode === 'unlearned' ? 'active' : ''}`}
                    onClick={() => handleModeChange('unlearned')}
                  >
                    Chưa thuộc ({stats.remain})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'learned'}
                    className={`segBtn ${mode === 'learned' ? 'active' : ''}`}
                    onClick={() => handleModeChange('learned')}
                  >
                    Đã thuộc ({stats.learned})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'starred'}
                    className={`segBtn ${mode === 'starred' ? 'active' : ''}`}
                    onClick={() => handleModeChange('starred')}
                  >
                    Gắn sao ({stats.starred})
                  </button>
                </div>

                <div className="studyFilterRight">
                  <select
                    className="posSelect"
                    value={typeFilter}
                    onChange={(e) => handleTypeChange(e.target.value as 'all' | PosKey)}
                    aria-label="Lọc theo từ loại"
                  >
                    <option value="all">Tất cả từ loại ({typeCounts.baseLen})</option>
                    {POS_LIST.map(([k, label]) => {
                      const n = typeCounts.counts[k] || 0;
                      if (!n && typeFilter !== k) return null;
                      return (
                        <option key={k} value={k}>
                          {label} ({n})
                        </option>
                      );
                    })}
                  </select>

                  <button
                    type="button"
                    className="soft small btnIconText"
                    onClick={() => {
                      setPracticeMode('dictation');
                      switchTab('practice');
                    }}
                  >
                    <IconHeadphones size={15} />
                    <span>Nghe chép từ</span>
                  </button>
                </div>
              </div>

              {/* Card Stage Toolbar */}
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
                        className={`barIconBtn ${currentCard.starred ? 'starActive' : ''}`}
                        onClick={() => toggleStarById(currentCard)}
                        title={currentCard.starred ? 'Bỏ gắn sao' : 'Gắn sao từ quan trọng'}
                        aria-label="Gắn sao"
                      >
                        <IconStar size={18} filled={!!currentCard.starred} />
                      </button>
                      <button
                        type="button"
                        className={`barIconBtn ${noteOpen || currentCard.note ? 'noteActive' : ''}`}
                        onClick={() => setNoteOpen((o) => !o)}
                        title="Ghi chú cá nhân / câu ví dụ"
                        aria-label="Ghi chú"
                      >
                        <IconNote size={18} />
                      </button>
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
                            : mode === 'starred'
                              ? 'Chưa có từ nào được gắn sao'
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
                            {currentCard.note && (
                              <div className="cardNoteChip">Ghi chú: {currentCard.note}</div>
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
                        {currentCard?.note && (
                          <div className="cardNoteChip" style={{ marginTop: 14 }}>
                            Ghi chú: {currentCard.note}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Collapsible Inline Personal Note Editor */}
              {currentCard && noteOpen && (
                <form
                  className="noteEditorBar"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveCardNote(currentCard, noteDraft);
                  }}
                >
                  <input
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Thêm ghi chú, mẹo nhớ hoặc câu ví dụ cho từ này..."
                    maxLength={400}
                  />
                  <button type="submit" className="primary small">
                    Lưu ghi chú
                  </button>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => setNoteOpen(false)}
                  >
                    Đóng
                  </button>
                </form>
              )}

              {/* Controls */}
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
                Phím tắt: <kbd>←</kbd> <kbd>→</kbd> chuyển thẻ · <kbd>Space</kbd> lật · <kbd>C</kbd>{' '}
                chưa thuộc · <kbd>V</kbd> đã thuộc · <kbd>R</kbd> đọc to · <kbd>A</kbd> tự động đọc
              </div>

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
                      >
                        {capFirst(rc.word)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 2: LUYỆN TẬP ==================== */}
          {activeTab === 'practice' && (
            <div className="innerPageWrap">
              <div className="practiceHeader">
                <div>
                  <h2 className="pageTitle">Luyện tập phản xạ</h2>
                  <p className="pageSub">
                    Kết quả mỗi lượt luyện tập được tự động lưu vào mục Thống kê.
                  </p>
                </div>

                <div className="practiceModeSwitch" role="tablist">
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
                      <span>Nghe từng từ &amp; gõ lại chuẩn xác</span>
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
                      <span>Chọn nhanh 4 đáp án (phím 1–4)</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={practiceMode === 'plane'}
                    className={`practiceModeBtn ${practiceMode === 'plane' ? 'active' : ''}`}
                    onClick={() => {
                      stopSpeech();
                      setPracticeMode('plane');
                    }}
                  >
                    <IconPlane size={18} />
                    <div>
                      <b>Bắn máy bay từ vựng</b>
                      <span>Hạ máy bay &amp; đua Top điểm</span>
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
                  onSessionComplete={recordPracticeSession}
                />
              ) : practiceMode === 'plane' ? (
                <PlaneShooterGame
                  cards={cards}
                  isGuest={isGuest}
                  onSpeak={speak}
                  onToast={showToast}
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
                                    <span>
                                      {m.meanings.map((x) => capFirst(x.text)).join('; ')}
                                    </span>
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
                            Xuất sắc! Bạn đã trả lời chính xác toàn bộ câu hỏi.
                          </p>
                        )}

                        <div className="formBtns" style={{ justifyContent: 'center', marginTop: 22 }}>
                          {quizState.wrong.length > 0 && (
                            <button
                              type="button"
                              className="danger btnIconText"
                              onClick={() => markManyUnlearned(quizState.wrong.map((w) => w.id))}
                            >
                              <IconX size={15} />
                              <span>Đánh dấu chưa thuộc ({quizState.wrong.length})</span>
                            </button>
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
                              Mẹo: Nhấn phím <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> để
                              chọn đáp án · nhấn <kbd>R</kbd> để nghe phát âm
                            </div>
                          </div>
                        );
                      })()
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 3: DANH SÁCH TỪ (STICKY FILTER + API PAGINATION) ==================== */}
          {activeTab === 'library' && (
            <section className="libViewportPanel">
              {/* Pinned Top Filter Header — NEVER scrolls away */}
              <div className="libStickyTop">
                <div className="libTopRow">
                  <div className="segGroup">
                    <button
                      type="button"
                      className={`segBtn ${libStatus === 'all' ? 'active' : ''}`}
                      onClick={() => {
                        setLibStatus('all');
                        setLibPage(1);
                      }}
                    >
                      Tất cả ({libView.statusCounts.all})
                    </button>
                    <button
                      type="button"
                      className={`segBtn ${libStatus === 'unlearned' ? 'active' : ''}`}
                      onClick={() => {
                        setLibStatus('unlearned');
                        setLibPage(1);
                      }}
                    >
                      Chưa thuộc ({libView.statusCounts.unlearned})
                    </button>
                    <button
                      type="button"
                      className={`segBtn ${libStatus === 'learned' ? 'active' : ''}`}
                      onClick={() => {
                        setLibStatus('learned');
                        setLibPage(1);
                      }}
                    >
                      Đã thuộc ({libView.statusCounts.learned})
                    </button>
                    <button
                      type="button"
                      className={`segBtn ${libStatus === 'starred' ? 'active' : ''}`}
                      onClick={() => {
                        setLibStatus('starred');
                        setLibPage(1);
                      }}
                    >
                      Gắn sao ({libView.statusCounts.starred})
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

                  <span className="libResultSummary">
                    {libLoading ? 'Đang lọc...' : `${libView.total} từ phù hợp`}
                  </span>
                </div>

                {/* POS Filter Chips */}
                <div className="catChips compactChips">
                  <button
                    type="button"
                    className={`chip ${libPos === 'all' ? 'active' : ''}`}
                    onClick={() => {
                      setLibPos('all');
                      setLibPage(1);
                    }}
                  >
                    Tất cả từ loại <span className="chipN">{libView.statusBaseLen}</span>
                  </button>
                  {POS_LIST.map(([k, label]) => {
                    const n = libView.posCounts[k] || 0;
                    if (!n && libPos !== k) return null;
                    return (
                      <button
                        key={k}
                        type="button"
                        className={`chip ${libPos === k ? 'active' : ''}`}
                        onClick={() => {
                          setLibPos(k);
                          setLibPage(1);
                        }}
                      >
                        {label} <span className="chipN">{n}</span>
                      </button>
                    );
                  })}
                </div>

                {/* A-Z Filter Bar (calls API filter instead of manual DOM jump) */}
                <div className="azBar compactAz">
                  <button
                    type="button"
                    className={libLetter === 'all' ? 'active' : ''}
                    onClick={() => {
                      setLibLetter('all');
                      setLibPage(1);
                    }}
                    style={{ width: 'auto', padding: '0 10px' }}
                  >
                    Tất cả
                  </button>
                  {'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((L) => (
                    <button
                      key={L}
                      type="button"
                      className={`${libLetter === L ? 'active' : ''} ${
                        libView.letterCounts[L] ? '' : 'off'
                      }`}
                      onClick={() => {
                        setLibLetter((cur) => (cur === L ? 'all' : L));
                        setLibPage(1);
                      }}
                    >
                      {L}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable Paginated List Body */}
              <div ref={libScrollRef} className="libScrollBody">
                {libLoading && libView.items.length === 0 ? (
                  <div className="empty">Đang tải danh sách từ vựng...</div>
                ) : libView.items.length === 0 ? (
                  <div className="empty">Không có từ vựng nào khớp với bộ lọc hiện tại.</div>
                ) : (
                  <div className="libListGrid">
                    {libView.items.map((c) => {
                      const posTags = detectPOS(c).filter((t) => t !== 'other');
                      return (
                        <div key={c.id} className={`item libItem ${c.learned ? 'learned' : ''}`}>
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
                            {c.note && <span className="libNoteLine">Ghi chú: {c.note}</span>}
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
                              className={`iconActionBtn ${c.starred ? 'starBtnOn' : 'ghost'}`}
                              onClick={() => toggleStarById(c)}
                              title="Gắn sao"
                              aria-label="Gắn sao"
                            >
                              <IconStar size={16} filled={!!c.starred} />
                            </button>
                            <button
                              type="button"
                              className={`iconActionBtn ${c.learned ? 'success' : 'soft'}`}
                              onClick={() => setCardLearnedById(c.id, !c.learned)}
                              title={c.learned ? 'Đánh dấu chưa thuộc' : 'Đánh dấu đã thuộc'}
                              aria-label="Đổi trạng thái thuộc"
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
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pinned Bottom Pagination Bar */}
              <div className="libPaginationBar">
                <div className="libPageInfo">
                  Trang <b>{libView.page}</b> / {libView.totalPages} · Hiển thị{' '}
                  <b>{libView.items.length}</b> / {libView.total} từ
                </div>

                <div className="libPageControls">
                  <select
                    className="posSelect smallSelect"
                    value={libLimit}
                    onChange={(e) => {
                      setLibLimit(Number(e.target.value) as 25 | 50 | 100);
                      setLibPage(1);
                    }}
                    aria-label="Số từ mỗi trang"
                  >
                    <option value={25}>25 từ / trang</option>
                    <option value={50}>50 từ / trang</option>
                    <option value={100}>100 từ / trang</option>
                  </select>

                  <button
                    type="button"
                    className="ghost small"
                    disabled={libView.page <= 1}
                    onClick={() => setLibPage((p) => Math.max(1, p - 1))}
                  >
                    ← Trước
                  </button>
                  <button
                    type="button"
                    className="primary small"
                    disabled={libView.page >= libView.totalPages}
                    onClick={() => setLibPage((p) => Math.min(libView.totalPages, p + 1))}
                  >
                    Tiếp →
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ==================== TAB 4: BẤT QUY TẮC ==================== */}
          {activeTab === 'irregular' && (
            <div className="innerPageWrap">
              <IrregularView onSpeak={speak} />
            </div>
          )}

          {/* ==================== TAB 5: THỐNG KÊ & TIẾN ĐỘ ==================== */}
          {activeTab === 'stats' && (
            <div className="innerPageWrap statsPageGrid">
              {/* Top 4 KPI Cards */}
              <div className="kpiGrid">
                <div className="kpiCard">
                  <span className="kpiLabel">Tổng đã thuộc</span>
                  <b className="kpiVal teal">
                    {stats.learned} / {stats.total}
                  </b>
                  <span className="kpiSub">Hoàn thành {stats.pct}% bộ từ</span>
                </div>
                <div className="kpiCard">
                  <span className="kpiLabel">Mục tiêu hôm nay</span>
                  <b className="kpiVal">
                    {dailyDisplay.today} / {dailyGoal}
                  </b>
                  <div className="goalPickRow">
                    {([10, 20, 30, 50] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`goalChip ${dailyGoal === g ? 'active' : ''}`}
                        onClick={() => updateDailyGoal(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="kpiCard">
                  <span className="kpiLabel">Từ gắn sao / hay sai</span>
                  <b className="kpiVal gold">{analytics.hardCards.length}</b>
                  <span className="kpiSub">{stats.starred} từ đã gắn sao ưu tiên</span>
                </div>
                <div className="kpiCard">
                  <span className="kpiLabel">Độ chính xác luyện tập</span>
                  <b className="kpiVal">{sessions.length ? `${analytics.avgAccuracy}%` : '—'}</b>
                  <span className="kpiSub">{sessions.length} phiên gần đây</span>
                </div>
              </div>

              <div className="statsTwoCol">
                {/* Hard / Starred Words */}
                <section className="pagePanel">
                  <div className="pagePanelHead" style={{ marginBottom: 12 }}>
                    <div>
                      <h2 className="pageTitle" style={{ fontSize: 20 }}>
                        Từ cần chú ý (Gắn sao &amp; Hay sai)
                      </h2>
                      <p className="pageSub">Ưu tiên ôn lại các từ bạn gắn sao hoặc hay gõ nhầm.</p>
                    </div>
                  </div>
                  {analytics.hardCards.length === 0 ? (
                    <div className="empty">
                      Chưa có từ khó nào. Bấm biểu tượng ngôi sao trên thẻ hoặc luyện tập để hệ
                      thống tự ghi nhận.
                    </div>
                  ) : (
                    <div className="statsList">
                      {analytics.hardCards.map((c) => (
                        <div key={c.id} className="dictMissedRow">
                          <div style={{ cursor: 'pointer' }} onClick={() => jumpToCard(c.id)}>
                            <b>
                              {capFirst(c.word)}{' '}
                              {(c.wrongCount || 0) > 0 && (
                                <small className="wrongPill">Sai {c.wrongCount} lần</small>
                              )}
                            </b>
                            <span>{c.meanings.map((m) => capFirst(m.text)).join('; ')}</span>
                          </div>
                          <button
                            type="button"
                            className="spkBig"
                            onClick={() => speak(c.word, false)}
                          >
                            <IconVolume size={15} />
                            <span>Nghe</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Recent Practice Sessions (StudySession model) */}
                <section className="pagePanel">
                  <div className="pagePanelHead" style={{ marginBottom: 12 }}>
                    <div>
                      <h2 className="pageTitle" style={{ fontSize: 20 }}>
                        Lịch sử luyện tập
                      </h2>
                      <p className="pageSub">
                        Lưu tự động sau mỗi lượt Nghe chép chính tả hoặc Trắc nghiệm.
                      </p>
                    </div>
                  </div>
                  {sessions.length === 0 ? (
                    <div className="empty">
                      Chưa có phiên luyện tập nào. Hãy sang mục Luyện tập để bắt đầu lượt đầu tiên!
                    </div>
                  ) : (
                    <div className="statsList">
                      {sessions.map((s) => (
                        <div key={s.id} className="sessionRow">
                          <div>
                            <div className="sessionModeRow">
                              <span className={`sessionTag ${s.mode}`}>
                                {s.mode === 'dictation' ? 'Nghe chép chính tả' : 'Trắc nghiệm'}
                              </span>
                              <span className="sessionDate">
                                {new Date(s.createdAt).toLocaleString('vi-VN', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <div className="sessionMeta">
                              Đúng <b>{s.score}/{s.total}</b> câu · {s.durationSec}s
                            </div>
                          </div>
                          <div className={`sessionAcc ${s.accuracy >= 80 ? 'ok' : ''}`}>
                            {s.accuracy}%
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ==================== MODAL: ADD / EDIT FLASHCARD (SPACIOUS & ALIGNED) ==================== */}
      {activeModal === 'edit' && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="box editBox">
            <button
              type="button"
              className="closeX"
              onClick={() => setActiveModal(null)}
              aria-label="Đóng"
            >
              <IconX size={20} />
            </button>
            <h2 className="editModalTitle">
              {editingId ? 'Sửa flashcard' : 'Thêm flashcard mới'}
            </h2>
            <p className="editModalSub">
              Nhập từ tiếng Anh và nghĩa tiếng Việt. Nếu từ đã tồn tại, hệ thống sẽ tự gộp nghĩa mới.
            </p>

            <div className="editFormStack">
              <div className="editField">
                <label htmlFor="edit-word">Từ / cụm từ tiếng Anh</label>
                <input
                  id="edit-word"
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
              </div>

              <div className="editField">
                <div className="editFieldHead">
                  <label htmlFor="edit-meaning-0">Nghĩa tiếng Việt</label>
                  <button
                    type="button"
                    className="ghost small btnIconText"
                    onClick={() => setMeaningInputs((prev) => [...prev, ''])}
                  >
                    <IconPlus size={14} />
                    <span>Thêm nghĩa</span>
                  </button>
                </div>
                <div className="meaningStack">
                  {meaningInputs.map((val, idx) => (
                    <div key={idx} className="meaningRowFlat">
                      <input
                        id={`edit-meaning-${idx}`}
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
                        placeholder={
                          idx === 0
                            ? 'Nghĩa tiếng Việt, ví dụ: chính xác'
                            : `Nghĩa bổ sung #${idx + 1}...`
                        }
                        autoComplete="off"
                      />
                      {meaningInputs.length > 1 && (
                        <button
                          type="button"
                          className="rowRemove"
                          onClick={() =>
                            setMeaningInputs((prev) => prev.filter((_, i) => i !== idx))
                          }
                          title="Bỏ nghĩa này"
                          aria-label="Bỏ nghĩa này"
                        >
                          <IconX size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="editField">
                <label htmlFor="edit-note">
                  Ghi chú / câu ví dụ <span className="authOpt">(tuỳ chọn)</span>
                </label>
                <input
                  id="edit-note"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Ví dụ: We need a precise measurement."
                  maxLength={400}
                />
              </div>
            </div>

            <div className="editModalFooter">
              <button type="button" className="soft" onClick={() => setActiveModal(null)}>
                Huỷ
              </button>
              <button
                type="button"
                className="primary"
                disabled={savingCard}
                onClick={() => saveCard(false)}
              >
                {savingCard ? 'Đang lưu...' : editingId ? 'Lưu thay đổi' : 'Lưu flashcard'}
              </button>
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
              {isGuest
                ? 'Bạn đang dùng Tài khoản khách (lưu ngay trên trình duyệt này). Bạn có thể xuất file JSON hoặc đăng nhập để đồng bộ lên MongoDB.'
                : `Tất cả tiến độ học đã tự động đồng bộ lên MongoDB cho tài khoản ${username}.`}
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

      {/* Mobile Bottom Tab Bar (visible on <= 860px for 1-thumb navigation) */}
      <nav className="mobileBottomNav" aria-label="Điều hướng di động">
        <button
          type="button"
          className={`mobileNavBtn ${activeTab === 'study' ? 'active' : ''}`}
          onClick={() => switchTab('study')}
        >
          <IconBook size={19} />
          <span>Học thẻ</span>
        </button>
        <button
          type="button"
          className={`mobileNavBtn ${activeTab === 'practice' ? 'active' : ''}`}
          onClick={() => switchTab('practice')}
        >
          <IconHeadphones size={19} />
          <span>Luyện tập</span>
        </button>
        <button
          type="button"
          className={`mobileNavBtn ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => switchTab('library')}
        >
          <IconList size={19} />
          <span>Từ vựng</span>
        </button>
        <button
          type="button"
          className={`mobileNavBtn ${activeTab === 'irregular' ? 'active' : ''}`}
          onClick={() => switchTab('irregular')}
        >
          <IconLayers size={19} />
          <span>Bất quy tắc</span>
        </button>
        <button
          type="button"
          className={`mobileNavBtn ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => switchTab('stats')}
        >
          <IconBarChart size={19} />
          <span>Thống kê</span>
        </button>
      </nav>

      {/* Top-right Toast */}
      <Toast
        id={toast.id}
        msg={toast.msg}
        type={toast.type}
        visible={toastVisible}
        durationMs={2600}
        onClose={() => setToastVisible(false)}
      />
    </div>
  );
}
