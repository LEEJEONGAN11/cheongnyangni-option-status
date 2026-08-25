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
          '수정까지 쓰시려면 <code>config.js</code> 파일을 열어서 <code>apiUrl</code> 에 Apps Script 주소를 붙여넣어 주세요. ' +
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
      if (S.unlocked()) showHistory();
      else S.toast('수정 이력은 잠금을 푼 뒤에 볼 수 있습니다');
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

  /* ───────── 수정 이력 ───────── */

  function showHistory() {
    var back = el('pinBackdrop'), body = el('pinBody');
    body.innerHTML = '<h3>수정 이력</h3><p class="sub">불러오는 중…</p>';
    back.classList.add('open');
    S.history().then(function (rows) {
      if (!rows.length) {
        body.innerHTML = '<h3>수정 이력</h3><p class="empty-note">아직 수정한 내역이 없습니다.</p>';
        return;
      }
      body.innerHTML = '<h3>수정 이력</h3><p class="sub">최근 ' + rows.length + '건</p>' +
        '<div class="hist"><table><thead><tr><th>시각</th><th>구분</th><th>대상</th><th>바뀐 값</th><th>사람</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(r.at) + '</td><td>' + esc(r.kind) + '</td><td>' + esc(r.key) +
                 '</td><td class="v">' + esc(shorten(r.after)) + '</td><td>' + esc(r.who || '-') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }).catch(function (err) {
      body.innerHTML = '<h3>수정 이력</h3><p class="empty-note">' + esc(err.message) + '</p>';
    });
  }

  function shorten(s) {
    s = String(s || '');
    return s.length > 90 ? s.slice(0, 90) + '…' : s;
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
