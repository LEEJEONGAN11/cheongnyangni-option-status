/* 수정 기능 공용 부품 — 잠금 해제(비밀번호), 수정 화면, 이력 보기 */
(function () {
  'use strict';

  var S = null, opts = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function el(id) { return document.getElementById(id); }

  /* ───────── 위쪽 상태 줄 ───────── */

  function paintBar() {
    var srv = el('srvChip'), edit = el('editChip'), bar = el('sysBar');

    if (!S.apiReady) {
      srv.className = 'srv off';
      srv.textContent = '보기 전용';
      srv.title = '수정 서버 주소가 아직 설정되지 않았습니다';
      if (edit) edit.hidden = true;
      if (bar) {
        bar.hidden = false;
        bar.innerHTML = '<b>지금은 보기 전용입니다.</b> 표는 정상으로 보이지만 수정은 저장되지 않습니다.<br>' +
          '수정까지 쓰시려면 <code>settings.js</code> 파일을 열어서 <code>apiUrl</code> 에 Apps Script 주소를 붙여넣어 주세요. ' +
          '(설치 안내서 참고 — 이 파일 하나만 고치면 되고, 다음에 새 버전을 받아도 그대로 남습니다.)';
      }
      return;
    }

    if (!S.online) {
      srv.className = 'srv off';
      srv.textContent = '서버 연결 실패 · 다시 시도';
      if (edit) edit.hidden = true;
      if (bar) {
        bar.hidden = false;
        bar.innerHTML = '<b>수정 서버에 연결하지 못했습니다.</b> 원본 데이터로 표시하고 있습니다.' +
          (S.lastError ? '<br>사유: ' + esc(S.lastError) : '');
      }
      return;
    }

    if (bar) bar.hidden = true;
    var n = S.countEdited(opts.kind || '');
    srv.className = 'srv on';
    srv.textContent = n ? ('수정 반영됨 · ' + n + '세대') : '서버 연결됨';
    srv.title = '누르면 수정 이력을 볼 수 있습니다';

    if (edit) {
      edit.hidden = false;
      if (S.unlocked()) {
        edit.className = 'srv edit';
        edit.textContent = '✏️ 수정 중' + (S.who ? ' · ' + esc(S.who) : '') + ' (잠그기)';
      } else {
        edit.className = 'srv';
        edit.textContent = '✏️ 수정하기';
      }
    }
    document.body.classList.toggle('editing', S.unlocked());
  }

  function initBar(o) {
    opts = o || {};
    S = opts.store;

    var srv = el('srvChip'), edit = el('editChip');

    srv.addEventListener('click', function () {
      if (!S.apiReady) return;
      if (!S.online) { S.load(true).then(function () { paintBar(); if (opts.onChanged) opts.onChanged(); }); return; }
      showHistory();   // 잠금 없이 볼 수 있습니다
    });

    if (edit) edit.addEventListener('click', function () {
      if (S.unlocked()) {
        S.lock();
        paintBar();
        if (opts.onModeChange) opts.onModeChange();
        S.toast('수정 잠금을 걸었습니다');
      } else {
        showPin();
      }
    });

    var pc = el('pinClose');
    if (pc) pc.addEventListener('click', function () { el('pinBackdrop').classList.remove('open'); });
    var pb = el('pinBackdrop');
    if (pb) pb.addEventListener('click', function (e) { if (e.target === pb) pb.classList.remove('open'); });

    paintBar();
    if (S.apiReady) {
      S.restore();
      S.load().then(function () {
        // 저장해 둔 비밀번호가 아직 맞는지 조용히 확인
        if (S.pin) {
          var p = S.pin;
          S.pin = '';
          S.unlock(p, S.who).catch(function () {}).then(function () {
            paintBar();
            if (opts.onChanged) opts.onChanged();
          });
        } else {
          paintBar();
          if (opts.onChanged) opts.onChanged();
        }
      });
    }
  }

  /* ───────── 비밀번호 ───────── */

  function showPin() {
    var back = el('pinBackdrop'), body = el('pinBody');
    body.innerHTML =
      '<h3>수정 잠금 풀기</h3>' +
      '<p class="sub">비밀번호를 넣으면 이 브라우저를 닫을 때까지 수정할 수 있습니다.</p>' +
      '<div class="pin-wrap">' +
      '<label for="pinIn">수정 비밀번호</label>' +
      '<input type="password" id="pinIn" inputmode="numeric" autocomplete="off" placeholder="••••">' +
      '<label for="whoIn">이름 (누가 고쳤는지 남깁니다 · 선택)</label>' +
      '<input type="text" id="whoIn" class="name" placeholder="예: 김현장" value="' + esc(S.who || '') + '">' +
      '<div class="pin-err" id="pinErr"></div>' +
      '<div class="btn-row"><button type="button" class="wbtn primary" id="pinGo">잠금 풀기</button></div>' +
      '</div>';
    back.classList.add('open');
    var input = el('pinIn');
    setTimeout(function () { input.focus(); }, 60);

    function go() {
      var pin = input.value.trim();
      if (!pin) { el('pinErr').textContent = '비밀번호를 넣어주세요.'; return; }
      var btn = el('pinGo');
      btn.disabled = true; btn.textContent = '확인 중…';
      S.unlock(pin, el('whoIn').value.trim()).then(function () {
        back.classList.remove('open');
        paintBar();
        if (opts.onModeChange) opts.onModeChange();
        S.toast('이제 수정할 수 있습니다', 'good');
      }).catch(function (err) {
        el('pinErr').textContent = err.message;
        btn.disabled = false; btn.textContent = '잠금 풀기';
        input.select();
      });
    }
    el('pinGo').addEventListener('click', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    el('whoIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  }

  /* ───────── 수정 이력 (비밀번호 없이 볼 수 있습니다) ─────────
     서버가 주는 "지금 값"(state)과 사이트에 내장된 원본(data.js)을
     비교해서, 세대마다 무엇이 더해지고 빠졌는지 보여줍니다. */

  var STATE_LABEL = { option: '옵션 계약', nooption: '계약완료 · 옵션 미선택', none: '미계약' };

  function fmtAt(s) {
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s || '');
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function unitTitle(u, key) {
    if (!u) return key;
    return u.dong + '동 ' + (u.label || (u.ho + '호'));
  }

  function buildHistory() {
    var D = window.WYC || {};
    var UNITS = D.units || {};
    var itemName = {};
    (D.electricItems || []).forEach(function (it) { itemName[it.no] = it.name; });

    var out = [];
    Object.keys(S.changes).forEach(function (ck) {
      var i = ck.indexOf('|');
      var kind = ck.slice(0, i), key = ck.slice(i + 1);
      var rec = S.changes[ck] || {};
      var cur = rec.val || {};
      var u = UNITS[key];
      var lines = [];

      if (kind === '계약') {
        var oState = (u && u.state) || 'none';
        var nState = cur.state || oState;
        var oOpts = (u && u.opts) || [];
        var nOpts = cur.opts || oOpts;
        if (oState !== nState) {
          lines.push({ t: 'state', a: STATE_LABEL[oState] || oState, b: STATE_LABEL[nState] || nState });
        }
        nOpts.forEach(function (x) { if (oOpts.indexOf(x) < 0) lines.push({ t: 'add', v: x }); });
        oOpts.forEach(function (x) { if (nOpts.indexOf(x) < 0) lines.push({ t: 'del', v: x }); });
        out.push({ tag: '계약 옵션', unit: unitTitle(u, key), at: rec.at, who: rec.who, lines: lines });

      } else if (kind === '전기') {
        var oE = (u && u.eopts) || [];
        var nE = cur.opts || oE;
        var label = function (no) { return no + '. ' + (itemName[no] || ('품목 ' + no)); };
        nE.forEach(function (no) { if (oE.indexOf(no) < 0) lines.push({ t: 'add', v: label(no) }); });
        oE.forEach(function (no) { if (nE.indexOf(no) < 0) lines.push({ t: 'del', v: label(no) }); });
        out.push({ tag: '전기공사', unit: unitTitle(u, key), at: rec.at, who: rec.who, lines: lines });

      } else if (kind === '도면') {
        (cur.names || []).forEach(function (nm, idx) {
          if (nm) lines.push({ t: 'name', v: '도면 ' + (idx + 1) + ' → “' + nm + '”' });
        });
        out.push({ tag: '도면 이름', unit: key + ' 타입', at: rec.at, who: rec.who, lines: lines });
      }
    });

    out.sort(function (a, b) {
      var ta = new Date(a.at).getTime() || 0, tb = new Date(b.at).getTime() || 0;
      return tb - ta;   // 최근 것이 위로
    });
    return out;
  }

  function showHistory() {
    var back = el('pinBackdrop'), body = el('pinBody');
    back.classList.add('open');

    var list = buildHistory();
    if (!list.length) {
      body.innerHTML = '<h3>수정 이력</h3><p class="empty-note">아직 원본에서 고친 세대가 없습니다.</p>';
      return;
    }

    body.innerHTML = '<h3>수정 이력</h3>' +
      '<p class="sub">원본과 지금 값을 비교한 결과입니다 · 모두 ' + list.length + '건</p>' +
      '<div class="hist">' + list.map(function (e) {
        var inner = e.lines.length
          ? '<ul class="hist-ch">' + e.lines.map(function (ln) {
              if (ln.t === 'state') return '<li class="c-state">계약 상태 <span>' + esc(ln.a) + '</span> → <b>' + esc(ln.b) + '</b></li>';
              if (ln.t === 'add') return '<li class="c-add">＋ ' + esc(ln.v) + '</li>';
              if (ln.t === 'del') return '<li class="c-del">− ' + esc(ln.v) + '</li>';
              return '<li class="c-name">' + esc(ln.v) + '</li>';
            }).join('') + '</ul>'
          : '<p class="hist-none">바뀐 항목이 없습니다 (원본과 같아졌습니다).</p>';
        return '<div class="hist-card">' +
          '<div class="hist-top"><b>' + esc(e.unit) + '</b><span class="hist-tag">' + esc(e.tag) + '</span></div>' +
          inner +
          '<div class="hist-when">' + esc(fmtAt(e.at)) + (e.who ? ' · ' + esc(e.who) : '') + '</div>' +
          '</div>';
      }).join('') + '</div>';
  }

  /* ───────── 저장 버튼 공통 ───────── */

  function withBusy(btn, label, fn) {
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = label;
    return fn().catch(function (err) {
      S.toast(err.message, 'bad');
    }).then(function (r) {
      btn.disabled = false; btn.textContent = old;
      return r;
    });
  }

  /* ───────── ① 전기공사 옵션 수정 ───────── */

  function renderElectricEdit(host, u, ITEMS, current, onSaved) {
    var key = u.dong + u.ho;
    var picked = current.slice();

    host.innerHTML =
      '<div class="edit-panel">' +
      '<h4>이 세대에 시공할 전기공사 번호를 골라주세요</h4>' +
      '<div class="opt-check-grid">' +
      ITEMS.map(function (it) {
        var on = picked.indexOf(it.no) >= 0;
        return '<label class="opt-check' + (on ? ' on' : '') + '" data-no="' + it.no + '">' +
               '<input type="checkbox"' + (on ? ' checked' : '') + '>' +
               '<span class="txt">' + it.no + '. ' + esc(it.name) +
               (it.desc.length ? '<small>' + esc(it.desc[0]) + '</small>' : '') + '</span></label>';
      }).join('') +
      '</div>' +
      '<div class="btn-row">' +
      '<button type="button" class="wbtn primary" id="edSave">저장</button>' +
      '<button type="button" class="wbtn ghost" id="edReset">원본으로 되돌리기</button>' +
      '</div>' +
      '<p class="pin-err" id="edMsg" style="color:var(--text-muted); font-weight:600;"></p>' +
      '</div>' +
      '<div class="edit-panel">' +
      '<h4>도면 이름 (탭에 표시됩니다 · ' + esc(u.etype || u.type) + ' 타입 공통)</h4>' +
      '<div id="planNameHost"><p class="empty-note">도면 확인 중…</p></div>' +
      '</div>';

    host.querySelectorAll('.opt-check').forEach(function (lab) {
      lab.addEventListener('change', function () {
        var no = Number(lab.dataset.no);
        var on = lab.querySelector('input').checked;
        var i = picked.indexOf(no);
        if (on && i < 0) picked.push(no);
        if (!on && i >= 0) picked.splice(i, 1);
        picked.sort(function (a, b) { return a - b; });
        lab.classList.toggle('on', on);
      });
    });

    el('edSave').addEventListener('click', function (e) {
      withBusy(e.currentTarget, '저장 중…', function () {
        return S.save('전기', key, { opts: picked }).then(function () {
          S.toast(u.label + ' 저장했습니다', 'good');
          if (onSaved) onSaved();
        });
      });
    });

    el('edReset').addEventListener('click', function (e) {
      if (!S.edited('전기', key)) { S.toast('이 세대는 아직 원본 그대로입니다'); return; }
      withBusy(e.currentTarget, '되돌리는 중…', function () {
        return S.reset('전기', key).then(function () {
          S.toast(u.label + ' 원본으로 되돌렸습니다', 'good');
          if (onSaved) onSaved();
        });
      });
    });

    // 도면 이름 편집
    var P = window.WYCPlans;
    P.findElectric(u).then(function (list) {
      var slot = el('planNameHost');
      if (!slot) return;
      if (!list.length) {
        slot.innerHTML = '<p class="empty-note">이 타입의 전기 도면이 아직 없습니다. ' +
          '저장소 <b>' + esc(P.EDIR) + '</b> 폴더에 파일을 올리면 여기서 이름을 붙일 수 있습니다.</p>';
        return;
      }
      var names = P.planNames(S, u).slice();
      slot.innerHTML = '<div class="pin-wrap" style="max-width:none;">' +
        list.map(function (p) {
          return '<label>' + esc(p.src.split('/').pop()) + '</label>' +
                 '<input type="text" class="name" data-n="' + p.n + '" placeholder="' + esc(P.nameOf(names, p.n)) +
                 '" value="' + esc(names[p.n - 1] || '') + '">';
        }).join('') +
        '<div class="btn-row"><button type="button" class="wbtn" id="pnSave">도면 이름 저장</button></div></div>';

      el('pnSave').addEventListener('click', function (e) {
        var arr = [];
        slot.querySelectorAll('input[data-n]').forEach(function (inp) {
          arr[Number(inp.dataset.n) - 1] = inp.value.trim();
        });
        withBusy(e.currentTarget, '저장 중…', function () {
          return S.save('도면', u.etype || u.type, { names: arr }).then(function () {
            S.toast('도면 이름을 저장했습니다', 'good');
            if (onSaved) onSaved();
          });
        });
      });
    });
  }

  /* ───────── ② 옵션 계약 현황 수정 ───────── */

  var STATES = [
    { id: 'option', label: '옵션 계약' },
    { id: 'nooption', label: '계약완료 · 옵션無' },
    { id: 'none', label: '미계약' }
  ];

  function renderContractEdit(host, u, OPTION_ITEMS, current, onSaved) {
    var key = u.dong + u.ho;
    var picked = (current.opts || []).slice();
    var state = current.state;

    host.innerHTML =
      '<div class="edit-panel">' +
      '<h4>계약 상태</h4>' +
      '<div class="state-radio-row">' +
      STATES.map(function (s) {
        return '<button type="button" class="state-radio" data-state="' + s.id + '" aria-pressed="' +
               (state === s.id) + '">' + s.label + '</button>';
      }).join('') +
      '</div>' +
      '<h4>선택한 옵션 항목</h4>' +
      '<div class="opt-check-grid">' +
      OPTION_ITEMS.map(function (nm) {
        var on = picked.indexOf(nm) >= 0;
        return '<label class="opt-check' + (on ? ' on' : '') + '" data-nm="' + esc(nm) + '">' +
               '<input type="checkbox"' + (on ? ' checked' : '') + '>' +
               '<span class="txt">' + esc(nm) + '</span></label>';
      }).join('') +
      '</div>' +
      '<div class="btn-row">' +
      '<button type="button" class="wbtn primary" id="edSave">저장</button>' +
      '<button type="button" class="wbtn ghost" id="edReset">원본으로 되돌리기</button>' +
      '</div>' +
      '<p class="pin-err" id="edMsg" style="color:var(--text-muted); font-weight:600;">' +
      '옵션을 하나라도 고르면 계약 상태가 자동으로 “옵션 계약”이 됩니다.</p>' +
      '</div>';

    function syncState() {
      host.querySelectorAll('.state-radio').forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.state === state ? 'true' : 'false');
      });
    }

    host.querySelectorAll('.state-radio').forEach(function (b) {
      b.addEventListener('click', function () { state = b.dataset.state; syncState(); });
    });

    host.querySelectorAll('.opt-check').forEach(function (lab) {
      lab.addEventListener('change', function () {
        var nm = lab.dataset.nm;
        var on = lab.querySelector('input').checked;
        var i = picked.indexOf(nm);
        if (on && i < 0) picked.push(nm);
        if (!on && i >= 0) picked.splice(i, 1);
        lab.classList.toggle('on', on);
        if (picked.length && state !== 'option') { state = 'option'; syncState(); }
        if (!picked.length && state === 'option') { state = 'nooption'; syncState(); }
      });
    });

    el('edSave').addEventListener('click', function (e) {
      // 순서를 원본 항목 순서대로 맞춰 저장합니다
      var ordered = OPTION_ITEMS.filter(function (nm) { return picked.indexOf(nm) >= 0; });
      withBusy(e.currentTarget, '저장 중…', function () {
        return S.save('계약', key, { state: state, opts: ordered }).then(function () {
          S.toast(u.label + ' 저장했습니다', 'good');
          if (onSaved) onSaved();
        });
      });
    });

    el('edReset').addEventListener('click', function (e) {
      if (!S.edited('계약', key)) { S.toast('이 세대는 아직 원본 그대로입니다'); return; }
      withBusy(e.currentTarget, '되돌리는 중…', function () {
        return S.reset('계약', key).then(function () {
          S.toast(u.label + ' 원본으로 되돌렸습니다', 'good');
          if (onSaved) onSaved();
        });
      });
    });
  }

  window.WYCEdit = {
    initBar: initBar,
    paintBar: paintBar,
    showPin: showPin,
    showHistory: showHistory,
    renderElectricEdit: renderElectricEdit,
    renderContractEdit: renderContractEdit
  };
})();
