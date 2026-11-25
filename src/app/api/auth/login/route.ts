import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { setSessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body?.username ?? '').trim();
    const password = String(body?.password ?? '');

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' },
        { status: 400 }
      );
    }

    await connectDB();

    const user = await User.findOne({ usernameLower: username.toLowerCase() });
    if (!user) {
      return NextResponse.json(
        { error: 'Sai tên đăng nhập hoặc mật khẩu.' },
        { status: 401 }
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: 'Sai tên đăng nhập hoặc mật khẩu.' },
        { status: 401 }
      );
    }

    const displayName = user.displayName?.trim() || user.username;

    await setSessionCookie({
      userId: String(user._id),
      username: user.username,
      displayName,
    });

    return NextResponse.json({
      user: {
        id: String(user._id),
        username: user.username,
        displayName,
        daily: user.daily,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Đăng nhập thất bại, vui lòng thử lại.' }, { status: 500 });
  }
}
