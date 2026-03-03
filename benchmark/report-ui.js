'use strict';

// ============================================================
// STATE
// ============================================================

var activeView       = 'gallery';
var activeCategory   = 'all';
var activeCompetitors = {};
var activePages      = { homepage: true, plp: true, pdp: true };
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
  ['homepage', 'plp', 'pdp'].forEach(function (page) {
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
  return ['homepage', 'plp', 'pdp'].filter(function (p) { return activePages[p]; });
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
    html += '<button class="col-device-tab' + (dev === 'desktop' ? ' active' : '') + '" onclick="setColDevice(\'' + comp.domain + '\',\'desktop\')">D</button>';
    html += '<button class="col-device-tab' + (dev === 'mobile'  ? ' active' : '') + '" onclick="setColDevice(\'' + comp.domain + '\',\'mobile\')">M</button>';
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
          html += '<img class="shot-img" src="' + src + '" loading="lazy" onclick="openLB(\'' + src + '\',\'' + comp.domain + '\',\'' + page + '\')" alt="' + page + ' ' + dev + '">';
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
    var cat  = comp.category || 'uncategorized';
    var ext  = comp.extended || {};

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
