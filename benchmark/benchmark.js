#!/usr/bin/env node
'use strict';

// ============================================================
// BENCHMARK.JS — Ecom Competitive Benchmarking Tool
// Requires Node.js 22+ (built-in WebSocket)
// Usage: node benchmark.js <url1> [url2...] [--category <name>]
// ============================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');

// ============================================================
// CONSTANTS
// ============================================================

const CDP_PORT = 9222;
const BENCHMARK_DIR = __dirname;
const JSON_PATH = path.join(BENCHMARK_DIR, 'benchmark.json');
const LOG_PATH = path.join(BENCHMARK_DIR, 'benchmark.log');
const REPORT_PATH = path.join(BENCHMARK_DIR, 'report.html');
const COMPETITORS_DIR = path.join(BENCHMARK_DIR, 'competitors');

const VIEWPORTS = {
  desktop: { width: 1440, label: 'desktop' },
  mobile:  { width: 390,  label: 'mobile'  },
};

const NETWORK_IDLE_TIME    = 800;   // ms of quiet before declaring idle
const NETWORK_IDLE_TIMEOUT = 30000; // max ms to wait for network idle
const NAV_TIMEOUT          = 30000; // max ms for a navigation step

// ============================================================
// LOGGER
// ============================================================

function log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch {}
}

function logError(msg) {
  const line = '[' + new Date().toISOString() + '] ERROR: ' + msg;
  console.error(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch {}
}

// ============================================================
// CDP CLIENT
// ============================================================

class CDPClient {
  constructor() {
    this.ws        = null;
    this.msgId     = 1;
    this.pending   = new Map(); // id -> {resolve, reject, timer}
    this.listeners = new Map(); // event -> [handler]
  }

  connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      ws.addEventListener('open',    ()  => resolve());
      ws.addEventListener('error',   (e) => reject(new Error('WebSocket error: ' + (e.message || e))));
      ws.addEventListener('message', (e) => this._onMessage(e.data));
    });
  }

  _onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error('CDP: ' + msg.error.message));
        else           p.resolve(msg.result);
      }
    } else if (msg.method) {
      const handlers = [...(this.listeners.get(msg.method) || [])];
      handlers.forEach(h => { try { h(msg.params); } catch {} });
    }
  }

  send(method, params) {
    params = params || {};
    return new Promise((resolve, reject) => {
      const id  = this.msgId++;
      const msg = JSON.stringify({ id, method, params });
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.ws.send(msg); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
    return () => {
      const list = this.listeners.get(event);
      if (!list) return;
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  waitFor(event, timeout) {
    timeout = timeout || 30000;
    return new Promise((resolve, reject) => {
      let settled = false;
      let off;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; if (off) off(); reject(new Error('Timeout: ' + event)); }
      }, timeout);
      off = this.on(event, (params) => {
        if (!settled) { settled = true; clearTimeout(timer); off(); resolve(params); }
      });
    });
  }

  close() {
    try { if (this.ws) this.ws.close(); } catch {}
  }
}

// ============================================================
// CHROME UTILS
// ============================================================

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

function httpPut(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({ hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: 'PUT' }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function connectToChrome() {
  try {
    await httpGet('http://localhost:' + CDP_PORT + '/json/version');
  } catch {
    console.error('\nERROR: Cannot connect to Chrome.');
    console.error('Run `claude --chrome` first to launch Chrome with remote debugging enabled.\n');
    process.exit(1);
  }
}

async function createTab(url) {
  return httpPut('http://localhost:' + CDP_PORT + '/json/new?' + encodeURIComponent(url || 'about:blank'));
}

async function closeTab(tabId) {
  try { await httpGet('http://localhost:' + CDP_PORT + '/json/close/' + tabId); } catch {}
}

// ============================================================
// WAIT HELPERS
// ============================================================

async function enableDomains(cdp) {
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');
}

function waitForNetworkIdle(cdp, idleTime, timeout) {
  idleTime = idleTime || NETWORK_IDLE_TIME;
  timeout  = timeout  || NETWORK_IDLE_TIMEOUT;

  return new Promise((resolve) => {
    let pending     = 0;
    let idleTimer   = null;
    let globalTimer = null;
    let done        = false;
    const offs      = [];

    function finish() {
      if (done) return;
      done = true;
      offs.forEach(off => off());
      if (idleTimer)   clearTimeout(idleTimer);
      if (globalTimer) clearTimeout(globalTimer);
      resolve();
    }

    function resetIdleTimer() {
      if (done) return;
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      if (pending === 0) idleTimer = setTimeout(finish, idleTime);
    }

    offs.push(cdp.on('Network.requestWillBeSent', () => {
      if (done) return;
      pending++;
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    }));
    offs.push(cdp.on('Network.loadingFinished', () => {
      if (done) return;
      pending = Math.max(0, pending - 1);
      resetIdleTimer();
    }));
    offs.push(cdp.on('Network.loadingFailed', () => {
      if (done) return;
      pending = Math.max(0, pending - 1);
      resetIdleTimer();
    }));
    offs.push(cdp.on('Page.loadEventFired', () => {
      if (done) return;
      resetIdleTimer();
    }));

    globalTimer = setTimeout(finish, timeout);
    resetIdleTimer();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// SCREENSHOT UTILS
// ============================================================

async function captureFullPage(cdp, width) {
  // Initial viewport
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });

  await sleep(200);

  // Get full scroll height
  let fullHeight = 900;
  try {
    const metrics = await cdp.send('Page.getLayoutMetrics');
    fullHeight = Math.ceil(metrics.contentSize.height);
  } catch (e) {
    logError('getLayoutMetrics failed: ' + e.message);
  }
  fullHeight = Math.min(Math.max(fullHeight, 400), 25000);

  // Expand viewport to full height
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: fullHeight,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
  await sleep(150);

  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height: fullHeight, scale: 1 },
  });

  return result.data; // base64 PNG
}

async function saveScreenshot(b64, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
}

async function takeScreenshots(cdp, domain, date, pageName) {
  const screenshots = {};
  const relBase     = 'competitors/' + domain + '/' + date;
  const absBase     = path.join(COMPETITORS_DIR, domain, date);

  for (const [key, vp] of Object.entries(VIEWPORTS)) {
    const filename = pageName + '-' + vp.label + '.png';
    const relPath  = relBase + '/' + filename;
    const absPath  = path.join(absBase, filename);
    let attempt = 0;
    while (attempt < 2) {
      try {
        const b64 = await captureFullPage(cdp, vp.width);
        await saveScreenshot(b64, absPath);
        screenshots[key] = relPath;
        log('    Screenshot: ' + relPath);
        break;
      } catch (e) {
        attempt++;
        if (attempt >= 2) {
          logError('Screenshot failed (' + pageName + '/' + key + '): ' + e.message);
          screenshots[key] = null;
        } else {
          log('    Retrying screenshot ' + pageName + '/' + key);
          await sleep(1000);
        }
      }
    }
  }
  return screenshots;
}

// ============================================================
// METADATA EXTRACTION
// ============================================================

// Runs in browser via Runtime.evaluate — must be a self-contained IIFE string
const EXTRACT_BASE_JS = '(function() {' +
  'var getText = function(el) { return el ? el.innerText.trim().replace(/\\s+/g, " ").slice(0, 200) : null; };' +
  'var h1 = document.querySelector("h1");' +
  'var heroHeadline = getText(h1);' +
  'var ctaRx = /^(shop|buy|get|explore|view|discover|order|browse|find|start)/i;' +
  'var heroCta = null;' +
  'var buttons = document.querySelectorAll("button, a");' +
  'for (var i = 0; i < buttons.length; i++) {' +
  '  var t = getText(buttons[i]);' +
  '  if (t && ctaRx.test(t) && t.length < 60) { heroCta = t; break; }' +
  '}' +
  'var promoSels = ["[class*=\\"announcement\\"]","[class*=\\"banner\\"]","[class*=\\"promo\\"]","[class*=\\"notice\\"]","[class*=\\"alert\\"]","marquee","[class*=\\"sale\\"]"];' +
  'var promos = [];' +
  'for (var si = 0; si < promoSels.length; si++) {' +
  '  var els = document.querySelectorAll(promoSels[si]);' +
  '  for (var ei = 0; ei < els.length; ei++) {' +
  '    var pt = getText(els[ei]);' +
  '    if (pt && pt.length > 3 && pt.length < 200 && promos.indexOf(pt) < 0) promos.push(pt);' +
  '  }' +
  '}' +
  'var navLinks = [];' +
  'var navEl = document.querySelector("nav, [role=\\"navigation\\"], header nav");' +
  'if (navEl) {' +
  '  var anchors = navEl.querySelectorAll("a");' +
  '  for (var ai = 0; ai < anchors.length && navLinks.length < 10; ai++) {' +
  '    var nt = getText(anchors[ai]);' +
  '    if (nt && nt.length > 1 && nt.length < 50) navLinks.push(nt);' +
  '  }' +
  '}' +
  'var trustRx = /free (shipping|returns|delivery)|secure|guarantee|trusted|verified|ssl|money.back|no risk/i;' +
  'var trusts = [];' +
  'var allEls = document.querySelectorAll("p, span, div, li");' +
  'for (var ti = 0; ti < allEls.length && trusts.length < 5; ti++) {' +
  '  var tt = getText(allEls[ti]);' +
  '  if (tt && trustRx.test(tt) && tt.length < 150 && trusts.indexOf(tt) < 0) trusts.push(tt);' +
  '}' +
  'var loadTime = null;' +
  'try { loadTime = Math.round((performance.timing.loadEventEnd - performance.timing.navigationStart) / 100) / 10; } catch(e) {}' +
  'return {' +
  '  hero_headline: heroHeadline,' +
  '  hero_cta: heroCta,' +
  '  active_promotions: promos.slice(0, 5),' +
  '  navigation_structure: navLinks,' +
  '  trust_signals: trusts,' +
  '  page_load_seconds: loadTime' +
  '};' +
  '})()';

const EXTRACT_PDP_JS = '(function() {' +
  'var h1 = document.querySelector("h1");' +
  'var productName = h1 ? h1.innerText.trim() : null;' +
  'var priceRx = /[\\$\\€\\£\\¥][\\d,]+\\.?\\d*/;' +
  'var priceDisplay = null;' +
  'var priceEls = document.querySelectorAll("[class*=\\"price\\"], [class*=\\"Price\\"], [data-price]");' +
  'for (var i = 0; i < priceEls.length; i++) {' +
  '  var t = priceEls[i].innerText.trim();' +
  '  if (priceRx.test(t) && t.length < 50) { priceDisplay = t; break; }' +
  '}' +
  'var reviewScore = null;' +
  'var ratingEls = document.querySelectorAll("[class*=\\"rating\\"], [class*=\\"review\\"], [class*=\\"star\\"]");' +
  'for (var ri = 0; ri < ratingEls.length; ri++) {' +
  '  var rt = ratingEls[ri].innerText.trim();' +
  '  if (/[0-9]+[.][0-9]/.test(rt) && rt.length < 30) { reviewScore = rt; break; }' +
  '}' +
  'var usps = [];' +
  'var uspEls = document.querySelectorAll("[class*=\\"feature\\"], [class*=\\"benefit\\"], [class*=\\"highlight\\"], [class*=\\"usp\\"]");' +
  'for (var ui = 0; ui < uspEls.length; ui++) {' +
  '  var items = uspEls[ui].querySelectorAll("li");' +
  '  for (var li = 0; li < items.length && usps.length < 6; li++) {' +
  '    var ut = items[li].innerText.trim();' +
  '    if (ut && ut.length > 2 && ut.length < 100) usps.push(ut);' +
  '  }' +
  '}' +
  'return { product_name: productName, price_display: priceDisplay, review_score: reviewScore, usp_callouts: usps };' +
  '})()';

const EXTRACT_CHECKOUT_JS = '(function() {' +
  'var bodyText = document.body.innerText.toLowerCase();' +
  'var stepEls = document.querySelectorAll("[class*=\\"step\\"], [class*=\\"Step\\"], ol > li, [class*=\\"breadcrumb\\"] li");' +
  'var stepsCount = (stepEls.length > 0 && stepEls.length < 10) ? stepEls.length : null;' +
  'var guestCheckout = /guest|continue without|skip (sign|log)|checkout as guest/.test(bodyText);' +
  'var payRx = /visa|mastercard|amex|paypal|apple pay|google pay|shop pay|klarna|afterpay/gi;' +
  'var payMatches = bodyText.match(payRx) || [];' +
  'var paySet = {};' +
  'var paymentMethods = [];' +
  'for (var pi = 0; pi < payMatches.length; pi++) {' +
  '  var pm = payMatches[pi].toLowerCase();' +
  '  if (!paySet[pm]) { paySet[pm] = 1; paymentMethods.push(pm); }' +
  '  if (paymentMethods.length >= 8) break;' +
  '}' +
  'var frictionNotes = [];' +
  'var reqFields = document.querySelectorAll("[required], [aria-required=\\"true\\"]");' +
  'if (reqFields.length > 0) frictionNotes.push(reqFields.length + " required fields");' +
  'if (/sign in|log in|create account/.test(bodyText) && !guestCheckout) frictionNotes.push("Login wall detected");' +
  'return { steps_count: stepsCount, guest_checkout_available: guestCheckout, payment_methods_visible: paymentMethods, friction_notes: frictionNotes };' +
  '})()';

async function extractMetadata(cdp, pageType) {
  let base = {};
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: EXTRACT_BASE_JS, returnByValue: true, awaitPromise: false });
    base = (r && r.result && r.result.value) || {};
  } catch (e) { logError('Base metadata failed: ' + e.message); }

  if (pageType === 'pdp') {
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: EXTRACT_PDP_JS, returnByValue: true, awaitPromise: false });
      const extra = (r && r.result && r.result.value) || {};
      Object.assign(base, extra);
    } catch (e) { logError('PDP metadata failed: ' + e.message); }
  }

  if (pageType === 'checkout') {
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: EXTRACT_CHECKOUT_JS, returnByValue: true, awaitPromise: false });
      const extra = (r && r.result && r.result.value) || {};
      Object.assign(base, extra);
    } catch (e) { logError('Checkout metadata failed: ' + e.message); }
  }

  return base;
}

// ============================================================
// NAVIGATION UTILS
// ============================================================

async function evaluate(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  return r && r.result && r.result.value;
}

async function clickElement(cdp, finderExpr) {
  // finderExpr should evaluate to an Element or null
  const expr = '(function() { var el = (' + finderExpr + '); if (!el) return false; el.scrollIntoView({block:"center",behavior:"instant"}); el.click(); return true; })()';
  return evaluate(cdp, expr);
}

async function getCurrentUrl(cdp) {
  return evaluate(cdp, 'window.location.href') || '';
}

// ============================================================
// OVERLAY HANDLERS (cookies + region)
// ============================================================

async function dismissCookieBanner(cdp) {
  const expr = `(function() {
    var selectors = [
      '#onetrust-accept-btn-handler',
      '#accept-all-cookies',
      '.cc-accept',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '.js-accept-cookies',
      '[data-testid*="accept-all"]',
      '[data-testid*="cookie-accept"]',
      '[class*="cookie"] button[class*="accept"]',
      '[class*="cookie"] button[class*="allow"]',
      '[id*="cookie"] button[class*="accept"]',
      '[class*="consent"] button[class*="accept"]',
      '[class*="consent"] button[class*="allow"]',
      '[class*="gdpr"] button[class*="accept"]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.offsetParent !== null) { el.click(); return 'selector:' + selectors[i]; }
    }
    var rx = /^(accept all|accept cookies|allow all|allow cookies|i accept|i agree|agree|got it|ok|yes, i agree|consent|alle akzeptieren|accepter tout|aceptar todo)/i;
    var buttons = document.querySelectorAll('button, a[role="button"], [class*="cookie"] a, [class*="consent"] a, [class*="banner"] button');
    for (var j = 0; j < buttons.length; j++) {
      var b = buttons[j];
      var t = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim();
      if (rx.test(t) && b.offsetParent !== null) { b.click(); return 'text:' + t; }
    }
    return null;
  })()`;
  try {
    const result = await evaluate(cdp, expr);
    if (result) { log('    Cookie banner dismissed (' + result + ')'); await sleep(300); }
  } catch {}
}

async function handleRegionSelector(cdp) {
  const expr = `(function() {
    var usRx = /^(united states|usa|u\\.s\\.a\\.|us)$/i;
    // 1. Direct link or button labelled "United States"
    var els = document.querySelectorAll('a, button, [role="option"], li, [class*="country"] *, [class*="region"] *, [class*="locale"] *, [class*="market"] *');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var t = (el.innerText || el.textContent || '').trim();
      if (usRx.test(t) && el.offsetParent !== null) { el.click(); return 'link:' + t; }
    }
    // 2. <select> containing a US option
    var selects = document.querySelectorAll('select');
    for (var si = 0; si < selects.length; si++) {
      var sel = selects[si];
      for (var oi = 0; oi < sel.options.length; oi++) {
        var opt = sel.options[oi];
        if (usRx.test(opt.text.trim()) || opt.value === 'US' || opt.value === 'en-us' || opt.value === 'en_US') {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return 'select:' + opt.text;
        }
      }
    }
    return null;
  })()`;
  try {
    const result = await evaluate(cdp, expr);
    if (result) {
      log('    Region selector handled (' + result + ')');
      await sleep(800);
      // Try to confirm/submit the selection if a confirm button appears
      const confirmExpr = `(function() {
        var rx = /^(confirm|continue|save|go|apply|shop|submit|ok)/i;
        var btns = document.querySelectorAll('button, [role="button"], input[type="submit"], a[class*="confirm"], a[class*="continue"]');
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          var t = (b.innerText || b.value || '').trim();
          if (rx.test(t) && b.offsetParent !== null) { b.click(); return t; }
        }
        return null;
      })()`;
      try {
        const confirmed = await evaluate(cdp, confirmExpr);
        if (confirmed) { log('    Region confirmed (' + confirmed + ')'); await sleep(1000); }
      } catch {}
    }
  } catch {}
}

async function handleOverlays(cdp) {
  await dismissCookieBanner(cdp);
  await handleRegionSelector(cdp);
}

// ============================================================
// URL CLASSIFICATION + GROUPING
// ============================================================

function groupUrlsByDomain(urls) {
  const groups = {};
  for (const url of urls) {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(url);
    } catch { logError('Invalid URL: ' + url); }
  }
  return groups;
}

// ============================================================
// CRAWL FLOW
// ============================================================

async function crawlUrls(urlList, category, date, cdp) {
  // urlList: [{ url, type }] for a single domain
  const domain = new URL(urlList[0].url).hostname.replace(/^www\./, '');
  log('\nCrawling: ' + domain + ' [' + category + ']');

  const pages = [];
  let firstPage = true;

  for (const { url, type } of urlList) {
    log('  [' + type + '] ' + url);
    const result = {
      page: type,
      url_visited: url,
      captured_at: new Date().toISOString(),
      status: 'unreachable',
      screenshots: {},
    };
    try {
      await cdp.send('Page.navigate', { url });
      await waitForNetworkIdle(cdp, NETWORK_IDLE_TIME, NAV_TIMEOUT);
      await sleep(300);
      if (firstPage) {
        await handleOverlays(cdp);
        await waitForNetworkIdle(cdp, NETWORK_IDLE_TIME, 10000);
        firstPage = false;
      } else {
        await dismissCookieBanner(cdp);
      }
      result.url_visited = await getCurrentUrl(cdp);
      Object.assign(result, await extractMetadata(cdp, type));
      result.status = 'captured';
      result.screenshots = await takeScreenshots(cdp, domain, date, type);
    } catch (e) { logError(type + ': ' + e.message); }
    pages.push(result);
  }

  return { domain, category, date, pages };
}

// ============================================================
// JSON MANAGEMENT
// ============================================================

function readBenchmarkJson() {
  if (!fs.existsSync(JSON_PATH)) return { last_updated: new Date().toISOString(), competitors: [] };
  try { return JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')); }
  catch { return { last_updated: new Date().toISOString(), competitors: [] }; }
}

function writeBenchmarkJson(data) {
  data.last_updated = new Date().toISOString();
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
}

function mergeResult(data, result) {
  const run = { date: result.date, pages: result.pages };
  const existing = data.competitors.find(c => c.domain === result.domain);
  if (existing) {
    existing.category = result.category;
    existing.runs = existing.runs.filter(r => r.date !== result.date);
    existing.runs.push(run);
  } else {
    data.competitors.unshift({ domain: result.domain, category: result.category, runs: [run] });
  }
}

// ============================================================
// CLI PROMPT
// ============================================================

function promptOverwrite(domain) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('\n  "' + domain + '" already exists. (O)verwrite or (S)kip? [o/s]: ', ans => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'o');
    });
  });
}

// ============================================================
// HTML REPORT GENERATOR
// ============================================================

// Default content written on first run only — never overwritten after that.
// Edit report.html, report.css, report-ui.js directly in your editor.
const DEFAULT_REPORT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ecom Benchmark Report</title>
  <link rel="stylesheet" href="report.css">
</head>
<body>

<div id="header">
  <div id="header-top">
    <h1 class="site-title">Ecom Benchmark</h1>
    <nav class="view-toggle">
      <button class="view-btn active" id="btn-gallery" onclick="switchView('gallery')">Gallery</button>
      <button class="view-btn" id="btn-strategy" onclick="switchView('strategy')">Strategy</button>
    </nav>
    <button id="export-btn" onclick="exportZip()">Export ZIP</button>
  </div>
  <div id="filters">
    <div class="filter-group">
      <span class="filter-label">Category</span>
      <div id="cat-pills" style="display:flex;gap:6px;flex-wrap:wrap"></div>
    </div>
    <div class="filter-group">
      <span class="filter-label">Competitor</span>
      <div class="comp-dropdown">
        <button id="comp-dropdown-btn" onclick="toggleCompDropdown()">
          Competitors (<span id="comp-count">0</span>) &#9660;
        </button>
        <div id="comp-dropdown-panel" class="hidden"></div>
      </div>
    </div>
    <div class="filter-group">
      <span class="filter-label">Page</span>
      <div id="page-toggles" style="display:flex;gap:4px"></div>
    </div>
  </div>
</div>

<div id="gallery-view"></div>

<div id="strategy-view" style="display:none">
  <div id="sort-row">
    Sort by:
    <select id="sort-select" onchange="renderStrategy()">
      <option value="date">Date Added</option>
      <option value="name">Name A–Z</option>
    </select>
  </div>
  <div class="strategy-grid" id="strategy-grid"></div>
</div>

<div id="lightbox" onclick="closeLB()">
  <span id="lb-close" onclick="closeLB()">&times;</span>
  <img id="lb-img" src="" alt="" onclick="event.stopPropagation()">
  <div id="lb-footer"></div>
</div>

<script src="data.js"></script>
<script src="report-ui.js"></script>
</body>
</html>
`;

const DEFAULT_REPORT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:             #f7f6f4;
  --surface:        #ffffff;
  --border:         #e8e6e3;
  --text-primary:   #111111;
  --text-secondary: #555555;
  --text-tertiary:  #999999;
  --header-bg:      #111111;
  --header-text:    #ffffff;
  --accent:         #111111;
  --load-fast:      #16a34a;
  --load-mid:       #d97706;
  --load-slow:      #dc2626;
}

body {
  font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ===================================================
   HEADER
=================================================== */
#header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--header-bg);
  color: var(--header-text);
  padding: 0 24px;
}

#header-top {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0;
  border-bottom: 1px solid #282828;
}

h1.site-title {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
  flex: 1;
  padding: 18px 0;
}

/* View toggle — underline tabs */
.view-toggle {
  display: flex;
  align-self: stretch;
}

.view-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0 18px;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
  align-self: stretch;
  display: flex;
  align-items: center;
}

.view-btn:hover { color: rgba(255, 255, 255, 0.8); }

.view-btn.active {
  color: #fff;
  border-bottom-color: #fff;
}

/* Export button — ghost style */
#export-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  padding: 6px 14px;
  border-radius: 3px;
  letter-spacing: 0.02em;
  transition: all 0.15s;
}

#export-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.55);
}

/* Filters bar */
#filters {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
  padding: 11px 0;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.35);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  white-space: nowrap;
}

/* Category pills */
.pill {
  padding: 4px 13px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 20px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-family: inherit;
  transition: all 0.15s;
}

.pill:hover {
  border-color: rgba(255, 255, 255, 0.45);
  color: rgba(255, 255, 255, 0.9);
}

.pill.active {
  background: #fff;
  color: #111;
  border-color: #fff;
}

/* Competitor dropdown */
.comp-dropdown { position: relative; }

#comp-dropdown-btn {
  padding: 4px 13px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 20px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-family: inherit;
  transition: all 0.15s;
}

#comp-dropdown-btn:hover {
  border-color: rgba(255, 255, 255, 0.45);
  color: rgba(255, 255, 255, 0.9);
}

#comp-dropdown-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  padding: 8px;
  z-index: 200;
  min-width: 210px;
  max-height: 300px;
  overflow-y: auto;
}

#comp-dropdown-panel.hidden { display: none; }

#comp-dropdown-panel .checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
}

#comp-dropdown-panel .checkbox-label:hover { background: var(--bg); }

/* Page toggles */
.page-toggle {
  padding: 3px 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  font-family: inherit;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  transition: all 0.15s;
}

.page-toggle.active {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.35);
  color: rgba(255, 255, 255, 0.9);
}

/* ===================================================
   GALLERY VIEW
=================================================== */
#gallery-view {
  padding: 24px;
  overflow-x: auto;
}

.gallery-grid {
  display: inline-grid;
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  min-width: 100%;
  border-radius: 4px;
  overflow: hidden;
}

.g-head-cell {
  background: var(--surface);
  padding: 12px;
  font-size: 13px;
}

.g-head-cell.row-label {
  background: #eeece9;
  display: flex;
  align-items: center;
}

.g-cell {
  background: var(--surface);
  padding: 10px;
  min-width: 180px;
  position: relative;
}

.comp-name {
  font-weight: 600;
  font-size: 13px;
  letter-spacing: -0.01em;
  display: block;
  margin-bottom: 4px;
}

.cat-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.badge-competition { background: #ffe4e4; color: #8b1a1a; }
.badge-inspiration  { background: #e4eeff; color: #1a3f8b; }
.badge-custom       { background: #ededeb; color: #555; }

.date-sel {
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 2px 6px;
  width: 100%;
  margin-top: 6px;
  background: var(--bg);
  color: var(--text-secondary);
  font-family: inherit;
}

.page-row-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* Per-column device tab */
.col-device-tabs {
  display: flex;
  margin-top: 8px;
}

.col-device-tab {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 7px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-tertiary);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.1s;
}

.col-device-tab:first-child { border-radius: 2px 0 0 2px; }
.col-device-tab:last-child  { border-radius: 0 2px 2px 0; border-left: none; }

.col-device-tab.active {
  background: var(--text-primary);
  color: #fff;
  border-color: var(--text-primary);
}

.shot-img {
  width: 100%;
  display: block;
  cursor: zoom-in;
  border-radius: 2px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--border);
  transition: box-shadow 0.15s;
}

.shot-img:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14);
  border-color: #c8c5c0;
}

.placeholder {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 16px 8px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
  min-height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ===================================================
   STRATEGY VIEW
=================================================== */
#strategy-view { padding: 24px; }

#sort-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

#sort-row select {
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  background: var(--surface);
  color: var(--text-primary);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}

.strategy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}

.s-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.s-card-head {
  padding: 14px 16px;
  background: var(--text-primary);
  color: #fff;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.s-domain {
  font-weight: 600;
  font-size: 15px;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

/* Adjust badge colors on dark card header */
.s-card-head .badge-competition { background: rgba(255, 100, 100, 0.18); color: #ffaaaa; }
.s-card-head .badge-inspiration  { background: rgba(100, 150, 255, 0.18); color: #aac4ff; }
.s-card-head .badge-custom       { background: rgba(255, 255, 255, 0.1);  color: rgba(255,255,255,0.6); }

.s-section {
  padding: 12px 16px;
  border-bottom: 1px solid #f2f0ee;
}

.s-section:last-child { border-bottom: none; }

.s-section-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-tertiary);
  margin-bottom: 10px;
}

.meta-row {
  display: flex;
  gap: 8px;
  margin-bottom: 5px;
  font-size: 13px;
  line-height: 1.4;
}

.meta-key {
  color: var(--text-tertiary);
  flex-shrink: 0;
  width: 130px;
  font-weight: 400;
}

.meta-val { color: var(--text-primary); font-weight: 500; }
.meta-empty { color: #d4d1cc; }

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
  margin-bottom: 4px;
}

.tag {
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 2px 9px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}

/* Load time pill */
.load-pill {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.load-fast { background: #dcfce7; color: var(--load-fast); }
.load-mid  { background: #fef3c7; color: var(--load-mid);  }
.load-slow { background: #fee2e2; color: var(--load-slow); }

.ext-link {
  font-size: 12px;
  color: var(--text-tertiary);
  text-decoration: none;
  border-bottom: 1px solid var(--border);
  padding-bottom: 1px;
  transition: color 0.12s;
}

.ext-link:hover { color: var(--text-primary); }

/* ===================================================
   LIGHTBOX
=================================================== */
#lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  z-index: 1000;
  display: none;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
  flex-direction: column;
}

#lightbox.open { display: flex; }

#lightbox img {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 2px;
  box-shadow: 0 8px 48px rgba(0, 0, 0, 0.5);
}

#lb-close {
  position: absolute;
  top: 18px;
  right: 24px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 28px;
  cursor: pointer;
  line-height: 1;
  transition: color 0.15s;
}

#lb-close:hover { color: #fff; }

#lb-footer {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: center;
  pointer-events: none;
  white-space: nowrap;
}
`;

const DEFAULT_REPORT_UI_JS = `'use strict';

// ============================================================
// STATE
// ============================================================

var activeView       = 'gallery';
var activeCategory   = 'all';
var activeCompetitors = {};
var activePages      = { homepage: true, plp: true, pdp: true, checkout: true };
var compDates        = {};
var compDevice       = {}; // per-column device: 'desktop' | 'mobile'

// ============================================================
// INIT
// ============================================================

(function () {
  DATA.competitors.forEach(function (c) {
    activeCompetitors[c.domain] = true;
    compDevice[c.domain] = 'desktop';
  });

  // Category pills
  var cats = ['all'];
  DATA.competitors.forEach(function (c) {
    var cat = c.category || 'uncategorized';
    if (cats.indexOf(cat) < 0) cats.push(cat);
  });
  var pillsEl = document.getElementById('cat-pills');
  cats.forEach(function (cat) {
    var btn = document.createElement('button');
    btn.className = 'pill' + (cat === 'all' ? ' active' : '');
    btn.textContent = cat === 'all' ? 'All' : (cat.charAt(0).toUpperCase() + cat.slice(1));
    btn.setAttribute('data-cat', cat);
    btn.onclick = function () { activeCategory = cat; syncPills(); applyFilters(); };
    pillsEl.appendChild(btn);
  });

  // Competitor dropdown
  var compPanel = document.getElementById('comp-dropdown-panel');
  DATA.competitors.forEach(function (c) {
    var label = document.createElement('label');
    label.className = 'checkbox-label';
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = true;
    cb.setAttribute('data-domain', c.domain);
    cb.onchange = function () {
      activeCompetitors[c.domain] = cb.checked;
      updateCompCount();
      applyFilters();
    };
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + c.domain));
    compPanel.appendChild(label);
  });
  updateCompCount();

  // Page toggles
  var pageEl = document.getElementById('page-toggles');
  ['homepage', 'plp', 'pdp', 'checkout'].forEach(function (page) {
    var btn = document.createElement('button');
    btn.className = 'page-toggle active';
    btn.textContent = page.charAt(0).toUpperCase() + page.slice(1);
    btn.setAttribute('data-page', page);
    btn.onclick = function () {
      activePages[page] = !activePages[page];
      btn.classList.toggle('active', activePages[page]);
      applyFilters();
    };
    pageEl.appendChild(btn);
  });

  applyFilters();
})();

// ============================================================
// FILTER HELPERS
// ============================================================

function syncPills() {
  document.querySelectorAll('#cat-pills .pill').forEach(function (p) {
    p.classList.toggle('active', p.getAttribute('data-cat') === activeCategory);
  });
}

function toggleCompDropdown() {
  document.getElementById('comp-dropdown-panel').classList.toggle('hidden');
}

document.addEventListener('click', function (e) {
  var btn   = document.getElementById('comp-dropdown-btn');
  var panel = document.getElementById('comp-dropdown-panel');
  if (!panel.contains(e.target) && e.target !== btn) panel.classList.add('hidden');
});

function updateCompCount() {
  var total   = Object.keys(activeCompetitors).length;
  var checked = Object.values(activeCompetitors).filter(Boolean).length;
  document.getElementById('comp-count').textContent = checked === total ? 'All' : checked + '/' + total;
}

function getFiltered() {
  return DATA.competitors.filter(function (c) {
    return (activeCategory === 'all' || c.category === activeCategory) && activeCompetitors[c.domain];
  });
}

function getActivePagesArr() {
  return ['homepage', 'plp', 'pdp', 'checkout'].filter(function (p) { return activePages[p]; });
}

function applyFilters() {
  if (activeView === 'gallery') renderGallery();
  else renderStrategy();
}

// ============================================================
// VIEW SWITCHING
// ============================================================

function switchView(view) {
  activeView = view;
  document.getElementById('gallery-view').style.display  = view === 'gallery'  ? '' : 'none';
  document.getElementById('strategy-view').style.display = view === 'strategy' ? '' : 'none';
  document.getElementById('btn-gallery').classList.toggle('active',  view === 'gallery');
  document.getElementById('btn-strategy').classList.toggle('active', view === 'strategy');
  applyFilters();
}

// ============================================================
// BADGE HELPERS
// ============================================================

function badgeClass(cat) {
  if (cat === 'competition') return 'cat-badge badge-competition';
  if (cat === 'inspiration') return 'cat-badge badge-inspiration';
  return 'cat-badge badge-custom';
}

function getSelectedRun(comp) {
  var runs = comp.runs || [];
  if (!runs.length) return null;
  var idx = compDates[comp.domain] !== undefined ? compDates[comp.domain] : runs.length - 1;
  return runs[Math.min(idx, runs.length - 1)];
}

// ============================================================
// GALLERY VIEW
// ============================================================

function setColDevice(domain, device) {
  compDevice[domain] = device;
  renderGallery();
}

function renderGallery() {
  var el    = document.getElementById('gallery-view');
  var comps = getFiltered();
  var pages = getActivePagesArr();

  if (!comps.length || !pages.length) {
    el.innerHTML = '<p style="padding:40px;color:#aaa;text-align:center">No data to display.</p>';
    return;
  }

  var cols = comps.length;
  var html = '<div class="gallery-grid" style="grid-template-columns: 140px repeat(' + cols + ', 220px)">';

  // Top-left corner
  html += '<div class="g-head-cell row-label"></div>';

  // Competitor column headers
  comps.forEach(function (comp) {
    var runs     = (comp.runs || []).slice().reverse();
    var opts     = runs.map(function (r, i) { return '<option value="' + i + '">' + r.date + '</option>'; }).join('');
    var catBadge = comp.category || 'uncategorized';
    var dev      = compDevice[comp.domain] || 'desktop';

    html += '<div class="g-head-cell">';
    html += '<span class="comp-name">' + comp.domain + '</span>';
    html += '<span class="' + badgeClass(catBadge) + '">' + catBadge + '</span>';

    // Per-column device tabs
    html += '<div class="col-device-tabs">';
    html += '<button class="col-device-tab' + (dev === 'desktop' ? ' active' : '') + '" onclick="setColDevice(\\'' + comp.domain + '\\',\\'desktop\\')">D</button>';
    html += '<button class="col-device-tab' + (dev === 'mobile'  ? ' active' : '') + '" onclick="setColDevice(\\'' + comp.domain + '\\',\\'mobile\\')">M</button>';
    html += '</div>';

    if (runs.length > 1) {
      html += '<select class="date-sel" data-domain="' + comp.domain + '" onchange="changeDate(this)">' + opts + '</select>';
    } else if (runs.length === 1) {
      html += '<span style="font-size:11px;color:#aaa;display:block;margin-top:4px">' + runs[0].date + '</span>';
    }
    html += '</div>';
  });

  // Page rows
  pages.forEach(function (page) {
    var pageLabel = page.charAt(0).toUpperCase() + page.slice(1);
    html += '<div class="g-head-cell row-label"><span class="page-row-label">' + pageLabel + '</span></div>';

    comps.forEach(function (comp) {
      var run = getSelectedRun(comp);
      var pd  = run ? (run.pages || []).find(function (p) { return p.page === page; }) : null;
      var dev = compDevice[comp.domain] || 'desktop';

      html += '<div class="g-cell">';
      if (!pd || pd.status === 'unreachable') {
        html += '<div class="placeholder">Unreachable</div>';
      } else {
        var src = pd.screenshots && pd.screenshots[dev];
        if (src) {
          html += '<img class="shot-img" src="' + src + '" loading="lazy" onclick="openLB(\\'' + src + '\\',\\'' + comp.domain + '\\',\\'' + page + '\\')" alt="' + page + ' ' + dev + '">';
        } else {
          html += '<div class="placeholder">No screenshot</div>';
        }
      }
      html += '</div>';
    });
  });

  html += '</div>';
  el.innerHTML = html;
}

function changeDate(sel) {
  compDates[sel.getAttribute('data-domain')] = parseInt(sel.value, 10);
  renderGallery();
}

// ============================================================
// STRATEGY VIEW
// ============================================================

var SECTION_ICONS = {
  'Value Prop': '◎',
  'Navigation': '→',
  'Promotions': '%',
  'PDP': '★',
  'Checkout': '✓',
  'Speed': '⚡',
  'Search': '⌕',
  'Product Page': '◫',
  'Personalization': '◈',
  'Traffic': '◉'
};

function sectionTitle(icon, label) {
  return '<div class="s-section-title">' + icon + '&nbsp; ' + label + '</div>';
}

function loadPill(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return '<span class="meta-empty">—</span>';
  var str = String(rawValue);
  var num = parseFloat(str);
  if (isNaN(num)) return '<span class="meta-val">' + str + '</span>';
  var cls = num < 1 ? 'load-fast' : num < 2 ? 'load-mid' : 'load-slow';
  return '<span class="load-pill ' + cls + '">' + str + '</span>';
}

function renderStrategy() {
  var grid    = document.getElementById('strategy-grid');
  var comps   = getFiltered().slice();
  var sortVal = document.getElementById('sort-select').value;

  if (sortVal === 'name') comps.sort(function (a, b) { return a.domain.localeCompare(b.domain); });
  if (!comps.length) { grid.innerHTML = '<p style="color:#aaa">No data to display.</p>'; return; }

  function val(v) {
    if (v === null || v === undefined || v === '') return '<span class="meta-empty">—</span>';
    if (Array.isArray(v) && !v.length) return '<span class="meta-empty">—</span>';
    if (Array.isArray(v)) return '<span class="meta-val">' + v.join(', ') + '</span>';
    return '<span class="meta-val">' + v + '</span>';
  }

  function tagList(arr) {
    if (!arr || !arr.length) return '<span class="meta-empty">—</span>';
    return '<div class="tag-list">' + arr.map(function (t) { return '<span class="tag">' + t + '</span>'; }).join('') + '</div>';
  }

  grid.innerHTML = comps.map(function (comp) {
    var run  = getSelectedRun(comp);
    var hp   = run && (run.pages || []).find(function (p) { return p.page === 'homepage'; });
    var pdp  = run && (run.pages || []).find(function (p) { return p.page === 'pdp'; });
    var co   = run && (run.pages || []).find(function (p) { return p.page === 'checkout'; });
    var cat  = comp.category || 'uncategorized';
    var ext  = comp.extended || {};
    var gco  = co && co.guest_checkout_available;
    var gcoStr = gco === true ? 'Yes' : gco === false ? 'No' : null;

    return '<div class="s-card">' +
      '<div class="s-card-head"><span class="s-domain">' + comp.domain + '</span><span class="' + badgeClass(cat) + '">' + cat + '</span></div>' +

      '<div class="s-section">' +
        sectionTitle('◎', 'Value Prop &amp; Messaging') +
        '<div class="meta-row"><span class="meta-key">Headline</span>' + val(hp && hp.hero_headline) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Primary CTA</span>' + val(hp && hp.hero_cta) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Trust signals</span></div>' + tagList(hp && hp.trust_signals) +
      '</div>' +

      '<div class="s-section">' +
        sectionTitle('→', 'Navigation') +
        tagList(hp && hp.navigation_structure) +
      '</div>' +

      '<div class="s-section">' +
        sectionTitle('%', 'Promotions') +
        tagList(hp && hp.active_promotions) +
      '</div>' +

      '<div class="s-section">' +
        sectionTitle('★', 'PDP Signals') +
        '<div class="meta-row"><span class="meta-key">Product name</span>' + val(pdp && pdp.product_name) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Price</span>' + val(pdp && pdp.price_display) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Review score</span>' + val(pdp && pdp.review_score) + '</div>' +
        '<div class="meta-row"><span class="meta-key">USP callouts</span></div>' + tagList(pdp && pdp.usp_callouts) +
      '</div>' +

      '<div class="s-section">' +
        sectionTitle('✓', 'Checkout Experience') +
        '<div class="meta-row"><span class="meta-key">Steps</span>' + val(co && co.steps_count) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Guest checkout</span>' + val(gcoStr) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Payment methods</span></div>' + tagList(co && co.payment_methods_visible) +
        '<div class="meta-row"><span class="meta-key">Friction notes</span></div>' + tagList(co && co.friction_notes) +
      '</div>' +

      '<div class="s-section">' +
        sectionTitle('⚡', 'Site Speed &amp; Core Web Vitals') +
        '<div class="meta-row"><span class="meta-key">LCP</span>' + loadPill(ext.lcp) + '</div>' +
        '<div class="meta-row"><span class="meta-key">INP</span>' + val(ext.inp) + '</div>' +
        '<div class="meta-row"><span class="meta-key">CLS</span>' + val(ext.cls) + '</div>' +
        '<div class="meta-row"><span class="meta-key">TTFB</span>' + loadPill(ext.ttfb) + '</div>' +
        '<div class="meta-row"><span class="meta-key">PageSpeed mobile</span>' + val(ext.pagespeed_mobile) + '</div>' +
      '</div>' +

      '<div class="s-section">' +
        sectionTitle('⌕', 'Navigation &amp; Search UX') +
        '<div class="meta-row"><span class="meta-key">Site search</span>' + val(ext.has_site_search) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Filter/facet</span>' + val(ext.filter_facet_support) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Mega menu</span>' + val(ext.mega_menu) + '</div>' +
      '</div>' +

      '<div class="s-section">' +
        sectionTitle('◫', 'Product Page Quality') +
        '<div class="meta-row"><span class="meta-key">Image carousel</span>' + val(ext.image_carousel) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Review system</span>' + val(ext.review_rating_system) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Copy depth</span>' + val(ext.copy_depth) + '</div>' +
      '</div>' +

      '<div class="s-section">' +
        sectionTitle('◈', 'Personalization Signals') +
        '<div class="meta-row"><span class="meta-key">Recommendations</span>' + val(ext.product_recommendations) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Recently viewed</span>' + val(ext.recently_viewed) + '</div>' +
      '</div>' +

      '<div class="s-section">' +
        sectionTitle('◉', 'Traffic &amp; Engagement') +
        '<div class="meta-row"><span class="meta-key">Traffic volume</span>' + val(ext.traffic_volume) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Bounce rate</span>' + val(ext.bounce_rate) + '</div>' +
        '<div class="meta-row"><span class="meta-key">Top keywords</span>' + val(ext.top_keywords) + '</div>' +
        '<div class="meta-row"><a href="https://www.similarweb.com/website/' + comp.domain + '/" target="_blank" class="ext-link">SimilarWeb &#8599;</a></div>' +
        '<div class="meta-row"><a href="https://www.semrush.com/analytics/overview/?q=' + comp.domain + '" target="_blank" class="ext-link">SEMrush &#8599;</a></div>' +
      '</div>' +

    '</div>';
  }).join('');
}

// ============================================================
// LIGHTBOX
// ============================================================

function openLB(src, domain, page) {
  document.getElementById('lb-img').src = src;
  var footer = document.getElementById('lb-footer');
  if (footer) {
    footer.textContent = (domain || '') + (page ? '  /  ' + page : '');
  }
  document.getElementById('lightbox').classList.add('open');
}

function closeLB() {
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lb-img').src = '';
  var footer = document.getElementById('lb-footer');
  if (footer) footer.textContent = '';
}

document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLB(); });

// ============================================================
// EXPORT ZIP
// ============================================================

function exportZip() {
  var btn = document.getElementById('export-btn');
  btn.textContent = 'Building…'; btn.disabled = true;

  var comps = getFiltered();
  var pages = getActivePagesArr();

  var exportData = {
    last_updated: DATA.last_updated,
    competitors: comps.map(function (c) {
      return {
        domain: c.domain,
        category: c.category,
        runs: c.runs.map(function (r) {
          return { date: r.date, pages: (r.pages || []).filter(function (p) { return pages.indexOf(p.page) >= 0; }) };
        })
      };
    })
  };

  var files = [{ name: 'benchmark.json', data: new TextEncoder().encode(JSON.stringify(exportData, null, 2)) }];
  var shots = [];

  comps.forEach(function (c) {
    c.runs.forEach(function (r) {
      (r.pages || []).forEach(function (p) {
        if (pages.indexOf(p.page) < 0) return;
        if (p.screenshots && p.screenshots.desktop) shots.push(p.screenshots.desktop);
        if (p.screenshots && p.screenshots.mobile)  shots.push(p.screenshots.mobile);
      });
    });
  });

  var fetches = shots.map(function (src) {
    return fetch(src)
      .then(function (r) { return r.ok ? r.arrayBuffer().then(function (b) { return { name: src, data: new Uint8Array(b) }; }) : null; })
      .catch(function () { return null; });
  });

  Promise.all(fetches).then(function (results) {
    results.forEach(function (r) { if (r) files.push(r); });
    var zip = buildZip(files);
    var ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    var blob = new Blob([zip], { type: 'application/zip' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'benchmark-' + ts + '.zip';
    a.click();
    URL.revokeObjectURL(a.href);
    btn.textContent = 'Export ZIP'; btn.disabled = false;
  }).catch(function (e) {
    alert('Export failed: ' + e.message);
    btn.textContent = 'Export ZIP'; btn.disabled = false;
  });
}

function buildZip(files) {
  var enc = new TextEncoder();
  var parts = []; var central = []; var offset = 0;

  files.forEach(function (f) {
    var nameBytes = enc.encode(f.name);
    var data = f.data;
    var crc  = crc32(data);
    var size = data.length;

    var local = new Uint8Array(30 + nameBytes.length);
    var dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true);   dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);          dv.setUint16(10, 0, true);   dv.setUint16(12, 0, true);
    dv.setUint32(14, crc, true);       dv.setUint32(18, size, true); dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true); dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    parts.push(local); parts.push(data);

    var cent = new Uint8Array(46 + nameBytes.length);
    var cv = new DataView(cent.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true);   cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);          cv.setUint16(10, 0, true);   cv.setUint16(12, 0, true);   cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);       cv.setUint32(20, size, true); cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);         cv.setUint16(36, 0, true);   cv.setUint32(38, 0, true);   cv.setUint32(42, offset, true);
    cent.set(nameBytes, 46); central.push(cent);
    offset += local.length + data.length;
  });

  var cd    = concat(central);
  var eocdr = new Uint8Array(22);
  var ev    = new DataView(eocdr.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true);  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cd.length, true);   ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
  return concat(parts.concat([cd, eocdr]));
}

function concat(arrs) {
  var total = arrs.reduce(function (n, a) { return n + a.length; }, 0);
  var out = new Uint8Array(total); var off = 0;
  arrs.forEach(function (a) { out.set(a, off); off += a.length; });
  return out;
}

function crc32(data) {
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crc32.table[i] = c;
    }
  }
  var c = 0xFFFFFFFF;
  for (var i = 0; i < data.length; i++) c = crc32.table[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
`;

function generateReport(data) {
  // 1. Write data.js (the only file regenerated each run)
  const jsonStr = JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>');
  fs.writeFileSync(path.join(BENCHMARK_DIR, 'data.js'), 'var DATA = ' + jsonStr + ';');

  // 2. Bootstrap sibling files on first run (never overwrite user edits)
  const htmlPath = path.join(BENCHMARK_DIR, 'report.html');
  if (!fs.existsSync(htmlPath)) fs.writeFileSync(htmlPath, DEFAULT_REPORT_HTML);

  const cssPath = path.join(BENCHMARK_DIR, 'report.css');
  if (!fs.existsSync(cssPath)) fs.writeFileSync(cssPath, DEFAULT_REPORT_CSS);

  const uiPath = path.join(BENCHMARK_DIR, 'report-ui.js');
  if (!fs.existsSync(uiPath)) fs.writeFileSync(uiPath, DEFAULT_REPORT_UI_JS);

  log('data.js updated. Open report.html to view.');
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  // Node.js version check
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < 22) {
    console.error('ERROR: Node.js 22+ is required (you have ' + process.versions.node + ').');
    console.error('Upgrade at https://nodejs.org');
    process.exit(1);
  }

  // Ensure benchmark dir and log exist
  fs.mkdirSync(BENCHMARK_DIR, { recursive: true });

  // Parse arguments
  const argv = process.argv.slice(2);
  const catIdx = argv.indexOf('--category');
  let category = 'uncategorized';
  if (catIdx >= 0 && argv[catIdx + 1]) {
    category = argv[catIdx + 1];
    argv.splice(catIdx, 2);
  }
  const force = argv.includes('--force');
  const urls = argv.filter(a => a.startsWith('http'));

  if (!urls.length) {
    console.error('Usage: bun benchmark.js <home> <plp> <pdp> [--category <name>] [--force]');
    process.exit(1);
  }

  log('=== Benchmark run started ===');
  log('URLs: ' + urls.join(', '));
  log('Category: ' + category);

  // Verify Chrome is reachable
  await connectToChrome();
  log('Chrome connected on port ' + CDP_PORT);

  const data = readBenchmarkJson();
  const date = new Date().toISOString().slice(0, 10);

  const groups = groupUrlsByDomain(urls);

  for (const [domain, domainUrls] of Object.entries(groups)) {
    const existing = data.competitors.find(c => c.domain === domain);
    if (existing && !force) {
      const overwrite = await promptOverwrite(domain);
      if (!overwrite) { log('Skipping ' + domain); continue; }
    }

    const PAGE_TYPES = ['homepage', 'plp', 'pdp'];
    const urlList = domainUrls.slice(0, 3).map((u, i) => ({ url: u, type: PAGE_TYPES[i] }));
    log('URLs for ' + domain + ':');
    urlList.forEach(({ url, type }) => log('  ' + type + ' → ' + url));

    let tab, cdp;
    try {
      tab = await createTab('about:blank');
      cdp = new CDPClient();
      await cdp.connect(tab.webSocketDebuggerUrl);
      await enableDomains(cdp);
    } catch (e) {
      logError('Could not create Chrome tab: ' + e.message);
      continue;
    }

    try {
      const result = await crawlUrls(urlList, category, date, cdp);
      mergeResult(data, result);
      writeBenchmarkJson(data);
      log('Done: ' + domain);
    } catch (e) {
      logError('Crawl failed for ' + domain + ': ' + e.message);
    } finally {
      cdp.close();
      await closeTab(tab.id);
    }
  }

  // Generate / update report
  generateReport(data);
  log('Report: ' + path.join(BENCHMARK_DIR, 'report.html'));
  log('');
  log('To view: serve locally with  npx serve ' + BENCHMARK_DIR);
  log('=== Run complete ===');
}

main().catch(e => { logError('Fatal: ' + e.message); process.exit(1); });
