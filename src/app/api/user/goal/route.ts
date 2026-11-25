import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { User } from '@/models/User';

export async function PATCH(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    const body = await req.json();
    const dailyGoal = Math.max(5, Math.min(200, Math.round(Number(body?.dailyGoal) || 20)));

    await connectDB();
    await User.findByIdAndUpdate(session.userId, { $set: { dailyGoal } });

    return NextResponse.json({ dailyGoal });
  } catch (err) {
    console.error('PATCH /api/user/goal error:', err);
    return NextResponse.json({ error: 'Không thể lưu mục tiêu ngày.' }, { status: 500 });
  }
}
