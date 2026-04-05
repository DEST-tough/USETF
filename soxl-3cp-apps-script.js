// ══════════════════════════════════════════════════════════════
// SOXL 3종가 매매법 — Google Apps Script
// ══════════════════════════════════════════════════════════════
// 설치:
//   1. Google Sheets 새 파일 생성
//   2. 확장프로그램 → Apps Script → 이 코드 붙여넣기
//   3. 저장 → 배포 → 새 배포 → 웹앱 → 액세스: 모든 사용자
//   4. 생성된 URL을 Cloudflare 환경변수 GS_URL_SOXL 에 등록
// ══════════════════════════════════════════════════════════════

var SHEET_SETTINGS  = 'soxl-3cp-settings';
var SHEET_TRADES    = 'soxl-3cp-trades';
var SHEET_SNAPSHOTS = 'soxl-3cp-snapshots';

// ── 시트 초기화 ──────────────────────────────────────────────
function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // settings 시트
  var st = ss.getSheetByName(SHEET_SETTINGS);
  if (!st) {
    st = ss.insertSheet(SHEET_SETTINGS);
    st.getRange('A1:B1').setValues([['key', 'value']]);
    // 기본값 설정
    var defaults = [
      ['capital',        '100000'],
      ['cash',           '100000'],
      ['cycle_is_bull',  'true'],
      ['filled_slots',   '0'],
      ['price_a',        ''],
      ['price_b',        ''],
      ['bh_start_price', ''],
      ['bh_start_date',  ''],
      ['created_at',     new Date().toISOString()],
    ];
    st.getRange(2, 1, defaults.length, 2).setValues(defaults);
  }

  // trades 시트
  var tr = ss.getSheetByName(SHEET_TRADES);
  if (!tr) {
    tr = ss.insertSheet(SHEET_TRADES);
    tr.getRange('A1:I1').setValues([[
      'id', 'date', 'type', 'price', 'shares',
      'cash_after', 'slot_num', 'cycle_bull', 'note'
    ]]);
  }

  // snapshots 시트
  var sn = ss.getSheetByName(SHEET_SNAPSHOTS);
  if (!sn) {
    sn = ss.insertSheet(SHEET_SNAPSHOTS);
    sn.getRange('A1:F1').setValues([[
      'date', 'portfolio_val', 'cash', 'soxl_val', 'bh_val', 'slots'
    ]]);
  }
}

// ── settings 읽기/쓰기 헬퍼 ──────────────────────────────────
function readSettings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_SETTINGS);
  if (!sh) return {};
  var data = sh.getDataRange().getValues();
  var result = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) result[data[i][0]] = data[i][1];
  }
  return result;
}

function writeSettings(sh, updates) {
  var data = sh.getDataRange().getValues();
  for (var key in updates) {
    var found = false;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sh.getRange(i + 1, 2).setValue(updates[key]);
        found = true;
        break;
      }
    }
    if (!found) {
      sh.appendRow([key, updates[key]]);
    }
  }
}

// ── trades 헬퍼 ──────────────────────────────────────────────
function getTrades(limit) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_TRADES);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  var rows = data.slice(1); // 헤더 제외
  if (limit) rows = rows.slice(-limit); // 최근 N건
  return rows.map(function(r) {
    return {
      id:         r[0],
      date:       r[1],
      type:       r[2],
      price:      r[3],
      shares:     r[4],
      cash_after: r[5],
      slot_num:   r[6],
      cycle_bull: r[7],
      note:       r[8]
    };
  }).reverse(); // 최신순
}

function addTrade(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_TRADES);
  if (!sh) return false;
  var lastRow = sh.getLastRow();
  var id = lastRow; // 헤더 포함이므로 1행=헤더, id는 lastRow
  sh.appendRow([
    id,
    data.date       || new Date().toISOString().slice(0,10),
    data.type       || '',   // 'buy' or 'sell'
    data.price      || 0,
    data.shares     || 0,
    data.cash_after || 0,
    data.slot_num   || 0,
    data.cycle_bull !== undefined ? data.cycle_bull : true,
    data.note       || ''
  ]);
  return id;
}

// ── snapshots 헬퍼 ───────────────────────────────────────────
function getSnapshots() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_SNAPSHOTS);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(function(r) {
    return {
      date:          r[0],
      portfolio_val: r[1],
      cash:          r[2],
      soxl_val:      r[3],
      bh_val:        r[4],
      slots:         r[5]
    };
  });
}

function addSnapshot(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_SNAPSHOTS);
  if (!sh) return false;

  // 같은 날짜 스냅샷이 있으면 업데이트
  var existing = sh.getDataRange().getValues();
  for (var i = 1; i < existing.length; i++) {
    if (existing[i][0] === data.date) {
      sh.getRange(i + 1, 1, 1, 6).setValues([[
        data.date,
        data.portfolio_val || 0,
        data.cash          || 0,
        data.soxl_val      || 0,
        data.bh_val        || 0,
        data.slots         || 0
      ]]);
      return true;
    }
  }
  // 없으면 추가
  sh.appendRow([
    data.date          || new Date().toISOString().slice(0,10),
    data.portfolio_val || 0,
    data.cash          || 0,
    data.soxl_val      || 0,
    data.bh_val        || 0,
    data.slots         || 0
  ]);
  return true;
}

// ── CORS 헤더 ─────────────────────────────────────────────────
function makeResp(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════
// GET 핸들러
// ══════════════════════════════════════════════════════════════
function doGet(e) {
  try {
    initSheets();
    var action = (e.parameter && e.parameter.action) || 'read';

    // ── 기본 읽기: settings + 최근 trades 20건 + 전체 snapshots
    if (action === 'read') {
      var raw = readSettings();
      return makeResp({
        ok: true,
        data: {
          settings: {
            capital:        parseFloat(raw.capital)       || 100000,
            cash:           parseFloat(raw.cash)          || 100000,
            cycle_is_bull:  raw.cycle_is_bull === 'true',
            filled_slots:   parseInt(raw.filled_slots)    || 0,
            price_a:        parseFloat(raw.price_a)       || 0,
            price_b:        parseFloat(raw.price_b)       || 0,
            bh_start_price: parseFloat(raw.bh_start_price)|| 0,
            bh_start_date:  raw.bh_start_date             || '',
            created_at:     raw.created_at                || '',
          },
          trades:    getTrades(20),
          snapshots: getSnapshots()
        }
      });
    }

    // ── 거래 이력 전체
    if (action === 'getTrades') {
      return makeResp({ ok: true, data: getTrades() });
    }

    // ── 스냅샷 전체
    if (action === 'getSnapshots') {
      return makeResp({ ok: true, data: getSnapshots() });
    }

    return makeResp({ ok: false, error: 'unknown action: ' + action });

  } catch(err) {
    return makeResp({ ok: false, error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════
// POST 핸들러
// ══════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    initSheets();
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── settings 저장
    if (action === 'saveSettings') {
      var sh = ss.getSheetByName(SHEET_SETTINGS);
      var allowed = [
        'capital', 'cash', 'cycle_is_bull', 'filled_slots',
        'price_a', 'price_b', 'bh_start_price', 'bh_start_date'
      ];
      var updates = {};
      allowed.forEach(function(k) {
        if (body[k] !== undefined) updates[k] = String(body[k]);
      });
      writeSettings(sh, updates);
      return makeResp({ ok: true });
    }

    // ── 거래 추가 (매수/매도)
    if (action === 'addTrade') {
      var id = addTrade(body);

      // 거래 후 settings 자동 업데이트
      var sh = ss.getSheetByName(SHEET_SETTINGS);
      var upd = {};
      if (body.cash_after  !== undefined) upd.cash         = String(body.cash_after);
      if (body.filled_slots !== undefined) upd.filled_slots = String(body.filled_slots);
      if (body.cycle_bull   !== undefined) upd.cycle_is_bull= String(body.cycle_bull);
      // 매도 시 슬롯 리셋
      if (body.type === 'sell') {
        upd.filled_slots  = '0';
        upd.cycle_is_bull = 'true'; // 리셋 (다음 매수 시 재결정)
      }
      if (Object.keys(upd).length) writeSettings(sh, upd);

      return makeResp({ ok: true, id: id });
    }

    // ── 스냅샷 추가/업데이트
    if (action === 'addSnapshot') {
      addSnapshot(body);
      return makeResp({ ok: true });
    }

    // ── 초기 설정 (최초 1회: 자본금 + BH 시작가 설정)
    if (action === 'init') {
      var sh = ss.getSheetByName(SHEET_SETTINGS);
      writeSettings(sh, {
        capital:        String(body.capital        || 100000),
        cash:           String(body.capital        || 100000),
        bh_start_price: String(body.bh_start_price || 0),
        bh_start_date:  String(body.bh_start_date  || ''),
        filled_slots:   '0',
        cycle_is_bull:  'true',
        created_at:     new Date().toISOString()
      });
      return makeResp({ ok: true });
    }

    return makeResp({ ok: false, error: 'unknown action: ' + action });

  } catch(err) {
    return makeResp({ ok: false, error: err.message });
  }
}
