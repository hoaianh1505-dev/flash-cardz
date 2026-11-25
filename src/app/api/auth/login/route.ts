import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { setSessionCookie } from '@/lib/auth';
import { checkRateLimit, getClientIp, rateLimitResponse, sanitizeText } from '@/lib/security';

// Dummy hash used to keep response timing consistent when username does not exist
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8uW7rY7o1Y5hJ1J8b4x5K5vX1K6W3.';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const ipLimit = checkRateLimit(`auth:login:ip:${ip}`, 15, 10 * 60_000);
    if (!ipLimit.ok) {
      return rateLimitResponse(
        ipLimit.retryAfterSec,
        `Quá nhiều lần thử đăng nhập. Vui lòng chờ ${ipLimit.retryAfterSec} giây.`
      );
    }

    const body = await req.json();
    const username = sanitizeText(body?.username, 32);
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' },
        { status: 400 }
      );
    }

    if (password.length > 128) {
      return NextResponse.json({ error: 'Mật khẩu không hợp lệ.' }, { status: 400 });
    }

    const pairLimit = checkRateLimit(
      `auth:login:pair:${ip}:${username.toLowerCase()}`,
      8,
      10 * 60_000
    );
    if (!pairLimit.ok) {
      return rateLimitResponse(
        pairLimit.retryAfterSec,
        `Tài khoản tạm khoá thử đăng nhập trong ${pairLimit.retryAfterSec} giây.`
      );
    }

    await connectDB();

    const user = await User.findOne({ usernameLower: username.toLowerCase() });
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
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
    return NextResponse.json(
      { error: 'Đăng nhập thất bại, vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
