import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { Flashcard } from '@/models/Flashcard';
import { User } from '@/models/User';

function serializeCard(doc: {
  _id: unknown;
  word: string;
  meanings: { text: string; type?: string; phonetic?: string }[];
  learned: boolean;
}) {
  return {
    id: String(doc._id),
    word: doc.word,
    meanings: doc.meanings.map((m) => ({
      text: m.text,
      ...(m.type ? { type: m.type } : {}),
      ...(m.phonetic ? { phonetic: m.phonetic } : {}),
    })),
    learned: !!doc.learned,
  };
}

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    await connectDB();
    const userId = new mongoose.Types.ObjectId(session.userId);

    const [docs, user] = await Promise.all([
      Flashcard.find({ userId })
        .sort({ sortOrder: 1, createdAt: -1 })
        .select('word meanings learned')
        .lean(),
      User.findById(userId).select('username daily').lean(),
    ]);

    return NextResponse.json({
      cards: docs.map(serializeCard),
      daily: user?.daily || { streak: 0, lastDate: '', todayCount: 0 },
    });
  } catch (err) {
    console.error('GET /api/cards error:', err);
    return NextResponse.json({ error: 'Không thể tải danh sách thẻ.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    const body = await req.json();
    const word = String(body?.word ?? '').trim();
    const rawMeanings = Array.isArray(body?.meanings) ? body.meanings : [];
    const meanings = rawMeanings
      .map((m: { text?: unknown; type?: unknown; phonetic?: unknown }) => ({
        text: String(m?.text ?? '').trim(),
        type: String(m?.type ?? '').trim(),
        phonetic: String(m?.phonetic ?? '').trim(),
      }))
      .filter((m: { text: string }) => m.text.length > 0);

    if (!word || !meanings.length) {
      return NextResponse.json(
        { error: 'Vui lòng nhập từ và ít nhất một nghĩa.' },
        { status: 400 }
      );
    }

    await connectDB();
    const userId = new mongoose.Types.ObjectId(session.userId);
    const wordLower = word.toLowerCase();

    // Merge into existing card if the same word already exists for this user
    const existing = await Flashcard.findOne({ userId, wordLower });
    if (existing) {
      let addedAny = false;
      for (const m of meanings) {
        const dup = existing.meanings.some(
          (em) => em.text.trim().toLowerCase() === m.text.toLowerCase()
        );
        if (!dup) {
          existing.meanings.push(m);
          addedAny = true;
        }
      }
      if (addedAny) {
        await existing.save();
      }
      return NextResponse.json({
        card: serializeCard(existing),
        merged: true,
        addedAny,
      });
    }

    // Place newly added card at the top (smallest sortOrder)
    const minCard = await Flashcard.findOne({ userId })
      .sort({ sortOrder: 1 })
      .select('sortOrder')
      .lean();
    const nextSortOrder = (minCard?.sortOrder ?? 1) - 1;

    const created = await Flashcard.create({
      userId,
      word,
      wordLower,
      meanings,
      learned: false,
      sortOrder: nextSortOrder,
    });

    return NextResponse.json(
      { card: serializeCard(created), merged: false, addedAny: true },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/cards error:', err);
    return NextResponse.json({ error: 'Không thể thêm thẻ.' }, { status: 500 });
  }
}
