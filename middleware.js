import { next } from '@vercel/functions';
import { hasValidSession } from './api/garbage/_session.js';

export const config = {
  runtime: 'nodejs',
  matcher: ['/garbage', '/garbage/', '/garbage/index.html', '/api/garbage/:path*'],
};

// Login takes the password, cron authenticates with CRON_SECRET instead.
const OPEN = new Set(['/api/garbage/login', '/api/garbage/cron']);

const LOGIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Garbage</title>
<style>
  body { font: 17px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 1rem; box-sizing: border-box; min-height: 100dvh; display: grid; place-items: center; background: #f7f7f5; color: #111; }
  form { display: grid; gap: 8px; }
  @media (prefers-color-scheme: dark) { body { background: #000; color: #f5f5f5; } button { background: #1c1c1e; color: #f5f5f7; } }
  input { font: inherit; padding: 6px 10px; }
  button { font: inherit; min-height: 44px; border: 0; border-radius: 999px; background: #ececea; color: #111; }
  p { color: #767676; margin: 8px 0 0; min-height: 1.4em; }
</style>
</head>
<body>
<form id="login">
  <input id="password" type="password" placeholder="Password" aria-label="Password" autocomplete="current-password" autofocus required>
  <button>Enter</button>
  <p id="error" role="alert"></p>
</form>
<script>
  document.getElementById('login').addEventListener('submit', async e => {
    e.preventDefault();
    const res = await fetch('/api/garbage/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('password').value }),
    });
    if (res.ok) location.reload();
    else document.getElementById('error').textContent = 'Wrong password';
  });
</script>
</body>
</html>`;

export default function middleware(request) {
  const { pathname } = new URL(request.url);
  if (OPEN.has(pathname) || hasValidSession(request.headers.get('cookie'))) return next();

  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (pathname.startsWith('/api/')) return new Response(null, { status: 401, headers });
  return new Response(LOGIN_PAGE, { status: 401, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}
