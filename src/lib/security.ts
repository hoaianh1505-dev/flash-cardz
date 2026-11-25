import { NextResponse } from 'next/server';

interface RateBucket {
  count: number;
  resetAt: number;
}

// Bounded in-memory rate-limit store (prevents memory exhaustion under IP flood)
const MAX_BUCKETS = 10_000;
const buckets = new Map<string, RateBucket>();

function pruneBuckets(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
  if (buckets.size >= MAX_BUCKETS) {
    const excess = buckets.size - Math.floor(MAX_BUCKETS * 0.75);
    let removed = 0;
    for (const k of buckets.keys()) {
      buckets.delete(k);
      if (++removed >= excess) break;
    }
  }
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || '127.0.0.1';
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true; remaining: number } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  pruneBuckets(now);

  const cur = buckets.get(key);
  if (!cur || cur.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }

  if (cur.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
  }

  cur.count += 1;
  return { ok: true, remaining: limit - cur.count };
}

export function rateLimitResponse(retryAfterSec: number, message?: string) {
  return NextResponse.json(
    {
      error:
        message ||
        `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfterSec} giây.`,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSec) },
    }
  );
}

/** Strip control characters and enforce max length safely */
export function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/** Verify same-origin for mutating requests to mitigate CSRF */
export function isSameOriginRequest(req: Request): boolean {
  const host = req.headers.get('host');
  if (!host) return true;

  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      return originHost.toLowerCase() === host.toLowerCase();
    } catch {
      return false;
    }
  }

  const referer = req.headers.get('referer');
  if (referer) {
    try {
      const refHost = new URL(referer).host;
      return refHost.toLowerCase() === host.toLowerCase();
    } catch {
      return false;
    }
  }

  // Allow non-browser / same-site clients that omit Origin & Referer
  return true;
}
