import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, rateLimitResponse, sanitizeText } from '@/lib/security';

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`tts:${ip}`, 60, 60_000);
    if (!rl.ok) {
      return rateLimitResponse(rl.retryAfterSec);
    }

    const { searchParams } = new URL(req.url);
    const raw = sanitizeText(searchParams.get('q') || '', 160);
    const slow = searchParams.get('slow') === '1';

    if (!raw) {
      return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
    }

    const ttsUrl = new URL('https://translate.google.com/translate_tts');
    ttsUrl.searchParams.set('ie', 'UTF-8');
    ttsUrl.searchParams.set('client', 'tw-ob');
    ttsUrl.searchParams.set('tl', 'en');
    ttsUrl.searchParams.set('q', raw);
    if (slow) ttsUrl.searchParams.set('ttsspeed', '0.24');

    const upstream = await fetch(ttsUrl.toString(), {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Referer: 'https://translate.google.com/',
      },
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'TTS unavailable' }, { status: 502 });
    }

    const buffer = await upstream.arrayBuffer();
    if (!buffer.byteLength) {
      return NextResponse.json({ error: 'Empty TTS response' }, { status: 502 });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'TTS failed' }, { status: 500 });
  }
}
