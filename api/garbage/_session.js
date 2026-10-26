import crypto from 'crypto';

const COOKIE = 'garbage-session';
const MAX_AGE = 365 * 24 * 60 * 60; // seconds

// Signed with the password itself, so changing GARBAGE_PASSWORD logs every device out.
const sign = value => crypto.createHmac('sha256', process.env.GARBAGE_PASSWORD).update(value).digest('hex');

export function sessionCookie() {
  const expires = Date.now() + MAX_AGE * 1000;
  return `${COOKIE}=${expires}.${sign(String(expires))}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

// Takes the Cookie header string, so it works for both Node requests and Web Requests.
export function hasValidSession(cookieHeader) {
  if (!process.env.GARBAGE_PASSWORD) return false;
  const raw = (cookieHeader || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [expires, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  const expected = sign(expires);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
