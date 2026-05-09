import crypto from 'crypto';

const TARGET_BLOG = 'thiscouldbeawesome.tumblr.com';

function enc(s) {
  return encodeURIComponent(String(s));
}

function oauthSign(method, url, oauthParams, bodyParams, consumerSecret, tokenSecret) {
  const allParams = { ...oauthParams, ...bodyParams };
  const sorted = Object.entries(allParams).sort(([a], [b]) => a.localeCompare(b));
  const paramStr = sorted.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  const base = `${method}&${enc(url)}&${enc(paramStr)}`;
  const key = `${enc(consumerSecret)}&${enc(tokenSecret)}`;
  return crypto.createHmac('sha1', key).update(base).digest('base64');
}

function buildAuthHeader(method, url, bodyParams, consumerKey, consumerSecret, accessToken, accessTokenSecret) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };
  oauthParams.oauth_signature = oauthSign(method, url, oauthParams, bodyParams, consumerSecret, accessTokenSecret);
  const headerParts = Object.entries(oauthParams).map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(', ');
  return `OAuth ${headerParts}`;
}

export default async function handler(req, res) {
  const secret = req.headers['x-reblog-secret'];
  if (!secret || secret !== process.env.REBLOG_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { postUrl } = req.query;
  if (!postUrl) return res.status(400).json({ error: 'Missing postUrl' });

  let parsed;
  try { parsed = new URL(postUrl); } catch { return res.status(400).json({ error: 'Invalid postUrl' }); }

  // Extract post ID from path: /post/{id}/...
  const match = parsed.pathname.match(/^\/post\/(\d+)/);
  if (!match) return res.status(400).json({ error: 'Could not parse post ID from URL' });

  const blog = parsed.hostname;
  const postId = match[1];

  const consumerKey = process.env.TUMBLR_CONSUMER_KEY;
  const consumerSecret = process.env.TUMBLR_CONSUMER_SECRET;
  const accessToken = process.env.TUMBLR_ACCESS_TOKEN;
  const accessTokenSecret = process.env.TUMBLR_ACCESS_TOKEN_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return res.status(500).json({ error: 'Tumblr credentials not configured' });
  }

  // Step 1: fetch reblog_key via public API
  let reblogKey;
  try {
    const infoUrl = `https://api.tumblr.com/v2/blog/${blog}/posts?id=${postId}&api_key=${consumerKey}`;
    const infoRes = await fetch(infoUrl);
    const infoJson = await infoRes.json();
    reblogKey = infoJson?.response?.posts?.[0]?.reblog_key;
    if (!reblogKey) return res.status(502).json({ error: 'Could not retrieve reblog key' });
  } catch {
    return res.status(502).json({ error: 'Failed to fetch post info from Tumblr' });
  }

  // Step 2: reblog with OAuth
  const reblogUrl = `https://api.tumblr.com/v2/blog/${TARGET_BLOG}/post/reblog`;
  const bodyParams = { id: postId, reblog_key: reblogKey };
  const authHeader = buildAuthHeader('POST', reblogUrl, bodyParams, consumerKey, consumerSecret, accessToken, accessTokenSecret);

  try {
    const reblogRes = await fetch(reblogUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(bodyParams).toString(),
    });
    const reblogJson = await reblogRes.json();
    if (!reblogRes.ok) {
      return res.status(reblogRes.status).json({ error: reblogJson?.meta?.msg || 'Tumblr reblog failed' });
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'Failed to post reblog to Tumblr' });
  }
}
