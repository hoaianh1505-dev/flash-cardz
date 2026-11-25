import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { Flashcard } from '@/models/Flashcard';
import { User } from '@/models/User';

function todayStr(): string {
  // Use Vietnam timezone (UTC+7) so daily streaks feel natural
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayDiff(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00Z`).getTime();
  const tb = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((tb - ta) / 86400000);
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID thẻ không hợp lệ.' }, { status: 400 });
    }

    const body = await req.json();
    await connectDB();

    const userId = new mongoose.Types.ObjectId(session.userId);
    const card = await Flashcard.findOne({ _id: id, userId });
    if (!card) {
      return NextResponse.json({ error: 'Không tìm thấy thẻ.' }, { status: 404 });
    }

    const wasLearned = card.learned;

    if (typeof body?.word === 'string') {
      const w = body.word.trim();
      if (!w) {
        return NextResponse.json({ error: 'Từ không được để trống.' }, { status: 400 });
      }
      card.word = w;
      card.wordLower = w.toLowerCase();
    }

    if (Array.isArray(body?.meanings)) {
      const meanings = body.meanings
        .map((m: { text?: unknown; type?: unknown; phonetic?: unknown }) => ({
          text: String(m?.text ?? '').trim(),
          type: String(m?.type ?? '').trim(),
          phonetic: String(m?.phonetic ?? '').trim(),
        }))
        .filter((m: { text: string }) => m.text.length > 0);
      if (!meanings.length) {
        return NextResponse.json({ error: 'Cần ít nhất một nghĩa.' }, { status: 400 });
      }
      card.meanings = meanings;
    }

    if (typeof body?.learned === 'boolean') {
      card.learned = body.learned;
    }

    await card.save();

    let daily = undefined;
    if (card.learned && !wasLearned) {
      const user = await User.findById(userId);
      if (user) {
        const t = todayStr();
        const d = user.daily || { streak: 0, lastDate: '', todayCount: 0 };
        if (d.lastDate !== t) {
          d.streak = d.lastDate && dayDiff(d.lastDate, t) === 1 ? (d.streak || 0) + 1 : 1;
          d.lastDate = t;
          d.todayCount = 0;
        }
        d.todayCount = (d.todayCount || 0) + 1;
        user.daily = d;
        user.markModified('daily');
        await user.save();
        daily = d;
      }
    }

    return NextResponse.json({
      card: {
        id: String(card._id),
        word: card.word,
        meanings: card.meanings.map((m) => ({
          text: m.text,
          ...(m.type ? { type: m.type } : {}),
          ...(m.phonetic ? { phonetic: m.phonetic } : {}),
        })),
        learned: !!card.learned,
      },
      ...(daily ? { daily } : {}),
    });
  } catch (err) {
    console.error('PATCH /api/cards/[id] error:', err);
    return NextResponse.json({ error: 'Không thể cập nhật thẻ.' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID thẻ không hợp lệ.' }, { status: 400 });
    }

    await connectDB();
    const userId = new mongoose.Types.ObjectId(session.userId);
    const deleted = await Flashcard.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      return NextResponse.json({ error: 'Không tìm thấy thẻ.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/cards/[id] error:', err);
    return NextResponse.json({ error: 'Không thể xoá thẻ.' }, { status: 500 });
  }
}
