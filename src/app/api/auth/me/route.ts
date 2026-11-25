import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { User } from '@/models/User';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    await connectDB();
    const user = await User.findById(session.userId)
      .select('username displayName daily')
      .lean();

    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: String(user._id),
        username: user.username,
        displayName: user.displayName?.trim() || user.username,
        daily: user.daily || { streak: 0, lastDate: '', todayCount: 0 },
      },
    });
  } catch (err) {
    console.error('Auth me error:', err);
    return NextResponse.json({ error: 'Lỗi kiểm tra phiên đăng nhập.' }, { status: 500 });
  }
}
