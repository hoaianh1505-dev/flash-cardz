import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { Flashcard } from '@/models/Flashcard';
import { setSessionCookie } from '@/lib/auth';
import defaultToeic from '@/data/default-toeic.json';

interface DefaultCardSeed {
  word: string;
  meanings: { text: string; type?: string; phonetic?: string }[];
  learned: boolean;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawUsername = String(body?.username ?? '').trim();
    const password = String(body?.password ?? '');

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
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Mật khẩu phải có ít nhất 6 ký tự.' },
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
    const user = await User.create({
      username: rawUsername,
      usernameLower,
      passwordHash,
      daily: { streak: 0, lastDate: '', todayCount: 0 },
    });

    // Provision the user's personal default deck from the 1000 basic TOEIC words PDF
    const seedCards = defaultToeic as DefaultCardSeed[];
    const docs = seedCards.map((c, idx) => ({
      userId: user._id,
      word: c.word,
      wordLower: c.word.toLowerCase(),
      meanings: c.meanings,
      learned: false,
      sortOrder: idx + 1,
    }));

    if (docs.length) {
      await Flashcard.insertMany(docs, { ordered: false });
    }

    await setSessionCookie({
      userId: String(user._id),
      username: user.username,
    });

    return NextResponse.json(
      {
        user: {
          id: String(user._id),
          username: user.username,
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
