import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { Flashcard } from '@/models/Flashcard';
import { setSessionCookie } from '@/lib/auth';
import { checkRateLimit, getClientIp, rateLimitResponse, sanitizeText } from '@/lib/security';
import defaultToeic from '@/data/default-toeic.json';

interface DefaultCardSeed {
  word: string;
  meanings: { text: string; type?: string; phonetic?: string }[];
  learned: boolean;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`auth:register:${ip}`, 5, 15 * 60_000);
    if (!rl.ok) {
      return rateLimitResponse(
        rl.retryAfterSec,
        `Bạn đã tạo quá nhiều tài khoản liên tiếp. Vui lòng thử lại sau ${rl.retryAfterSec} giây.`
      );
    }

    const body = await req.json();
    const rawUsername = sanitizeText(body?.username, 32);
    const rawDisplayName = sanitizeText(body?.displayName, 48);
    const password = typeof body?.password === 'string' ? body.password : '';

    if (rawUsername.length < 3 || rawUsername.length > 32) {
      return NextResponse.json(
        { error: 'Tên đăng nhập phải từ 3 đến 32 ký tự.' },
        { status: 400 }
      );
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(rawUsername)) {
      return NextResponse.json(
        { error: 'Tên đăng nhập chỉ gồm chữ cái, số và dấu . _ -' },
        { status: 400 }
      );
    }
    if (password.length < 6 || password.length > 128) {
      return NextResponse.json(
        { error: 'Mật khẩu phải từ 6 đến 128 ký tự.' },
        { status: 400 }
      );
    }

    await connectDB();

    const usernameLower = rawUsername.toLowerCase();
    const existing = await User.findOne({ usernameLower }).lean();
    if (existing) {
      return NextResponse.json(
        { error: 'Tên đăng nhập này đã được sử dụng.' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const displayName = rawDisplayName || rawUsername;
    const user = await User.create({
      username: rawUsername,
      usernameLower,
      displayName,
      passwordHash,
      daily: { streak: 0, lastDate: '', todayCount: 0 },
    });

    const seedCards = defaultToeic as DefaultCardSeed[];
    const docs = seedCards.map((c, idx) => ({
      userId: user._id,
      word: c.word,
      wordLower: c.word.toLowerCase(),
      meanings: c.meanings,
      learned: false,
      starred: false,
      note: '',
      sortOrder: idx + 1,
    }));

    if (docs.length) {
      await Flashcard.insertMany(docs, { ordered: false });
    }

    await setSessionCookie({
      userId: String(user._id),
      username: user.username,
      displayName,
    });

    return NextResponse.json(
      {
        user: {
          id: String(user._id),
          username: user.username,
          displayName,
          daily: user.daily,
        },
        seededCards: docs.length,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Đăng ký thất bại, vui lòng thử lại.' }, { status: 500 });
  }
}
