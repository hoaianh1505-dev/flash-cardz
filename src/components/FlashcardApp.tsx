'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capFirst, detectPOS, keyOf, POS_LIST, POS_SHORT, PosKey } from '@/lib/pos';
import IrregularModal from './IrregularModal';

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
  const [supportsSpeech, setSupportsSpeech] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Modals
  const [activeModal, setActiveModal] = useState<
    null | 'edit' | 'review' | 'quiz' | 'data' | 'cat' | 'irr'
  >(null);

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

  // Toast
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Speech refs
  const enVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speakSeqRef = useRef(0);

  // Touch swipe refs
  const touchRef = useRef({ x0: 0, y0: 0, t0: 0, tracking: false });
  const suppressFlipRef = useRef(false);
  const flashcardRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2000);
  }, []);

  // Init theme, autoSpeak, speech voices, and load cards from MongoDB
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
      setSupportsSpeech(true);
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
        showToast('Không thể tải dữ liệu từ máy chủ');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const stopSpeech = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    speakSeqRef.current++;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback((text: string, slow?: boolean) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      if (synth.paused) synth.resume();
      const my = ++speakSeqRef.current;
      const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
      u.lang = 'en-US';
      if (enVoiceRef.current) u.voice = enVoiceRef.current;
      u.rate = slow ? 0.6 : 0.95;
      u.onstart = () => {
        if (my === speakSeqRef.current) setIsSpeaking(true);
      };
      u.onend = u.onerror = () => {
        if (my === speakSeqRef.current) setIsSpeaking(false);
      };
      synth.speak(u);
    } catch {
      /* ignore */
    }
  }, []);

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
    return `🔥 Chuỗi ${streak} ngày · Hôm nay đã thuộc +${n} từ${n === 0 ? ' — bắt đầu thôi!' : ''}`;
  }, [daily]);

  const speakCurrent = useCallback(
    (slow?: boolean) => {
      if (!supportsSpeech) {
        showToast('Trình duyệt này không hỗ trợ đọc loa');
        return;
      }
      if (currentCard) speak(currentCard.word, slow === true);
    },
    [supportsSpeech, currentCard, speak, showToast]
  );

  const nextCard = useCallback(() => {
    if (!view.length) return;
    const nextIdx = (safeIndex + 1) % view.length;
    setCurrentIndex(nextIdx);
    setFlipped(false);
    stopSpeech();
    if (autoSpeak && view[nextIdx]) speak(view[nextIdx].word);
  }, [view, safeIndex, stopSpeech, autoSpeak, speak]);

  const previousCard = useCallback(() => {
    if (!view.length) return;
    const prevIdx = (safeIndex - 1 + view.length) % view.length;
    setCurrentIndex(prevIdx);
    setFlipped(false);
    stopSpeech();
    if (autoSpeak && view[prevIdx]) speak(view[prevIdx].word);
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

      // Optimistic update
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, learned: value } : c)));
      setFlipped(false);
      stopSpeech();
      if ((mode === 'unlearned' && value) || (mode === 'learned' && !value)) {
        setShuffledIds((prev) => prev.filter((x) => x !== id));
      }
      showToast(value ? '✓ Đã chuyển vào phần Đã thuộc' : '✗ Đã chuyển vào phần Chưa thuộc');

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
        showToast('Lỗi lưu tiến độ lên máy chủ');
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
    showToast(next ? '🔊 Tự động đọc: BẬT' : '🔇 Tự động đọc: TẮT');
    if (next && currentCard) speak(currentCard.word);
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
    showToast('🔀 Đã trộn ngẫu nhiên các thẻ');
  };

  const jumpToCard = useCallback(
    (id: string) => {
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
    },
    []
  );

  const handleQuickSearch = (val: string) => {
    setQuickSearch(val);
    const q = keyOf(val);
    if (!q) return;
    const found = cards.find(
      (c) => keyOf(c.word).includes(q) || c.meanings.some((m) => keyOf(m.text).includes(q))
    );
    if (found) jumpToCard(found.id);
  };

  // Add / Edit
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
      alert('Vui lòng nhập từ và ít nhất một nghĩa.');
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
          alert(data.error || 'Lỗi cập nhật thẻ.');
          return;
        }
        setCards((prev) => prev.map((c) => (c.id === editingId ? data.card : c)));
        setActiveModal(null);
        showToast('✅ Đã cập nhật flashcard');
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
          alert(data.error || 'Lỗi thêm thẻ.');
          return;
        }
        if (data.merged) {
          setCards((prev) => prev.map((c) => (c.id === data.card.id ? data.card : c)));
          showToast(
            data.addedAny
              ? `🔗 Đã gộp nghĩa mới vào từ "${capFirst(data.card.word)}"`
              : 'Từ này đã có sẵn nghĩa đó rồi'
          );
        } else {
          setCards((prev) => [data.card, ...prev]);
          setShuffledIds((prev) => [data.card.id, ...prev]);
          setMode('all');
          setTypeFilter('all');
          setCurrentIndex(0);
          showToast(`✅ Đã thêm: ${capFirst(data.card.word)}`);
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
      alert('Không thể kết nối máy chủ.');
    } finally {
      setSavingCard(false);
    }
  };

  const deleteCard = async (card: CardItem) => {
    if (
      !confirm(
        `Xoá toàn bộ thẻ "${capFirst(card.word)}" (gồm ${card.meanings.length} nghĩa)?`
      )
    )
      return;
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    setShuffledIds((prev) => prev.filter((x) => x !== card.id));
    showToast('🗑 Đã xoá flashcard');
    try {
      await fetch(`/api/cards/${card.id}`, { method: 'DELETE' });
    } catch {
      showToast('Lỗi xoá thẻ trên máy chủ');
    }
  };

  const toggleLearnedInList = async (card: CardItem) => {
    const nextVal = !card.learned;
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, learned: nextVal } : c)));
    showToast(nextVal ? '✓ Đã chuyển vào phần Đã thuộc' : '✗ Đã chuyển vào phần Chưa thuộc');
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
      showToast('Lỗi đồng bộ lên máy chủ');
    }
  };

  // Quiz
  const openQuiz = useCallback(() => {
    const pool = view.length >= 4 ? view : cards;
    if (pool.length < 4) {
      showToast('Cần ít nhất 4 thẻ để trắc nghiệm');
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
    if (autoSpeak && questions[0]) speak(questions[0].card.word);
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
              speak(cur.questions[nextI].card.word);
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
    showToast(`✗ Đã đánh dấu ${ids.length} từ là chưa thuộc`);
    try {
      await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-unlearned', ids }),
      });
    } catch {
      showToast('Lỗi đồng bộ lên máy chủ');
    }
  };

  // Backup / Restore / Reset
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
    showToast('⬇ Đã tải xuống file sao lưu');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) || !parsed.length) throw new Error('Invalid JSON');
      const res = await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', cards: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setCards(data.cards);
      setShuffledIds(shuffleArray(data.cards.map((c: CardItem) => c.id)));
      setCurrentIndex(0);
      setActiveModal(null);
      showToast(`✅ Đã phục hồi ${data.cards.length} thẻ từ file`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'File không hợp lệ.');
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
    showToast('↺ Đã đặt lại tiến độ học');
    try {
      await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-progress' }),
      });
    } catch {
      showToast('Lỗi đồng bộ lên máy chủ');
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
          speak(quizState.questions[quizState.i].card.word, e.shiftKey);
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
        speakCurrent(e.shiftKey);
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

  // Review list grouped A-Z
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

  // Category list grouped A-Z
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

  if (loading) {
    return (
      <div className="authWrap">
        <div className="authCard" style={{ textAlign: 'center' }}>
          <h1>Flashcard TOEIC</h1>
          <p className="authSub">Đang tải bộ thẻ của {username}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <div className="headTitle">
          <h1>Flashcard TOEIC</h1>
          <p>
            <span>{stats.total}</span> từ vựng · bấm vào thẻ để lật · Cloud Sync
          </p>
        </div>
        <div className="headActions">
          <span className="userBadge">👤 {username}</span>
          {supportsSpeech && (
            <button
              type="button"
              className={`iconBtn ${autoSpeak ? 'success' : 'ghost'}`}
              onClick={toggleAutoSpeak}
              title="Tự động đọc khi chuyển thẻ (A)"
              aria-label="Tự động đọc"
            >
              {autoSpeak ? '🔊' : '🔇'}
            </button>
          )}
          <button
            type="button"
            className="iconBtn ghost"
            onClick={toggleTheme}
            title="Đổi giao diện sáng/tối"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setActiveModal('data')}
            title="Sao lưu / phục hồi"
          >
            ⇅ Dữ liệu
          </button>
          <button type="button" className="primary" onClick={openAdd}>
            + Thêm từ
          </button>
          <button type="button" className="danger small" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="stats">
        <div className="stat">
          <b>{stats.total}</b>
          <span>Tổng số thẻ</span>
        </div>
        <div className="stat">
          <b>{stats.learned}</b>
          <span>Đã thuộc</span>
        </div>
        <div className="stat">
          <b>{stats.remain}</b>
          <span>Chưa thuộc</span>
        </div>
        <div className="stat mastery">
          <b>{stats.pct}%</b>
          <span>Mức độ thuộc</span>
        </div>
      </div>
      <div className="dailyLine">{dailyDisplay}</div>

      <div className="toolbar">
        <div className="modeBar">
          <button
            type="button"
            className={`modeBtn ${mode === 'all' ? 'active' : ''}`}
            onClick={() => handleModeChange('all')}
          >
            Tất cả
          </button>
          <button
            type="button"
            className={`modeBtn ${mode === 'unlearned' ? 'active' : ''}`}
            onClick={() => handleModeChange('unlearned')}
          >
            Chưa thuộc
          </button>
          <button
            type="button"
            className={`modeBtn ${mode === 'learned' ? 'active' : ''}`}
            onClick={() => handleModeChange('learned')}
          >
            Đã thuộc
          </button>
        </div>
        <input
          className="searchBox"
          value={quickSearch}
          onChange={(e) => handleQuickSearch(e.target.value)}
          placeholder="🔎 Tìm nhanh & nhảy tới thẻ..."
        />
        <button type="button" className="ghost" onClick={handleShuffle} title="Trộn ngẫu nhiên">
          🔀 Trộn
        </button>
        <button type="button" className="ghost" onClick={openQuiz} title="Trắc nghiệm nhanh">
          📝 Trắc nghiệm
        </button>

        <div className="typeChips">
          <button
            type="button"
            className={`chip ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => handleTypeChange('all')}
          >
            Tất cả <span className="chipN">{typeCounts.baseLen}</span>
          </button>
          {POS_LIST.map(([k, label]) => {
            const n = typeCounts.counts[k] || 0;
            if (!n && typeFilter !== k) return null;
            return (
              <button
                key={k}
                type="button"
                className={`chip ${typeFilter === k ? 'active' : ''}`}
                onClick={() => handleTypeChange(k)}
              >
                {label} <span className="chipN">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={flashcardRef}
        className={`card ${flipped ? 'flipped' : ''}`}
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
        <span className="cardCount">{view.length ? `${safeIndex + 1} / ${view.length}` : ''}</span>
        {currentCard && (
          <div className="cardTools">
            {supportsSpeech && (
              <button
                type="button"
                className={isSpeaking ? 'speaking' : ''}
                onClick={(e) => {
                  e.stopPropagation();
                  speakCurrent();
                }}
                title="Phát âm (R) · Shift+R đọc chậm"
                aria-label="Phát âm"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(currentCard);
              }}
              title="Sửa từ và nghĩa"
              aria-label="Sửa từ và nghĩa"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
          </div>
        )}

        <div className="inner">
          <div className="face">
            <div className="label">ENGLISH</div>
            <div className="word">
              {currentCard
                ? capFirst(currentCard.word)
                : typeFilter !== 'all' && cards.length
                  ? 'Không có thẻ nào thuộc loại từ này'
                  : mode === 'learned'
                    ? 'Chưa có thẻ đã thuộc'
                    : mode === 'unlearned'
                      ? 'Bạn đã thuộc hết rồi 🎉'
                      : 'Chưa có flashcard'}
            </div>
            {currentCard && (
              <>
                <div className="posBadge">
                  {detectPOS(currentCard)
                    .filter((t) => t !== 'other')
                    .map((t) => (
                      <span key={t} className="posTag">
                        {POS_SHORT[t]}
                      </span>
                    ))}
                </div>
                {currentCard.meanings[0]?.phonetic && (
                  <div className="phonTag">{currentCard.meanings[0].phonetic}</div>
                )}
              </>
            )}
            <div className="hint">👆 Bấm vào thẻ để xem nghĩa</div>
          </div>

          <div className="face back">
            <div className="label">TIẾNG VIỆT</div>
            <div className="meaningList">
              {currentCard?.meanings.map((m, idx) => (
                <div key={idx} className="meaningItem">
                  {capFirst(m.text)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="controls">
        <button type="button" className="soft" onClick={previousCard}>
          ← Trước
        </button>
        <button type="button" className="danger" onClick={() => mark(false)}>
          ✗ Chưa thuộc <kbd style={{ marginLeft: 4 }}>C</kbd>
        </button>
        <button type="button" className="success" onClick={() => mark(true)}>
          ✓ Đã thuộc <kbd style={{ marginLeft: 4 }}>V</kbd>
        </button>
        <button type="button" className="soft" onClick={nextCard}>
          Tiếp →
        </button>
      </div>

      <div className="statusRow">
        <span className={`dot ${currentCard?.learned ? 'ok' : ''}`} />
        <span>
          {currentCard ? (currentCard.learned ? '✓ Đã thuộc' : '✗ Chưa thuộc') : 'Không có thẻ'}
        </span>
      </div>
      <div className="progress">
        <div className="progressBar" style={{ width: `${stats.pct}%` }} />
      </div>
      <div className="kbdHint">
        Phím tắt: <kbd>←</kbd> <kbd>→</kbd> chuyển thẻ · <kbd>Space</kbd> lật thẻ · <kbd>C</kbd>{' '}
        chưa thuộc · <kbd>V</kbd> đã thuộc · <kbd>R</kbd> đọc loa · <kbd>Shift</kbd>+<kbd>R</kbd>{' '}
        đọc chậm · <kbd>A</kbd> tự đọc · vuốt thẻ để chuyển
      </div>

      <div className="bottomGrid">
        <div className="bottom">
          <div>
            <b>📋 Quản lý</b>
            <div className="note">Xem, sửa, gộp hoặc xoá flashcard.</div>
          </div>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setReviewMode('all');
              setReviewSearch('');
              setActiveModal('review');
            }}
          >
            Mở
          </button>
        </div>
        <div className="bottom">
          <div>
            <b>📝 Trắc nghiệm</b>
            <div className="note">Kiểm tra nhanh 10 từ ngẫu nhiên.</div>
          </div>
          <button type="button" className="primary" onClick={openQuiz}>
            Bắt đầu
          </button>
        </div>
        <div className="bottom">
          <div>
            <b>🗂 Theo từ loại</b>
            <div className="note">Xem từ vựng chia theo danh từ, động từ, tính từ...</div>
          </div>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setCatFilter('all');
              setCatSearch('');
              setActiveModal('cat');
            }}
          >
            Mở
          </button>
        </div>
        <div className="bottom">
          <div>
            <b>📚 Động từ bất quy tắc</b>
            <div className="note">Bảng 360 động từ V1 / V2 / V3.</div>
          </div>
          <button type="button" className="primary" onClick={() => setActiveModal('irr')}>
            Mở
          </button>
        </div>
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
              ×
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
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            <div className="formBtns" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="ghost small"
                onClick={() => setMeaningInputs((prev) => [...prev, ''])}
              >
                + Thêm nghĩa
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
              ×
            </button>
            <h2>📋 Quản lý Flashcard</h2>
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
                ✓ Đã thuộc ({stats.learned})
              </button>
              <button
                type="button"
                className={`tab ${reviewMode === 'unlearned' ? 'active' : ''}`}
                onClick={() => setReviewMode('unlearned')}
              >
                ✗ Chưa thuộc ({stats.remain})
              </button>
            </div>
            <input
              value={reviewSearch}
              onChange={(e) => setReviewSearch(e.target.value)}
              placeholder="🔎 Tìm từ tiếng Anh hoặc nghĩa..."
            />
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
                                    fontSize: 14,
                                    marginLeft: 6,
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
                            onClick={() => speak(c.word)}
                            title="Phát âm"
                          >
                            🔊 <span>Nghe</span>
                          </button>
                          <button
                            type="button"
                            className={c.learned ? 'success' : 'soft'}
                            onClick={() => toggleLearnedInList(c)}
                            title={c.learned ? 'Đánh dấu chưa thuộc' : 'Đánh dấu đã thuộc'}
                          >
                            {c.learned ? '✓' : '✗'}
                          </button>
                          <button
                            type="button"
                            className="soft"
                            onClick={() => openEdit(c)}
                            title="Sửa"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => deleteCard(c)}
                            title="Xoá"
                          >
                            🗑
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
              ×
            </button>
            <h2>📝 Trắc nghiệm nhanh</h2>
            {quizState.i >= quizState.questions.length ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, fontWeight: 700, margin: '10px 0' }}>
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
                            onClick={() => speak(q.word)}
                            title="Phát âm"
                          >
                            🔊
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="note" style={{ marginTop: 12 }}>
                    🎉 Đúng hết, quá đỉnh!
                  </p>
                )}
                <div className="formBtns" style={{ justifyContent: 'center' }}>
                  {quizState.wrong.length > 0 && (
                    <button type="button" className="danger" onClick={markWrongUnlearned}>
                      ✗ Đánh dấu chưa thuộc
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
                        {supportsSpeech && (
                          <button
                            type="button"
                            className={`speakBtn ${isSpeaking ? 'speaking' : ''}`}
                            onClick={() => speak(q.card.word)}
                            title="Phát âm (R)"
                          >
                            🔊
                          </button>
                        )}
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
              ×
            </button>
            <h2>⇅ Sao lưu / phục hồi</h2>
            <p className="note" style={{ marginBottom: 14 }}>
              Tất cả tiến độ đã được tự động đồng bộ lên MongoDB cho tài khoản <b>{username}</b>.
              Bạn cũng có thể tải file JSON hoặc nhập file sao lưu cũ.
            </p>
            <div className="formBtns" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="soft" onClick={exportData}>
                ⬇ Tải xuống JSON
              </button>
              <button
                type="button"
                className="soft"
                disabled={importing}
                onClick={() => importFileRef.current?.click()}
              >
                {importing ? 'Đang nhập...' : '⬆ Phục hồi từ file'}
              </button>
              <button type="button" className="danger" onClick={resetProgress}>
                ↺ Đặt lại tiến độ học
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
              ×
            </button>
            <h2>🗂 Từ vựng theo từ loại</h2>
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
            <input
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              placeholder="🔎 Tìm trong danh sách..."
            />
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
                                  fontSize: 13,
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
                            onClick={() => speak(c.word)}
                            title="Phát âm"
                          >
                            🔊 <span>Nghe</span>
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

      <div className={`toast ${toastVisible ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
