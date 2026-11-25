import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { Flashcard } from '@/models/Flashcard';
import { detectPOS, keyOf, PosKey } from '@/lib/pos';

function sortKey(w: string): string {
  return String(w).trim().toLowerCase().replace(/^[^a-z0-9]+/i, '');
}

function firstLetter(w: string): string {
  const c = sortKey(w).charAt(0);
  return /[a-z]/i.test(c) ? c.toUpperCase() : '#';
}

export async function GET(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || 'all') as
      | 'all'
      | 'unlearned'
      | 'learned'
      | 'starred';
    const pos = (searchParams.get('pos') || 'all') as 'all' | PosKey;
    const letter = (searchParams.get('letter') || 'all').toUpperCase();
    const q = keyOf(searchParams.get('q') || '');
    const limit = Math.min(100, Math.max(10, Number(searchParams.get('limit')) || 50));
    const reqPage = Math.max(1, Number(searchParams.get('page')) || 1);

    await connectDB();
    const userId = new mongoose.Types.ObjectId(session.userId);

    const docs = await Flashcard.find({ userId })
      .select('word meanings learned starred note reviewCount wrongCount nextReviewAt')
      .lean();

    const allCards = docs.map((doc) => ({
      id: String(doc._id),
      word: doc.word,
      meanings: doc.meanings.map((m) => ({
        text: m.text,
        ...(m.type ? { type: m.type } : {}),
        ...(m.phonetic ? { phonetic: m.phonetic } : {}),
      })),
      learned: !!doc.learned,
      starred: !!doc.starred,
      note: doc.note || '',
      reviewCount: doc.reviewCount || 0,
      wrongCount: doc.wrongCount || 0,
      nextReviewAt: doc.nextReviewAt ? new Date(doc.nextReviewAt).toISOString() : null,
    }));

    // Overall status counts
    const statusCounts = {
      all: allCards.length,
      learned: allCards.filter((c) => c.learned).length,
      unlearned: allCards.filter((c) => !c.learned).length,
      starred: allCards.filter((c) => c.starred).length,
    };

    // 1. Filter by status
    const statusFiltered = allCards.filter((c) =>
      status === 'all'
        ? true
        : status === 'learned'
          ? c.learned
          : status === 'unlearned'
            ? !c.learned
            : c.starred
    );

    // Compute POS counts within current status
    const posCounts: Record<string, number> = {};
    statusFiltered.forEach((c) => {
      detectPOS(c).forEach((t) => {
        posCounts[t] = (posCounts[t] || 0) + 1;
      });
    });

    // 2. Filter by POS + search query
    const posAndSearchFiltered = statusFiltered.filter(
      (c) =>
        (pos === 'all' || detectPOS(c).includes(pos)) &&
        (!q || keyOf(c.word).includes(q) || c.meanings.some((m) => keyOf(m.text).includes(q)))
    );

    // Compute A-Z letter counts before letter filter
    const letterCounts: Record<string, number> = {};
    posAndSearchFiltered.forEach((c) => {
      const L = firstLetter(c.word);
      letterCounts[L] = (letterCounts[L] || 0) + 1;
    });

    // 3. Filter by starting letter (optional)
    const finalList =
      letter !== 'ALL'
        ? posAndSearchFiltered.filter((c) => firstLetter(c.word) === letter)
        : posAndSearchFiltered;

    finalList.sort((a, b) => sortKey(a.word).localeCompare(sortKey(b.word), 'en'));

    const total = finalList.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(reqPage, totalPages);
    const start = (page - 1) * limit;
    const items = finalList.slice(start, start + limit);

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      totalPages,
      statusBaseLen: statusFiltered.length,
      statusCounts,
      posCounts,
      letterCounts,
    });
  } catch (err) {
    console.error('GET /api/cards/list error:', err);
    return NextResponse.json({ error: 'Không thể lọc danh sách từ vựng.' }, { status: 500 });
  }
}
