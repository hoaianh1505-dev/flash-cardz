import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { Flashcard } from '@/models/Flashcard';
import { checkRateLimit, getClientIp, rateLimitResponse, sanitizeText } from '@/lib/security';

const MAX_IMPORT_CARDS = 5000;

interface IncomingCard {
  word?: unknown;
  meaning?: unknown;
  meanings?: { text?: unknown; meaning?: unknown; type?: unknown; phonetic?: unknown }[];
  learned?: unknown;
  starred?: unknown;
  note?: unknown;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`cards:bulk:${ip}`, 10, 5 * 60_000);
    if (!rl.ok) {
      return rateLimitResponse(rl.retryAfterSec);
    }

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    const body = await req.json();
    const action = typeof body?.action === 'string' ? body.action : '';
    await connectDB();
    const userId = new mongoose.Types.ObjectId(session.userId);

    if (action === 'reset-progress') {
      await Flashcard.updateMany({ userId }, { $set: { learned: false } });
      return NextResponse.json({ ok: true });
    }

    if (action === 'mark-unlearned') {
      const ids = Array.isArray(body?.ids)
        ? body.ids
            .slice(0, 500)
            .filter((x: unknown) => typeof x === 'string' && mongoose.Types.ObjectId.isValid(x))
        : [];
      if (ids.length) {
        await Flashcard.updateMany(
          { userId, _id: { $in: ids.map((x: string) => new mongoose.Types.ObjectId(x)) } },
          { $set: { learned: false } }
        );
      }
      return NextResponse.json({ ok: true, count: ids.length });
    }

    if (action === 'import') {
      const incoming = body?.cards;
      if (!Array.isArray(incoming) || !incoming.length) {
        return NextResponse.json({ error: 'File JSON không có dữ liệu hợp lệ.' }, { status: 400 });
      }
      if (incoming.length > MAX_IMPORT_CARDS) {
        return NextResponse.json(
          { error: `Tối đa ${MAX_IMPORT_CARDS} thẻ trong một lần nhập.` },
          { status: 400 }
        );
      }

      const docs = (incoming as IncomingCard[])
        .map((c, idx) => {
          const word = sanitizeText(c?.word, 120);
          const note = sanitizeText(c?.note, 400);
          const meanings = Array.isArray(c?.meanings)
            ? c.meanings
                .slice(0, 12)
                .map((m) => ({
                  text: sanitizeText(m?.text ?? m?.meaning, 300),
                  type: sanitizeText(m?.type, 40),
                  phonetic: sanitizeText(m?.phonetic, 80),
                }))
                .filter((m) => m.text.length > 0)
            : c?.meaning
              ? [{ text: sanitizeText(c.meaning, 300), type: '', phonetic: '' }].filter(
                  (m) => m.text.length > 0
                )
              : [];
          return {
            userId,
            word,
            wordLower: word.toLowerCase(),
            meanings,
            learned: !!c?.learned,
            starred: !!c?.starred,
            note,
            sortOrder: idx + 1,
          };
        })
        .filter((d) => d.word && d.meanings.length);

      if (!docs.length) {
        return NextResponse.json({ error: 'Không tìm thấy thẻ hợp lệ trong file.' }, { status: 400 });
      }

      await Flashcard.deleteMany({ userId });
      const inserted = await Flashcard.insertMany(docs, { ordered: true });

      return NextResponse.json({
        ok: true,
        cards: inserted.map((doc) => ({
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
        })),
      });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/cards/bulk error:', err);
    return NextResponse.json({ error: 'Thao tác thất bại.' }, { status: 500 });
  }
}
