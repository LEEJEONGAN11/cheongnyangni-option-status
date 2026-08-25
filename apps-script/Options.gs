/**
 * 청량리역 요진 와이시티 — 옵션표 수정 저장용 서버
 *
 * 하는 일은 딱 하나입니다: "원본에서 무엇을 바꿨는지"만 구글시트에 적어둡니다.
 * 원본 데이터(155세대 옵션·전기옵션)는 사이트 안에 들어 있어서,
 * 이 서버가 없어도 사이트는 그냥 열립니다. 다만 수정은 안 됩니다.
 *
 * AS(하자보수) 시스템과는 완전히 별개입니다. 서로 건드리지 않습니다.
 *
 * ── 처음 한 번만 하면 되는 준비 ─────────────────────────────
 *  1) 구글시트를 새로 하나 만들고 주소(https://docs.google.com/spreadsheets/d/여기/edit)에서
 *     가운데 긴 문자열(시트 ID)을 복사합니다.
 *  2) 아래 setup() 안의 두 줄에 시트 ID와 수정용 비밀번호를 넣고 setup() 을 한 번 실행합니다.
 *  3) 배포 → 새 배포 → 웹 앱 → 실행 사용자: 나 / 액세스 권한: 모든 사용자 → 배포
 *  4) 나온 주소를 사이트의 config.js 에 붙여넣습니다.
 * ─────────────────────────────────────────────────────────
 */

var SCHEMA_VERSION = 1;

var SHEET_CHANGES = '수정값';
var SHEET_LOG = '이력';
var HEAD_CHANGES = ['구분', '키', '값', '수정일시', '수정자'];
var HEAD_LOG = ['시각', '구분', '키', '이전값', '새값', '수정자'];

/** 처음 한 번만 실행하세요. 값 두 개를 채운 뒤 ▶ 실행 */
function setup() {
  var 시트ID = '여기에_구글시트_ID를_붙여넣으세요';
  var 수정비밀번호 = '0000';           // 숫자 4~8자리를 권장합니다

  if (시트ID.indexOf('여기에') === 0) {
    throw new Error('setup() 안의 시트ID 와 수정비밀번호를 먼저 채워주세요.');
  }
  var p = PropertiesService.getScriptProperties();
  p.setProperty('SHEET_ID', 시트ID);
  p.setProperty('EDIT_PIN', String(수정비밀번호));
  ensureSheets_();
  Logger.log('준비 완료. 이제 배포 → 새 배포 → 웹 앱 으로 배포하세요.');
}

/** 비밀번호만 바꾸고 싶을 때 */
function 비밀번호바꾸기() {
  var 새비밀번호 = '0000';
  PropertiesService.getScriptProperties().setProperty('EDIT_PIN', String(새비밀번호));
  Logger.log('비밀번호를 바꿨습니다.');
}

/* ───────────────────────── 내부 도구 ───────────────────────── */

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

function book_() {
  var id = prop_('SHEET_ID');
  if (!id) throw new Error('setup() 을 아직 실행하지 않았습니다.');
  return SpreadsheetApp.openById(id);
}

function sheet_(name, head) {
  var ss = book_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureSheets_() {
  sheet_(SHEET_CHANGES, HEAD_CHANGES);
  sheet_(SHEET_LOG, HEAD_LOG);
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}

function out_(obj) {
  obj.v = SCHEMA_VERSION;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkPin_(pin) {
  var real = prop_('EDIT_PIN');
  if (!real) throw new Error('서버에 수정 비밀번호가 설정되지 않았습니다. setup() 을 실행해주세요.');
  if (String(pin || '') !== String(real)) throw new Error('수정 비밀번호가 올바르지 않습니다.');
}

/** 수정값 시트를 통째로 읽어 { "구분|키": 값 } 으로 돌려줍니다. */
function readChanges_() {
  var sh = sheet_(SHEET_CHANGES, HEAD_CHANGES);
  var last = sh.getLastRow();
  var map = {};
  if (last < 2) return map;
  var rows = sh.getRange(2, 1, last - 1, HEAD_CHANGES.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    var kind = String(rows[i][0] || '');
    var key = String(rows[i][1] || '');
    if (!kind || !key) continue;
    var raw = rows[i][2];
    var val;
    try { val = JSON.parse(raw); } catch (e) { val = raw; }
    map[kind + '|' + key] = { val: val, at: String(rows[i][3] || ''), who: String(rows[i][4] || '') };
  }
  return map;
}

function findRow_(sh, kind, key) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var rows = sh.getRange(2, 1, last - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(kind) && String(rows[i][1]) === String(key)) return i + 2;
  }
  return -1;
}

function log_(kind, key, before, after, who) {
  var sh = sheet_(SHEET_LOG, HEAD_LOG);
  sh.appendRow([now_(), kind, key,
                before === null || before === undefined ? '' : JSON.stringify(before),
                after === null || after === undefined ? '' : JSON.stringify(after),
                who || '']);
}

/* ───────────────────────── 요청 처리 ───────────────────────── */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    var action = p.action || 'state';
    if (action === 'ping') return out_({ ok: true });

    if (action === 'state') {
      var cache = CacheService.getScriptCache();
      var hit = cache.get('state');
      if (hit && p.fresh !== '1') {
        return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
      }
      var body = JSON.stringify({ ok: true, v: SCHEMA_VERSION, changes: readChanges_() });
      cache.put('state', body, 20);
      return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'history') {
      checkPin_(p.pin);
      var sh = sheet_(SHEET_LOG, HEAD_LOG);
      var last = sh.getLastRow();
      var rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, HEAD_LOG.length).getValues();
      rows = rows.slice(-200).reverse().map(function (r) {
        return { at: String(r[0]), kind: String(r[1]), key: String(r[2]),
                 before: String(r[3]), after: String(r[4]), who: String(r[5]) };
      });
      return out_({ ok: true, rows: rows });
    }

    if (action === 'checkPin') {
      checkPin_(p.pin);
      return out_({ ok: true });
    }

    return out_({ ok: false, error: '알 수 없는 요청입니다: ' + action });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { body = {}; }
  var action = (e && e.parameter && e.parameter.action) || body.action || '';

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    checkPin_(body.pin);
    ensureSheets_();

    if (action === 'save') {
      var kind = String(body.kind || '');
      var key = String(body.key || '');
      if (!kind || !key) return out_({ ok: false, error: '무엇을 저장할지가 비어 있습니다.' });

      var sh = sheet_(SHEET_CHANGES, HEAD_CHANGES);
      var row = findRow_(sh, kind, key);
      var before = null;
      if (row > 0) {
        try { before = JSON.parse(sh.getRange(row, 3).getValue()); } catch (x2) { before = null; }
      }
      var line = [kind, key, JSON.stringify(body.value), now_(), String(body.who || '')];
      if (row > 0) sh.getRange(row, 1, 1, HEAD_CHANGES.length).setValues([line]);
      else sh.appendRow(line);

      log_(kind, key, before, body.value, body.who);
      CacheService.getScriptCache().remove('state');
      return out_({ ok: true, at: line[3] });
    }

    if (action === 'reset') {
      var kind2 = String(body.kind || '');
      var key2 = String(body.key || '');
      var sh2 = sheet_(SHEET_CHANGES, HEAD_CHANGES);
      var row2 = findRow_(sh2, kind2, key2);
      if (row2 > 0) {
        var before2 = null;
        try { before2 = JSON.parse(sh2.getRange(row2, 3).getValue()); } catch (x3) { before2 = null; }
        sh2.deleteRow(row2);
        log_(kind2, key2, before2, '(원본으로 되돌림)', body.who);
      }
      CacheService.getScriptCache().remove('state');
      return out_({ ok: true });
    }

    if (action === 'saveMany') {
      var items = body.items || [];
      if (!items.length) return out_({ ok: false, error: '저장할 내용이 없습니다.' });
      var sh3 = sheet_(SHEET_CHANGES, HEAD_CHANGES);
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var r = findRow_(sh3, it.kind, it.key);
        var ln = [String(it.kind), String(it.key), JSON.stringify(it.value), now_(), String(body.who || '')];
        if (r > 0) sh3.getRange(r, 1, 1, HEAD_CHANGES.length).setValues([ln]);
        else sh3.appendRow(ln);
        log_(it.kind, it.key, null, it.value, body.who);
      }
      CacheService.getScriptCache().remove('state');
      return out_({ ok: true, saved: items.length });
    }

    return out_({ ok: false, error: '알 수 없는 요청입니다: ' + action });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (x4) {}
  }
}
