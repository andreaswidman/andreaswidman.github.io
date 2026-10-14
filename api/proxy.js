import feeds from '../feeds.json';

const ALLOWED_HOSTS = new Set(
  [...feeds.main, feeds.tcba].map(feedUrl => new URL(feedUrl).hostname)
);

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('Missing url parameter');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).send('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(403).send('Forbidden protocol');
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(403).send('Forbidden host');
  }

  try {
    const upstream = await fetch(url);
    const xml = await upstream.text();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      upstream.ok ? 'public, s-maxage=300, stale-while-revalidate=30' : 'no-store'
    );
    res.status(upstream.status).send(xml);
  } catch (err) {
    res.status(502).send('Upstream fetch failed');
  }
}
