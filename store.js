/* 청량리역 요진 와이시티 — 옵션표 공용 부품
   ① 구글시트에 저장된 "수정 내역"을 불러와 원본 위에 덮어씌웁니다.
   ② 수정하려면 비밀번호를 한 번 넣습니다. (보기는 아무나)
   ③ 서버 주소가 없거나 서버가 죽어도 원본 그대로 잘 보입니다. */
(function () {
  'use strict';

  var CFG = window.WYC_CONFIG || {};
  var RAW = String(CFG.apiUrl || '');
  var API = (RAW && RAW.indexOf('여기에') < 0 && RAW.indexOf('PASTE') < 0) ? RAW : '';

  var S = {
    api: API,
    apiReady: !!API,
    online: false,          // 서버와 실제로 통신이 됐는지
    changes: {},            // "구분|키" -> {val, at, who}
    pin: '',                // 수정 잠금 해제된 상태면 값이 들어 있음
    who: '',
    lastError: ''
  };

  /* ---------- 작은 도구들 ---------- */

  function qs(o) {
    return Object.keys(o).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]);
    }).join('&');
  }

  function get(params) {
    if (!S.api) return Promise.reject(new Error('서버 주소가 아직 설정되지 않았습니다.'));
    return fetch(S.api + '?' + qs(params), { method: 'GET' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.ok !== true) throw new Error((j && j.error) || '서버가 응답하지 않습니다.');
        return j;
      });
  }

  function post(action, body) {
    if (!S.api) return Promise.reject(new Error('서버 주소가 아직 설정되지 않았습니다.'));
    // Apps Script 는 text/plain 으로 보내야 사전 확인(preflight) 없이 통과합니다.
    return fetch(S.api + '?action=' + encodeURIComponent(action), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.ok !== true) throw new Error((j && j.error) || '저장하지 못했습니다.');
        return j;
      });
  }

  /* ---------- 수정 내역 불러오기 ---------- */

  S.load = function (fresh) {
    if (!S.api) { S.online = false; return Promise.resolve(S.changes); }
    return get(fresh ? { action: 'state', fresh: '1' } : { action: 'state' })
      .then(function (j) {
        S.changes = j.changes || {};
        S.online = true;
        S.lastError = '';
        return S.changes;
      })
      .catch(function (err) {
        S.online = false;
        S.lastError = err.message;
        return S.changes;
      });
  };

  S.get = function (kind, key) {
    var hit = S.changes[kind + '|' + key];
    return hit ? hit.val : null;
  };

  S.info = function (kind, key) {
    return S.changes[kind + '|' + key] || null;
  };

  S.edited = function (kind, key) {
    return !!S.changes[kind + '|' + key];
  };

  S.countEdited = function (kind) {
    var n = 0;
    for (var k in S.changes) if (k.indexOf(kind + '|') === 0) n++;
    return n;
  };

  /* ---------- 수정 잠금 ---------- */

  S.unlocked = function () { return !!S.pin; };

  S.unlock = function (pin, who) {
    return get({ action: 'checkPin', pin: pin }).then(function () {
      S.pin = String(pin);
      S.who = who || S.who || '';
      try {
        sessionStorage.setItem('wyc_pin', S.pin);
        if (S.who) localStorage.setItem('wyc_who', S.who);
      } catch (e) {}
      return true;
    });
  };

  S.lock = function () {
    S.pin = '';
    try { sessionStorage.removeItem('wyc_pin'); } catch (e) {}
  };

  S.restore = function () {
    try {
      S.who = localStorage.getItem('wyc_who') || '';
      var p = sessionStorage.getItem('wyc_pin');
      if (p) { S.pin = p; return true; }
    } catch (e) {}
    return false;
  };

  /* ---------- 저장 ---------- */

  S.save = function (kind, key, value) {
    if (!S.pin) return Promise.reject(new Error('먼저 수정 잠금을 풀어주세요.'));
    return post('save', { pin: S.pin, kind: kind, key: key, value: value, who: S.who })
      .then(function (j) {
        S.changes[kind + '|' + key] = { val: value, at: j.at || '', who: S.who };
        return j;
      });
  };

  S.reset = function (kind, key) {
    if (!S.pin) return Promise.reject(new Error('먼저 수정 잠금을 풀어주세요.'));
    return post('reset', { pin: S.pin, kind: kind, key: key, who: S.who })
      .then(function (j) {
        delete S.changes[kind + '|' + key];
        return j;
      });
  };

  S.history = function () {
    if (!S.pin) return Promise.reject(new Error('먼저 수정 잠금을 풀어주세요.'));
    return get({ action: 'history', pin: S.pin }).then(function (j) { return j.rows || []; });
  };

  /* ---------- 알림 띠 ---------- */

  S.toast = function (msg, kind) {
    var el = document.getElementById('wycToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wycToast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'wyc-toast show' + (kind ? ' ' + kind : '');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.className = 'wyc-toast'; }, 2600);
  };

  window.WYCStore = S;
})();
