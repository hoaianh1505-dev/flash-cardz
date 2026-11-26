import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { GameId, GameScore } from '@/models/GameScore';
import { checkRateLimit, getClientIp, rateLimitResponse, sanitizeText } from '@/lib/security';

const VALID_GAMES = new Set<GameId>(['plane-shooter', 'match-pairs', 'word-scramble']);

function parseGame(raw: unknown): GameId {
  return VALID_GAMES.has(raw as GameId) ? (raw as GameId) : 'plane-shooter';
}

export async function GET(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const game = parseGame(searchParams.get('game'));

    await connectDB();
    const userId = new mongoose.Types.ObjectId(session.userId);

    const [bestDoc, recentDocs, topDocs] = await Promise.all([
      GameScore.findOne({ userId, game }).sort({ score: -1 }).lean(),
      GameScore.find({ userId, game }).sort({ createdAt: -1 }).limit(10).lean(),
      GameScore.find({ game })
        .sort({ score: -1, createdAt: -1 })
        .limit(10)
        .select('displayName subMode score wordsCleared maxCombo wave durationSec createdAt')
        .lean(),
    ]);

    return NextResponse.json({
      game,
      personalBest: bestDoc
        ? {
            score: bestDoc.score,
            wordsCleared: bestDoc.wordsCleared,
            maxCombo: bestDoc.maxCombo,
            wave: bestDoc.wave,
            durationSec: bestDoc.durationSec,
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
        durationSec: d.durationSec,
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
    const rl = checkRateLimit(`games:score:${ip}`, 40, 10 * 60_000);
    if (!rl.ok) {
      return rateLimitResponse(rl.retryAfterSec);
    }

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    const body = await req.json();
    const game = parseGame(body?.game);
    const subMode = sanitizeText(body?.subMode || 'default', 24) || 'default';
    const score = Math.max(0, Math.min(1_000_000, Math.round(Number(body?.score) || 0)));
    const wordsCleared = Math.max(0, Math.min(10_000, Math.round(Number(body?.wordsCleared) || 0)));
    const maxCombo = Math.max(0, Math.min(10_000, Math.round(Number(body?.maxCombo) || 0)));
    const wave = Math.max(1, Math.min(999, Math.round(Number(body?.wave) || 1)));
    const durationSec = Math.max(0, Math.min(86_400, Math.round(Number(body?.durationSec) || 0)));

    await connectDB();
    const userId = new mongoose.Types.ObjectId(session.userId);

    const prevBest = await GameScore.findOne({ userId, game })
      .sort({ score: -1 })
      .select('score')
      .lean();
    const isNewRecord = score > (prevBest?.score ?? 0);

    const created = await GameScore.create({
      userId,
      displayName: session.displayName || session.username,
      game,
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
