// Web Crypto only, so this also runs in the middleware's edge runtime.
const COOKIE = 'garbage-session';
const MAX_AGE = 365 * 24 * 60 * 60; // seconds

const encoder = new TextEncoder();
const toHex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => Uint8Array.from(hex.match(/../g) ?? [], pair => parseInt(pair, 16));

// Signed with the password itself, so changing GARBAGE_PASSWORD logs every device out.
const hmacKey = () => crypto.subtle.importKey(
  'raw', encoder.encode(process.env.GARBAGE_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
);

export async function sessionCookie() {
  const expires = String(Date.now() + MAX_AGE * 1000);
  const signature = toHex(await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(expires)));
  return `${COOKIE}=${expires}.${signature}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

// Takes the Cookie header string, so it works for both Node requests and Web Requests.
export async function hasValidSession(cookieHeader) {
  if (!process.env.GARBAGE_PASSWORD) return false;
  const raw = (cookieHeader || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [expires, signature] = raw.slice(COOKIE.length + 1).split('.');
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  // verify() compares in constant time
  return crypto.subtle.verify('HMAC', await hmacKey(), fromHex(signature), encoder.encode(expires));
}
