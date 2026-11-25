import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit, getClientIp, isSameOriginRequest, rateLimitResponse } from '@/lib/security';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB hard cap

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/')) {
    // 1. CSRF same-origin protection on all state-changing API calls
    if (MUTATING_METHODS.has(req.method) && !isSameOriginRequest(req)) {
      return NextResponse.json(
        { error: 'Yêu cầu bị từ chối vì không hợp lệ nguồn gửi (CSRF protection).' },
        { status: 403 }
      );
    }

    // 2. Reject oversized payloads before body parsing
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'Dữ liệu gửi lên quá lớn (tối đa 4MB).' },
        { status: 413 }
      );
    }

    // 3. Global per-IP API rate ceiling (180 requests / minute)
    const ip = getClientIp(req);
    const rl = checkRateLimit(`api:global:${ip}`, 180, 60_000);
    if (!rl.ok) {
      return rateLimitResponse(rl.retryAfterSec);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
