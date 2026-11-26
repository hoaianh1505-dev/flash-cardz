import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { StudySession } from '@/models/StudySession';
import { Flashcard } from '@/models/Flashcard';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    await connectDB();
    const userId = new mongoose.Types.ObjectId(session.userId);
    const docs = await StudySession.find({ userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    return NextResponse.json({
      sessions: docs.map((s) => ({
        id: String(s._id),
        mode: s.mode,
        score: s.score,
        total: s.total,
        accuracy: s.accuracy,
        durationSec: s.durationSec || 0,
        missedWords: s.missedWords || [],
        createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
      })),
    });
  } catch (err) {
    console.error('GET /api/sessions error:', err);
    return NextResponse.json({ error: 'Không thể tải lịch sử luyện tập.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    const body = await req.json();
    const mode =
      body?.mode === 'quiz' ? 'quiz' : body?.mode === 'speaking' ? 'speaking' : 'dictation';
    const total = Math.max(1, Number(body?.total) || 1);
    const score = Math.max(0, Math.min(total, Number(body?.score) || 0));
    const accuracy = Math.round((score / total) * 100);
    const durationSec = Math.max(0, Math.round(Number(body?.durationSec) || 0));
    const missedWords = Array.isArray(body?.missedWords)
      ? body.missedWords.map((w: unknown) => String(w).trim()).filter(Boolean).slice(0, 50)
      : [];
    const missedIds = Array.isArray(body?.missedIds)
      ? body.missedIds.filter((id: unknown) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id))
      : [];

    await connectDB();
    const userId = new mongoose.Types.ObjectId(session.userId);

    const created = await StudySession.create({
      userId,
      mode,
      score,
      total,
      accuracy,
      durationSec,
      missedWords,
    });

    if (missedIds.length) {
      await Flashcard.updateMany(
        { _id: { $in: missedIds }, userId },
        { $inc: { wrongCount: 1 }, $set: { nextReviewAt: new Date() } }
      );
    }

    return NextResponse.json(
      {
        session: {
          id: String(created._id),
          mode: created.mode,
          score: created.score,
          total: created.total,
          accuracy: created.accuracy,
          durationSec: created.durationSec,
          missedWords: created.missedWords,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/sessions error:', err);
    return NextResponse.json({ error: 'Không thể lưu phiên luyện tập.' }, { status: 500 });
  }
}
