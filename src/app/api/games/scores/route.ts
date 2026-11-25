import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { GameScore } from '@/models/GameScore';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/security';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    await connectDB();
    const userId = new mongoose.Types.ObjectId(session.userId);

    const [bestDoc, recentDocs, topDocs] = await Promise.all([
      GameScore.findOne({ userId, game: 'plane-shooter' }).sort({ score: -1 }).lean(),
      GameScore.find({ userId, game: 'plane-shooter' }).sort({ createdAt: -1 }).limit(10).lean(),
      GameScore.find({ game: 'plane-shooter' })
        .sort({ score: -1, createdAt: -1 })
        .limit(10)
        .select('displayName subMode score wordsCleared maxCombo wave createdAt')
        .lean(),
    ]);

    return NextResponse.json({
      personalBest: bestDoc
        ? {
            score: bestDoc.score,
            wordsCleared: bestDoc.wordsCleared,
            maxCombo: bestDoc.maxCombo,
            wave: bestDoc.wave,
          }
        : null,
      recent: recentDocs.map((d) => ({
        id: String(d._id),
        subMode: d.subMode,
        score: d.score,
        wordsCleared: d.wordsCleared,
        maxCombo: d.maxCombo,
        wave: d.wave,
        durationSec: d.durationSec,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
      })),
      leaderboard: topDocs.map((d) => ({
        id: String(d._id),
        displayName: d.displayName,
        subMode: d.subMode,
        score: d.score,
        wordsCleared: d.wordsCleared,
        maxCombo: d.maxCombo,
        wave: d.wave,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
      })),
    });
  } catch (err) {
    console.error('GET /api/games/scores error:', err);
    return NextResponse.json({ error: 'Không thể tải điểm trò chơi.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`games:score:${ip}`, 30, 10 * 60_000);
    if (!rl.ok) {
      return rateLimitResponse(rl.retryAfterSec);
    }

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    const body = await req.json();
    const subMode = body?.subMode === 'typing' ? 'typing' : 'tap';
    const score = Math.max(0, Math.min(1_000_000, Math.round(Number(body?.score) || 0)));
    const wordsCleared = Math.max(0, Math.min(10_000, Math.round(Number(body?.wordsCleared) || 0)));
    const maxCombo = Math.max(0, Math.min(10_000, Math.round(Number(body?.maxCombo) || 0)));
    const wave = Math.max(1, Math.min(999, Math.round(Number(body?.wave) || 1)));
    const durationSec = Math.max(0, Math.min(86_400, Math.round(Number(body?.durationSec) || 0)));

    await connectDB();
    const userId = new mongoose.Types.ObjectId(session.userId);

    const prevBest = await GameScore.findOne({ userId, game: 'plane-shooter' })
      .sort({ score: -1 })
      .select('score')
      .lean();
    const isNewRecord = score > (prevBest?.score ?? 0);

    const created = await GameScore.create({
      userId,
      displayName: session.displayName || session.username,
      game: 'plane-shooter',
      subMode,
      score,
      wordsCleared,
      maxCombo,
      wave,
      durationSec,
    });

    return NextResponse.json(
      {
        id: String(created._id),
        isNewRecord,
        score: created.score,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/games/scores error:', err);
    return NextResponse.json({ error: 'Không thể lưu điểm trò chơi.' }, { status: 500 });
  }
}
