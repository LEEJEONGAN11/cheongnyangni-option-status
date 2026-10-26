/* 도면 보여주기 공용 부품
   ① 세대 평면도 (기본형 / 확장형) — images/59C_확장형.jpg 같은 이름
   ② 전기 도면 여러 장       — images/전기/59C_1.jpg … _8.jpg (세대 전용 파일도 가능)
   파일을 폴더에 올려두기만 하면 다음 접속부터 자동으로 나타납니다. */
(function () {
  'use strict';

  var CFG = window.WYC_CONFIG || {};
  var EDIR = CFG.electricPlanDir || 'images/전기/';
  var EMAX = CFG.electricPlanMax || 12;
  var EXTS = ['png', 'jpg', 'jpeg', 'webp'];
  var VARIANTS = ['기본형', '확장형'];

  var cache = {};         // 경로후보키 -> src | null   (확정된 결과만 저장)
  var existsCache = {};   // 파일 주소 하나 -> true | false (확정된 결과만 저장)

  function imgExists(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(true); };
      img.onerror = function () { resolve(false); };
      img.src = src;
    });
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** 파일이 있는지만 확인합니다.  → true(있음) / false(없음) / null(지금은 모름)
      · 큰 도면(PNG 수백 KB~1MB)을 "있나 없나" 보려고 통째로 내려받지 않도록 HEAD 로 물어봅니다.
      · 같은 주소는 한 번만 물어봅니다.
      · 서버가 잠깐 바빠서(429/5xx) 답을 못 주면 한 번 더 물어보고, 그래도 모르면 null.
        이때는 "없다"고 단정하지 않고(=도면 없음으로 잘못 보이지 않게) 결과도 저장하지 않습니다. */
  function exists(src) {
    if (Object.prototype.hasOwnProperty.call(existsCache, src)) return Promise.resolve(existsCache[src]);
    function done(v) { if (v === true || v === false) existsCache[src] = v; return v; }
    if (typeof fetch !== 'function') return imgExists(src).then(done);
    function ask(canRetry) {
      return fetch(src, { method: 'HEAD' }).then(function (r) {
        if (r.ok) return true;
        if (r.status === 404 || r.status === 410) return false;
        if (r.status === 429 || r.status >= 500) {
          return canRetry ? wait(900).then(function () { return ask(false); }) : null;
        }
        return imgExists(src);          // 405 등, HEAD 를 막아 둔 서버면 예전 방식으로
      }, function () { return imgExists(src); });
    }
    return ask(true).then(done);
  }

  /** 후보 경로들을 앞에서부터 시도해서 처음 열리는 것을 돌려줍니다. */
  function probe(bases) {
    var key = bases.join('|');
    if (Object.prototype.hasOwnProperty.call(cache, key)) return Promise.resolve(cache[key]);
    var cands = [];
    bases.forEach(function (b) {
      EXTS.forEach(function (e) { cands.push(b + '.' + e); });
    });
    return new Promise(function (resolve) {
      var i = 0, unsure = false;
      (function next() {
        if (i >= cands.length) { if (!unsure) cache[key] = null; resolve(null); return; }
        var src = cands[i++];
        exists(src).then(function (ok) {
          if (ok === true) { cache[key] = src; resolve(src); }
          else { if (ok === null) unsure = true; next(); }
        });
      })();
    });
  }

  function enc(s) { return encodeURIComponent(String(s)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  /* ---------- ① 세대 평면도 ---------- */

  function unitPlanSrc(type, variant) {
    return probe(['images/' + enc(type + '_' + variant)]);
  }

  /* ---------- ② 전기 도면 ---------- */

  /** 한 세대의 전기 도면을 전부 찾습니다. → [{n, src}] */
  function findElectric(u) {
    var namesP = loadNames();           // 기본 도면 이름도 같이 준비해 둡니다

    // 타입별 파일 이름 앞부분 (59A우 → "59A우", "59A" 순서로, 같으면 하나만)
    var typeKeys = [];
    [u.etype || u.type, u.type || ''].forEach(function (t) {
      if (t && typeKeys.indexOf(t) < 0) typeKeys.push(t);
    });
    var unitKey = u.dong + '_' + u.ho + '_';            // 세대 전용 (102_1902_1.png)

    // 세대 전용 파일은 "1번"이 있을 때만 번호별로 찾습니다.
    // (거의 모든 세대는 전용 파일이 없는데, 번호마다 다 물어보면 요청이 수십 건으로 늘기 때문입니다.
    //  타입별 파일의 확인 결과는 같은 타입 세대끼리 공유되어 두 번째부터는 다시 묻지 않습니다.)
    return probe([EDIR + enc(unitKey + '1')]).then(function (unitFirst) {
      var jobs = [];
      for (var i = 1; i <= EMAX; i++) {
        (function (n) {
          var bases = [];
          if (unitFirst) bases.push(EDIR + enc(unitKey + n));
          typeKeys.forEach(function (t) { bases.push(EDIR + enc(t + '_' + n)); });
          jobs.push(probe(bases).then(function (src) { return src ? { n: n, src: src } : null; }));
        })(i);
      }
      return Promise.all(jobs);
    }).then(function (arr) {
      return namesP.then(function () { return arr.filter(Boolean); });
    });
  }

  /* ---- 도면 이름(탭 이름) ----
     ① 사이트에서 직접 바꿔 저장한 이름(시트)  →  ② images/전기/names.json 의 기본 이름  →  ③ "도면 3" */
  var namesManifest = null, namesReady = null;

  function loadNames() {
    if (namesReady) return namesReady;
    namesReady = (typeof fetch === 'function')
      ? fetch(EDIR + 'names.json', { cache: 'no-cache' })
          .then(function (r) { return r.ok ? r.json() : {}; })
          .catch(function () { return {}; })
      : Promise.resolve({});
    namesReady = namesReady.then(function (j) { namesManifest = j || {}; return namesManifest; });
    return namesReady;
  }

  /** names.json 에 적어 둔 이 타입의 기본 탭 이름 (loadNames 가 끝난 뒤에 쓰세요) */
  function defaultNames(u) {
    var m = namesManifest || {};
    return m[u.etype || u.type] || m[u.type || ''] || [];
  }

  /** 사이트에서 직접 저장해 둔 도면 이름. 없으면 빈 배열. */
  function planNames(store, u) {
    var v = store ? store.get('도면', u.etype || u.type) : null;
    return (v && v.names) ? v.names : [];
  }

  function nameOf(names, n, defs) {
    return (names && names[n - 1] && String(names[n - 1]).trim()) ||
           (defs && defs[n - 1]) || ('도면 ' + n);
  }

  /* ---------- 화면 그리기 ---------- */

  /** 전기 도면 화면 (없으면 세대 평면도로 대신 보여줍니다) */
  function renderElectric(host, u, store) {
    host.innerHTML = '<div class="plan-placeholder loading">도면 찾는 중…</div>';
    var token = (host._token = (host._token || 0) + 1);

    findElectric(u).then(function (list) {
      if (host._token !== token) return;
      if (!list.length) return renderFallback(host, u);

      var names = planNames(store, u);
      var defs = defaultNames(u);
      var idx = 0;

      function draw() {
        var cur = list[idx];
        var html = '<div class="plan-box"><div class="eplan-tabs">';
        list.forEach(function (p, i) {
          html += '<button type="button" class="eplan-tab" data-i="' + i + '" aria-pressed="' +
                  (i === idx) + '">' + esc(nameOf(names, p.n, defs)) + '</button>';
        });
        html += '</div>';
        html += '<div class="plan-frame"><img class="plan-img" data-zoom="1" src="' + esc(cur.src) +
                '" alt="' + esc(u.label + ' 전기도면 ' + nameOf(names, cur.n, defs)) + '"></div>';
        html += '<div class="eplan-nav">' +
                '<button type="button" class="wbtn ghost" data-step="-1"' + (idx === 0 ? ' disabled' : '') + '>‹ 이전</button>' +
                '<span class="pos">' + (idx + 1) + ' / ' + list.length + '</span>' +
                '<button type="button" class="wbtn ghost" data-step="1"' + (idx === list.length - 1 ? ' disabled' : '') + '>다음 ›</button>' +
                '</div>';
        html += '<div class="plan-btn-row"><button type="button" class="plan-btn primary" data-zoom="1">🔍 크게 보기</button></div>';
        html += '</div>';
        host.innerHTML = html;

        host.querySelectorAll('.eplan-tab').forEach(function (b) {
          b.addEventListener('click', function () { idx = Number(b.dataset.i); draw(); });
        });
        host.querySelectorAll('[data-step]').forEach(function (b) {
          b.addEventListener('click', function () {
            idx = Math.max(0, Math.min(list.length - 1, idx + Number(b.dataset.step)));
            draw();
          });
        });
        host.querySelectorAll('[data-zoom]').forEach(function (b) {
          b.addEventListener('click', function () { zoom(list[idx].src); });
        });
      }
      draw();
    });
  }

  /** 전기 도면이 아직 없을 때: 세대 평면도(기본형/확장형)라도 보여줍니다 */
  function renderFallback(host, u) {
    var variant = '확장형';
    function draw() {
      var html = '<div class="plan-box">' +
        '<p class="empty-note" style="margin-bottom:10px;">이 세대의 전기 도면이 아직 없습니다. ' +
        '저장소 <b>' + esc(EDIR) + '</b> 폴더에 <b>' + esc((u.etype || u.type) + '_1.png') +
        '</b> 처럼 올리면 바로 나타납니다.<br>우선 세대 평면도를 보여드릴게요.</p>' +
        '<div class="plan-variant-row">' +
        VARIANTS.map(function (v) {
          return '<button type="button" class="plan-variant-btn" data-v="' + v + '" aria-pressed="' +
                 (v === variant) + '">' + v + '</button>';
        }).join('') + '</div>' +
        '<div id="fbSlot"><div class="plan-placeholder loading">불러오는 중…</div></div></div>';
      host.innerHTML = html;
      host.querySelectorAll('.plan-variant-btn').forEach(function (b) {
        b.addEventListener('click', function () { variant = b.dataset.v; draw(); });
      });

      var type = u.type;
      unitPlanSrc(type, variant).then(function (src) {
        var slot = host.querySelector('#fbSlot');
        if (!slot) return;
        if (src) {
          slot.innerHTML = '<div class="plan-frame"><img class="plan-img" data-zoom="1" src="' + esc(src) +
            '" alt="' + esc(type + ' ' + variant) + '"></div>' +
            '<div class="plan-btn-row"><button type="button" class="plan-btn primary" data-zoom="1">🔍 크게 보기</button></div>';
          slot.querySelectorAll('[data-zoom]').forEach(function (b) {
            b.addEventListener('click', function () { zoom(src); });
          });
        } else {
          slot.innerHTML = '<div class="plan-placeholder"><span class="ty">' + esc(type + ' · ' + variant) +
            '</span>이 타입의 평면도가 아직 없어요.</div>';
        }
      });
    }
    draw();
  }

  /** 세대 평면도만 (계약 현황 화면에서 씁니다) */
  function renderUnitPlan(host, u, startVariant) {
    var variant = startVariant || '기본형';
    function draw() {
      host.innerHTML = '<div class="plan-box"><div class="plan-variant-row">' +
        VARIANTS.map(function (v) {
          return '<button type="button" class="plan-variant-btn" data-v="' + v + '" aria-pressed="' +
                 (v === variant) + '">' + v + '</button>';
        }).join('') +
        '</div><div id="upSlot"><div class="plan-placeholder loading">불러오는 중…</div></div></div>';
      host.querySelectorAll('.plan-variant-btn').forEach(function (b) {
        b.addEventListener('click', function () { variant = b.dataset.v; draw(); });
      });
      var type = u.type, want = variant;
      unitPlanSrc(type, want).then(function (src) {
        if (variant !== want) return;
        var slot = host.querySelector('#upSlot');
        if (!slot) return;
        if (src) {
          slot.innerHTML = '<div class="plan-frame"><img class="plan-img" data-zoom="1" src="' + esc(src) +
            '" alt="' + esc(type + ' ' + want) + ' 평면도"></div>' +
            '<div class="plan-btn-row"><button type="button" class="plan-btn primary" data-zoom="1">🔍 크게 보기</button></div>';
          slot.querySelectorAll('[data-zoom]').forEach(function (b) {
            b.addEventListener('click', function () { zoom(src); });
          });
        } else {
          slot.innerHTML = '<div class="plan-placeholder"><span class="ty">' + esc(type + ' · ' + want) +
            '</span>이 타입의 평면도가 아직 없어요.<br>images 폴더에 <b>' +
            esc(type + '_' + want + '.jpg') + '</b> 파일로 올려주시면 바로 표시돼요.</div>';
        }
      });
    }
    draw();
  }

  /* ---------- 크게 보기: 확대·축소 · 끌어서 이동 ----------
     마우스 휠 / 두 손가락 벌리기 / ＋－ 버튼 / 두 번 누르기 로 확대하고,
     확대한 상태에서는 끌어서 움직입니다. (A3 도면을 200DPI 로 올려 두었기 때문에
     확대하면 작은 글씨와 치수까지 또렷하게 읽힙니다.) */
  var LB = { nw: 0, nh: 0, s: 1, s0: 1, max: 2.5, x: 0, y: 0, moved: false, ptrs: {}, down: null, tapAt: 0, tapX: 0, tapY: 0, tk: 0 };

  function lbBox() { return document.getElementById('lightbox'); }
  function lbImg() { return document.getElementById('lightboxImg'); }

  /** 화면에 꼭 맞는 배율 (원본보다 크게 늘리지는 않습니다) */
  function lbCalcFit() {
    var b = lbBox();
    var W = Math.max(b.clientWidth, 1), H = Math.max(b.clientHeight, 1);   // 창이 아직 안 그려졌을 때(0) 대비
    LB.s0 = Math.max(0.02, Math.min((W - 24) / LB.nw, (H - 84) / LB.nh, 1));
    LB.max = Math.max(2.5, LB.s0 * 4);
  }

  /** 그림이 화면 밖으로 너무 나가지 않게, 작을 땐 가운데로 */
  function lbClamp() {
    var b = lbBox(), w = LB.nw * LB.s, h = LB.nh * LB.s;
    LB.x = (w <= b.clientWidth)  ? (b.clientWidth  - w) / 2 : Math.min(0, Math.max(b.clientWidth  - w, LB.x));
    LB.y = (h <= b.clientHeight) ? (b.clientHeight - h) / 2 : Math.min(0, Math.max(b.clientHeight - h, LB.y));
  }

  function lbApply() {
    lbImg().style.transform = 'translate(' + LB.x + 'px,' + LB.y + 'px) scale(' + LB.s + ')';
    var z = document.getElementById('lbZoomPct');
    if (z) z.textContent = Math.round(LB.s * 100) + '%';
  }

  function lbFit() {
    lbCalcFit();
    LB.s = LB.s0; LB.x = 0; LB.y = 0;
    lbClamp(); lbApply();
  }

  /** (px,py) 지점이 그대로 있도록 ns 배율로 */
  function lbZoomTo(ns, px, py) {
    ns = Math.min(LB.max, Math.max(LB.s0, ns));
    var r = ns / LB.s;
    LB.x = px - (px - LB.x) * r;
    LB.y = py - (py - LB.y) * r;
    LB.s = ns;
    lbClamp(); lbApply();
  }

  /** 처음 열 때 몇 초만 보여주는 사용법 안내 (폰/PC 에 맞춰 문구가 다름) */
  function lbShowHint() {
    var h = document.getElementById('lbHint');
    if (!h) return;
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    h.textContent = touch ? '두 손가락으로 벌려 확대 · 두 번 누르면 확대/맞춤'
                          : '휠로 확대 · 끌어서 이동 · 두 번 클릭하면 확대/맞춤';
    h.classList.add('show');
    clearTimeout(h._t);
    h._t = setTimeout(function () { h.classList.remove('show'); }, 3600);
  }

  function zoom(src) {
    var lb = lbBox(), img = lbImg();
    if (!lb || !img) return;
    var tk = ++LB.tk;
    LB.ptrs = {}; LB.moved = false;
    lb.classList.add('open', 'zoomable', 'loading');
    lbShowHint();
    img.style.visibility = 'hidden';
    var pre = new Image();
    function done() {
      if (tk !== LB.tk) return;                       // 그 사이 다른 그림을 열었으면 무시
      LB.nw = pre.naturalWidth || 1200;
      LB.nh = pre.naturalHeight || 800;
      img.style.width = LB.nw + 'px';
      img.style.height = LB.nh + 'px';
      img.src = src;
      img.style.visibility = '';
      lb.classList.remove('loading');
      lbFit();
    }
    pre.onload = done;
    pre.onerror = done;
    pre.src = src;
  }

  function initLightbox() {
    var lb = lbBox();
    if (!lb) return;

    var tools = document.createElement('div');
    tools.className = 'lb-tools';
    tools.innerHTML =
      '<button type="button" data-z="out" aria-label="축소">−</button>' +
      '<span id="lbZoomPct">100%</span>' +
      '<button type="button" data-z="in" aria-label="확대">＋</button>' +
      '<button type="button" data-z="fit" class="wide">맞춤</button>' +
      '<button type="button" data-z="one" class="wide">원본 크기</button>';
    lb.appendChild(tools);
    var hint = document.createElement('div');
    hint.id = 'lbHint';
    hint.className = 'lb-hint';
    lb.appendChild(hint);
    tools.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-z]') : null;
      if (!b) return;
      e.stopPropagation();
      var cx = lb.clientWidth / 2, cy = lb.clientHeight / 2, z = b.getAttribute('data-z');
      if (z === 'in') lbZoomTo(LB.s * 1.4, cx, cy);
      else if (z === 'out') lbZoomTo(LB.s / 1.4, cx, cy);
      else if (z === 'fit') lbFit();
      else if (z === 'one') lbZoomTo(1, cx, cy);
    });

    var close = document.getElementById('lightboxClose');
    if (close) close.addEventListener('click', function () { lb.classList.remove('open'); });

    // 빈 곳을 누르면 닫힘. (끌어서 옮기다 손을 뗀 경우는 닫지 않습니다)
    lb.addEventListener('click', function (e) {
      if (LB.moved) { LB.moved = false; return; }
      if (e.target === lb) lb.classList.remove('open');
    });

    lb.addEventListener('wheel', function (e) {
      if (!lb.classList.contains('zoomable') || !LB.nw) return;
      e.preventDefault();
      var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      lbZoomTo(LB.s * Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0016)), e.clientX, e.clientY);
    }, { passive: false });

    lb.addEventListener('pointerdown', function (e) {
      if (!lb.classList.contains('zoomable') || !LB.nw) return;
      if (e.target.closest && e.target.closest('.lb-tools, .lightbox-close')) return;
      LB.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(LB.ptrs).length === 1) {
        LB.moved = false;
        LB.down = { x: e.clientX, y: e.clientY };
      }
      lb.classList.add('grabbing');
    });

    window.addEventListener('pointermove', function (e) {
      var p = LB.ptrs[e.pointerId];
      if (!p) return;
      var ids = Object.keys(LB.ptrs);
      if (ids.length === 1) {
        LB.x += e.clientX - p.x;
        LB.y += e.clientY - p.y;
        if (Math.abs(e.clientX - LB.down.x) + Math.abs(e.clientY - LB.down.y) > 6) LB.moved = true;
        p.x = e.clientX; p.y = e.clientY;
        lbClamp(); lbApply();
      } else {
        // 두 손가락: 벌린 비율만큼 확대, 두 손가락 가운데 점이 움직인 만큼 이동
        var q = LB.ptrs[ids[0] === String(e.pointerId) ? ids[1] : ids[0]];
        var d0 = Math.hypot(p.x - q.x, p.y - q.y), cx0 = (p.x + q.x) / 2, cy0 = (p.y + q.y) / 2;
        p.x = e.clientX; p.y = e.clientY;
        var d1 = Math.hypot(p.x - q.x, p.y - q.y), cx1 = (p.x + q.x) / 2, cy1 = (p.y + q.y) / 2;
        LB.moved = true;
        LB.x += cx1 - cx0; LB.y += cy1 - cy0;
        if (d0 > 0) lbZoomTo(LB.s * d1 / d0, cx1, cy1);
        else { lbClamp(); lbApply(); }
      }
    });

    function endPointer(e) {
      if (!LB.ptrs[e.pointerId]) return;
      var wasSingle = Object.keys(LB.ptrs).length === 1;
      delete LB.ptrs[e.pointerId];
      if (!Object.keys(LB.ptrs).length) lb.classList.remove('grabbing');
      // 그림을 두 번 누르면(두 번 클릭) 확대 ↔ 맞춤
      if (wasSingle && e.type === 'pointerup' && !LB.moved && e.target !== lb) {
        var now = Date.now();
        if (now - LB.tapAt < 320 && Math.abs(e.clientX - LB.tapX) + Math.abs(e.clientY - LB.tapY) < 40) {
          LB.tapAt = 0;
          if (LB.s > LB.s0 * 1.05) lbFit();
          else lbZoomTo(Math.min(LB.max, Math.max(LB.s0 * 3, 1)), e.clientX, e.clientY);
        } else {
          LB.tapAt = now; LB.tapX = e.clientX; LB.tapY = e.clientY;
        }
      }
    }
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    window.addEventListener('resize', function () {
      if (!lb.classList.contains('open') || !LB.nw) return;
      var atFit = LB.s <= LB.s0 * 1.001;
      lbCalcFit();
      LB.s = atFit ? LB.s0 : Math.min(LB.max, Math.max(LB.s0, LB.s));
      lbClamp(); lbApply();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLightbox);
  else initLightbox();

  window.WYCPlans = {
    probe: probe,
    findElectric: findElectric,
    renderElectric: renderElectric,
    renderUnitPlan: renderUnitPlan,
    planNames: planNames,
    defaultNames: defaultNames,
    nameOf: nameOf,
    zoom: zoom,
    EDIR: EDIR,
    EMAX: EMAX
  };
})();
