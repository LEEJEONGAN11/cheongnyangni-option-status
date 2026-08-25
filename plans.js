/* 도면 보여주기 공용 부품
   ① 세대 평면도 (기본형 / 확장형) — images/59C_확장형.jpg 같은 이름
   ② 전기 도면 여러 장       — images/전기/59C_1.jpg … _8.jpg (세대 전용 파일도 가능)
   파일을 폴더에 올려두기만 하면 다음 접속부터 자동으로 나타납니다. */
(function () {
  'use strict';

  var CFG = window.WYC_CONFIG || {};
  var EDIR = CFG.electricPlanDir || 'images/전기/';
  var EMAX = CFG.electricPlanMax || 8;
  var EXTS = ['jpg', 'jpeg', 'png', 'webp'];
  var VARIANTS = ['기본형', '확장형'];

  var cache = {};       // 경로후보키 -> src | null

  /** 후보 경로들을 앞에서부터 시도해서 처음 열리는 것을 돌려줍니다. */
  function probe(bases) {
    var key = bases.join('|');
    if (Object.prototype.hasOwnProperty.call(cache, key)) return Promise.resolve(cache[key]);
    var cands = [];
    bases.forEach(function (b) {
      EXTS.forEach(function (e) { cands.push(b + '.' + e); });
    });
    return new Promise(function (resolve) {
      var i = 0;
      (function next() {
        if (i >= cands.length) { cache[key] = null; resolve(null); return; }
        var src = cands[i++];
        var img = new Image();
        img.onload = function () { cache[key] = src; resolve(src); };
        img.onerror = next;
        img.src = src;
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
    var jobs = [];
    for (var i = 1; i <= EMAX; i++) {
      (function (n) {
        var bases = [
          EDIR + enc(u.dong + '_' + u.ho + '_' + n),   // 세대 전용 (102_1902_1.jpg)
          EDIR + enc((u.etype || u.type) + '_' + n),   // 타입별   (59B_1.jpg)
          EDIR + enc((u.type || '') + '_' + n)         // 우/좌 구분 없는 타입 (59A_1.jpg)
        ];
        jobs.push(probe(bases).then(function (src) { return src ? { n: n, src: src } : null; }));
      })(i);
    }
    return Promise.all(jobs).then(function (arr) {
      return arr.filter(Boolean);
    });
  }

  /** 도면 이름(탭 이름). 시트에 저장해 둔 게 있으면 그걸 씁니다. */
  function planNames(store, u) {
    var v = store ? store.get('도면', u.etype || u.type) : null;
    return (v && v.names) ? v.names : [];
  }

  function nameOf(names, n) {
    return (names[n - 1] && String(names[n - 1]).trim()) || ('도면 ' + n);
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
      var idx = 0;

      function draw() {
        var cur = list[idx];
        var html = '<div class="plan-box"><div class="eplan-tabs">';
        list.forEach(function (p, i) {
          html += '<button type="button" class="eplan-tab" data-i="' + i + '" aria-pressed="' +
                  (i === idx) + '">' + esc(nameOf(names, p.n)) + '</button>';
        });
        html += '</div>';
        html += '<div class="plan-frame"><img class="plan-img" data-zoom="1" src="' + esc(cur.src) +
                '" alt="' + esc(u.label + ' 전기도면 ' + nameOf(names, cur.n)) + '"></div>';
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
        '저장소 <b>' + esc(EDIR) + '</b> 폴더에 <b>' + esc((u.etype || u.type) + '_1.jpg') +
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

  function zoom(src) {
    var lb = document.getElementById('lightbox');
    var img = document.getElementById('lightboxImg');
    if (!lb || !img) return;
    img.src = src;
    lb.classList.add('open');
  }

  function initLightbox() {
    var lb = document.getElementById('lightbox');
    if (!lb) return;
    var close = document.getElementById('lightboxClose');
    if (close) close.addEventListener('click', function () { lb.classList.remove('open'); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.classList.remove('open'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLightbox);
  else initLightbox();

  window.WYCPlans = {
    probe: probe,
    findElectric: findElectric,
    renderElectric: renderElectric,
    renderUnitPlan: renderUnitPlan,
    planNames: planNames,
    nameOf: nameOf,
    zoom: zoom,
    EDIR: EDIR,
    EMAX: EMAX
  };
})();
