// Local preview for /garbage. No Vercel needed: `node dev/server.mjs`, then open http://localhost:8766/dev/
// Serves the real page and service worker, stubs the API, and can send a real push to this browser.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import { view, reminder, todayInStockholm } from '../api/garbage/_schedule.js';
import { MAX_SUBSCRIPTIONS } from '../api/garbage/_subscriptions.js';
import middleware from '../middleware.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = path.join(ROOT, 'dev/.local');
const PORT = process.env.PORT || 8766;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

fs.mkdirSync(LOCAL, { recursive: true });
const vapidFile = path.join(LOCAL, 'vapid.json');
if (!fs.existsSync(vapidFile)) fs.writeFileSync(vapidFile, JSON.stringify(webpush.generateVAPIDKeys()));
const vapid = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));
webpush.setVapidDetails('mailto:dev@example.com', vapid.publicKey, vapid.privateKey);

const subsFile = path.join(LOCAL, 'subscriptions.json');
const readSubs = () => fs.existsSync(subsFile) ? JSON.parse(fs.readFileSync(subsFile, 'utf8')) : [];
const writeSubs = subs => fs.writeFileSync(subsFile, JSON.stringify(subs, null, 2));

const readBody = req => new Promise(resolve => {
  let data = '';
  req.on('data', chunk => data += chunk);
  req.on('end', () => resolve(data ? JSON.parse(data) : {}));
});
const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

// Forced states for the screens page: things the real browser decides (push support, an existing subscription).
const FORCE = {
  on: "showState(true); $('remind').hidden = false;",
  error: "showState(false); $('remind').hidden = false; $('status').textContent = 'Reminder limit reached. Remove an old device first.';",
  unsupported: "$('remind').hidden = true; $('status').textContent = 'Add this page to your Home Screen to turn on reminders.';",
};

const pinScheme = (html, scheme) => scheme ? html.replace('@media (prefers-color-scheme: dark)', scheme === 'dark' ? '@media all' : '@media not all') : html;

function servePage(res, query) {
  let html = fs.readFileSync(path.join(ROOT, 'garbage/index.html'), 'utf8');
  // An iframe can't change prefers-color-scheme, so pin the media query instead.
  html = pinScheme(html, query.get('scheme'));
  const force = FORCE[query.get('force')];
  if (force) html = html.replace('</body>', `<script>const t = setInterval(() => { ${force} }, 100); setTimeout(() => clearInterval(t), 3000);</script>\n</body>`);
  send(res, 200, html, 'text/html');
}

// The page fetches /api/garbage/next without parameters, so the simulated date comes from the page URL.
const simulatedToday = (req, query) => {
  const referer = req.headers.referer && new URL(req.headers.referer).searchParams.get('today');
  return query.get('today') || referer || todayInStockholm();
};

async function api(req, res, route, query) {
  if (route === 'next') return send(res, 200, view(simulatedToday(req, query)));
  if (route === 'login') return send(res, 401, { error: 'Wrong password' });
  if (route === 'subscribe' && req.method === 'GET') return send(res, 200, { publicKey: vapid.publicKey });
  if (route === 'subscribe') {
    const subscription = await readBody(req);
    const others = readSubs().filter(s => s.endpoint !== subscription.endpoint);
    if (others.length >= MAX_SUBSCRIPTIONS) return send(res, 409, { error: 'Reminder limit reached. Remove an old device first.' });
    writeSubs([...others, subscription]);
    return send(res, 200, { ok: true });
  }
  if (route === 'unsubscribe') {
    const { endpoint } = await readBody(req);
    writeSubs(readSubs().filter(s => s.endpoint !== endpoint));
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: 'Not stubbed' });
}

// POST /dev/push?today=2026-11-02 sends the reminder for that date to every subscription saved here.
async function push(res, query) {
  const message = reminder(query.get('today') || '2026-11-02') ?? { title: 'Put out the garbage', body: 'No pickup tomorrow on that date; sending sample text.' };
  const subs = readSubs();
  const results = await Promise.all(subs.map(s => webpush.sendNotification(s, JSON.stringify({ ...message, url: '/garbage/' }))
    .then(() => ({ ok: true }), err => ({ ok: false, status: err.statusCode, gone: err.statusCode === 404 || err.statusCode === 410, endpoint: s.endpoint }))));
  writeSubs(subs.filter((s, i) => !results[i].gone));
  send(res, 200, { message, subscriptions: subs.length, results });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname, searchParams: query } = url;
  try {
    if (pathname === '/garbage' || pathname === '/garbage/' || pathname === '/garbage/index.html') return servePage(res, query);
    if (pathname.startsWith('/api/garbage/')) return await api(req, res, pathname.split('/').pop(), query);
    if (pathname === '/dev/push' && req.method === 'POST') return await push(res, query);
    if (pathname === '/dev/reminder') return send(res, 200, reminder(query.get('today')) ?? {});
    if (pathname === '/dev/login') {
      const login = await middleware(new Request(`http://localhost:${PORT}/garbage/`));
      let html = await login.text();
      html = pinScheme(html, query.get('scheme'));
      return send(res, 200, html, 'text/html');
    }
    if (pathname === '/dev' || pathname === '/dev/') return send(res, 200, fs.readFileSync(path.join(ROOT, 'dev/screens.html')), 'text/html');
    const file = path.join(ROOT, pathname);
    if (pathname.startsWith('/garbage/') && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    }
    send(res, 404, 'Not found', 'text/plain');
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err) });
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}/dev/`));
