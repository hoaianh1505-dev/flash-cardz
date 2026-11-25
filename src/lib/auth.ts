import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'flashcardx_token';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be configured with at least 16 characters in production.');
    }
    return new TextEncoder().encode('flashcardx-dev-fallback-secret-change-me');
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  username: string;
  displayName: string;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    username: payload.username,
    displayName: payload.displayName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ['HS256'],
    });
    if (typeof payload.userId === 'string' && typeof payload.username === 'string') {
      const displayName =
        typeof payload.displayName === 'string' && payload.displayName.trim()
          ? payload.displayName
          : payload.username;
      return { userId: payload.userId, username: payload.username, displayName };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export async function getSessionUser(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
