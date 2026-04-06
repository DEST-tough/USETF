// ── 동적파도타기 (동파법) Google Sheets Apps Script ──────────
// 설치 방법:
// 1. Google Sheets 새 스프레드시트 생성
// 2. 상단 메뉴 → 확장 프로그램 → Apps Script
// 3. 이 코드 전체 붙여넣기 (기존 코드 삭제 후)
// 4. 저장(Ctrl+S) → 배포 → 새 배포
// 5. 유형: 웹 앱 / 액세스: 모든 사용자 → 배포
// 6. 생성된 URL을 Cloudflare GS_URL 환경변수에 입력
//
// 시트 구조:
//   [설정]      - 초기자본금, 복리율, 현재투자금 등
//   [슬롯상태]  - 7슬롯 현재 상태
//   [체결내역]  - 매수/매도 체결 기록 (수동 입력)
// ────────────────────────────────────────────────────────────

// ── 시트 이름 상수 ──
var SHEET_CONFIG  = "설정";
var SHEET_SLOTS   = "슬롯상태";
var SHEET_HISTORY = "체결내역";

// ── 시트 초기화 ──
function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // [설정] 시트
  var cfg = ss.getSheetByName(SHEET_CONFIG);
  if (!cfg) {
    cfg = ss.insertSheet(SHEET_CONFIG);
    cfg.getRange("A1:B1").setValues([["key", "value"]]);
    cfg.getRange("A2:B12").setValues([
      ["initial_capital",   1000000],  // 초기자본금
      ["current_capital",   1000000],
      ["profit_reserve",    0],         // 수익 적립금 (이익×20%)
      ["profit_rate",       0.80],      // 이익 복리율
      ["loss_rate",         0.30],      // 손실 복리율
      ["last_renewal_date", ""],        // 마지막 갱신일 YYYY-MM-DD
      ["cycle_start_date",  ""],        // 현재 사이클 시작일
      ["cycle_trade_days",  0],         // 현재 사이클 경과 거래일
      ["current_mode",      "SAFE"],    // 현재 모드
      ["slot_count",        7],
      ["notes",             ""],
      ["cycle_pnl",          0],         // 사이클 누적 손익
    ]);
    cfg.getRange("A1:B1").setFontWeight("bold");
  }

  // [슬롯상태] 시트
  var slots = ss.getSheetByName(SHEET_SLOTS);
  if (!slots) {
    slots = ss.insertSheet(SHEET_SLOTS);
    slots.getRange("A1:H1").setValues([[
      "슬롯ID", "상태", "매수가", "매수일", "진입모드", "수량", "매도목표가", "만료일"
    ]]);
    // S1~S7 빈 행 초기화
    for (var i = 1; i <= 7; i++) {
      slots.appendRow(["S" + i, "EMPTY", "", "", "", "", "", ""]);
    }
    slots.getRange("A1:H1").setFontWeight("bold");
  }

  // [체결내역] 시트
  var hist = ss.getSheetByName(SHEET_HISTORY);
  if (!hist) {
    hist = ss.insertSheet(SHEET_HISTORY);
    hist.getRange("A1:G1").setValues([[
      "날짜", "슬롯ID", "구분", "체결가", "수량", "손익", "메모"
    ]]);
    hist.getRange("A1:G1").setFontWeight("bold");
  }
}

// ── 설정 읽기 헬퍼 ──
function readConfig() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = ss.getSheetByName(SHEET_CONFIG);
  if (!cfg) { initSheets(); cfg = ss.getSheetByName(SHEET_CONFIG); }
  var data = cfg.getDataRange().getValues();
  var result = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) result[data[i][0]] = data[i][1];
  }
  return result;
}

function writeConfig(key, value) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = ss.getSheetByName(SHEET_CONFIG);
  var data = cfg.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      cfg.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  cfg.appendRow([key, value]);
}

// ── 미국 증시 휴장일 (NYSE) ──
var US_HOLIDAYS = {
  '2025-01-01':1,'2025-01-20':1,'2025-02-17':1,'2025-04-18':1,
  '2025-05-26':1,'2025-06-19':1,'2025-07-04':1,'2025-09-01':1,
  '2025-11-27':1,'2025-12-25':1,
  '2026-01-01':1,'2026-01-19':1,'2026-02-16':1,'2026-04-03':1,
  '2026-05-25':1,'2026-06-19':1,'2026-07-03':1,'2026-09-07':1,
  '2026-11-26':1,'2026-12-25':1,
};

function isTradingDay(d) {
  var dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  var str = Utilities.formatDate(d, "America/New_York", "yyyy-MM-dd");
  return !US_HOLIDAYS[str];
}

// ── 거래일 계산 (주말 + 미국 휴장일 제외) ──
function addTradingDays(date, days) {
  var d = new Date(date);
  var added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (isTradingDay(d)) added++;
  }
  return d;
}

// ── 슬롯 읽기 + 자동 계산 ──
function readSlots() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_SLOTS);
  if (!sheet) return [];
  var data  = sheet.getDataRange().getValues();
  var slots = [];
  var needSave = false;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;

    var id         = row[0];
    var status     = row[1] || 'EMPTY';
    var entryPrice = row[2] ? parseFloat(row[2]) : null;
    var entryDate  = row[3] ? new Date(row[3]) : null;
    var entryMode  = row[4] || '';
    var quantity   = row[5] ? parseInt(row[5]) : 0;
    var sellTarget = row[6] ? parseFloat(row[6]) : null;
    var expireDate = row[7] ? new Date(row[7]) : null;

    // HOLDING 상태이고 매도목표가/만료일이 없으면 자동 계산 후 저장
    if (status === 'HOLDING' && entryPrice && entryDate && entryMode) {
      if (!sellTarget) {
        sellTarget = entryMode === 'SAFE'
          ? Math.round(entryPrice * 1.002 * 100) / 100
          : Math.round(entryPrice * 1.025 * 100) / 100;
        sheet.getRange(i + 1, 7).setValue(sellTarget);
        needSave = true;
      }
      if (!expireDate) {
        var maxDays = entryMode === 'SAFE' ? 30 : 7;
        expireDate  = addTradingDays(entryDate, maxDays);
        sheet.getRange(i + 1, 8).setValue(
          Utilities.formatDate(expireDate, "Asia/Seoul", "yyyy-MM-dd")
        );
        needSave = true;
      }
    }

    slots.push({
      id:         id,
      status:     status,
      entryPrice: entryPrice,
      entryDate:  entryDate ? Utilities.formatDate(entryDate, "Asia/Seoul", "yyyy-MM-dd") : "",
      entryMode:  entryMode,
      quantity:   quantity,
      sellTarget: sellTarget,
      expireDate: expireDate ? Utilities.formatDate(expireDate, "Asia/Seoul", "yyyy-MM-dd") : "",
    });
  }
  return slots;
}

// ── 체결내역 읽기 ──
function readHistory(limit) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_HISTORY);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var history = [];
  for (var i = data.length - 1; i >= 1; i--) { // 최신순
    var row = data[i];
    if (!row[0]) continue;
    history.push({
      date:       row[0] ? Utilities.formatDate(new Date(row[0]), "Asia/Seoul", "yyyy-MM-dd") : "",
      slotId:     row[1],
      side:       row[2],  // BUY / SELL / MOC
      price:      row[3] ? parseFloat(row[3]) : 0,
      quantity:   row[4] ? parseInt(row[4]) : 0,
      pnl:        row[5] ? parseFloat(row[5]) : 0,
      memo:       row[6] || "",
    });
    if (limit && history.length >= limit) break;
  }
  return history;
}

// ── 복리 계산 (사이클 손익 기반) ──
function calcRenewal(currentCapital, cyclePnl, profitRate, lossRate, profitReserve) {
  var nextCapital, addedReserve;
  if (cyclePnl >= 0) {
    addedReserve = cyclePnl * (1 - profitRate);  // 이익의 20% 적립
    nextCapital  = currentCapital + cyclePnl * profitRate;
  } else {
    addedReserve = 0;
    nextCapital  = currentCapital + cyclePnl * lossRate;  // 손실의 30%만 차감
  }
  return {
    nextCapital:    Math.round(nextCapital),
    nextReserve:    Math.round(profitReserve + addedReserve),
    addedReserve:   Math.round(addedReserve),
  };
}

// ── 사이클 손익 계산 (사이클 시작일 이후 매도 손익 합산) ──
function calcCyclePnl(cycleStartDate) {
  var history = readHistory(null);
  var startDate = cycleStartDate ? new Date(cycleStartDate) : null;
  var total = 0;
  history.forEach(function(h) {
    if (h.side === 'BUY') return; // 매수는 제외
    if (startDate && new Date(h.date) < startDate) return;
    total += h.pnl;
  });
  return Math.round(total);
}

// ── 수익률 계산 ──
function calcPerformance(initialCapital, currentCapital, profitReserve, history) {
  var totalAsset  = currentCapital + profitReserve;
  var totalPnl    = totalAsset - initialCapital;
  var totalReturn = initialCapital > 0 ? (totalPnl / initialCapital * 100) : 0;

  // 첫 체결일 찾기
  var firstDate = null;
  for (var i = history.length - 1; i >= 0; i--) {
    if (history[i].date) { firstDate = new Date(history[i].date); break; }
  }
  var tradingDays = firstDate ? Math.floor((new Date() - firstDate) / (1000*60*60*24)) : 0;
  var cagr = tradingDays > 0
    ? (Math.pow(totalAsset / initialCapital, 365 / tradingDays) - 1) * 100
    : 0;

  // 승률
  var wins = 0, losses = 0;
  history.forEach(function(h) {
    if (h.side === 'BUY') return;
    if (h.pnl > 0) wins++; else if (h.pnl < 0) losses++;
  });

  return {
    totalPnl:    Math.round(totalPnl),
    totalReturn: Math.round(totalReturn * 100) / 100,
    cagr:        Math.round(cagr * 100) / 100,
    tradingDays: tradingDays,
    wins:        wins,
    losses:      losses,
    winRate:     (wins + losses) > 0 ? Math.round(wins / (wins + losses) * 100) : 0,
  };
}

// ── 누적 자산 추이 (차트용) ──
function buildEquityHistory(initialCapital, history) {
  // 날짜별 누적 손익 계산
  var byDate = {};
  history.slice().reverse().forEach(function(h) {
    if (h.side === 'BUY' || !h.date) return;
    byDate[h.date] = (byDate[h.date] || 0) + h.pnl;
  });

  var dates  = Object.keys(byDate).sort();
  var equity = [initialCapital];
  var labels = ['시작'];
  var running = initialCapital;
  dates.forEach(function(d) {
    running += byDate[d];
    equity.push(Math.round(running));
    labels.push(d.slice(5)); // MM-DD
  });
  return { labels: labels, data: equity };
}

// ── GET 핸들러 ──
function doGet(e) {
  try {
    var action = (e.parameter && e.parameter.action) || "read";

    if (action === "read") {
      var cfg     = readConfig();
      var slots   = readSlots();
      var history = readHistory(50);

      var initCap     = parseFloat(cfg.initial_capital)   || 1000000;
      var curCap      = parseFloat(cfg.current_capital)   || initCap;
      var reserve     = parseFloat(cfg.profit_reserve)    || 0;
      var profitRate  = parseFloat(cfg.profit_rate)       || 0.80;
      var lossRate    = parseFloat(cfg.loss_rate)         || 0.30;
      var lastRenewal = cfg.last_renewal_date             || "";
      var cycleStart  = cfg.cycle_start_date              || "";
      var cycleDays   = parseInt(cfg.cycle_trade_days)    || 0;
      var mode        = cfg.current_mode                  || "SAFE";

      var cyclePnl = calcCyclePnl(cycleStart);
      var renewal  = calcRenewal(curCap, cyclePnl, profitRate, lossRate, reserve);
      var perf     = calcPerformance(initCap, curCap, reserve, history);
      var equity   = buildEquityHistory(initCap, history);

      var result = {
        // 설정
        initialCapital: initCap,
        currentCapital: curCap,
        profitReserve:  reserve,
        profitRate:     profitRate,
        lossRate:       lossRate,
        currentMode:    mode,
        // 복리 사이클
        lastRenewalDate: lastRenewal,
        cycleStartDate:  cycleStart,
        cycleTradeDays:  cycleDays,
        cyclePnl:        cyclePnl,
        // 갱신 예상
        nextCapital:     renewal.nextCapital,
        nextReserve:     renewal.nextReserve,
        addedReserve:    renewal.addedReserve,
        // 수익률
        performance:     perf,
        // 슬롯
        slots:           slots,
        // 체결내역
        history:         history,
        // 차트
        equityChart:     equity,
      };

      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, data: result }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "unknown action" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── POST 핸들러 ──
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || "";

    // 1. 설정값 저장
    if (action === "saveConfig") {
      if (body.initial_capital  !== undefined) writeConfig("initial_capital",   body.initial_capital);
      if (body.current_capital  !== undefined) writeConfig("current_capital",   body.current_capital);
      if (body.profit_reserve   !== undefined) writeConfig("profit_reserve",    body.profit_reserve);
      if (body.profit_rate      !== undefined) writeConfig("profit_rate",       body.profit_rate);
      if (body.loss_rate        !== undefined) writeConfig("loss_rate",         body.loss_rate);
      if (body.current_mode     !== undefined) writeConfig("current_mode",      body.current_mode);
      if (body.last_renewal_date!== undefined) writeConfig("last_renewal_date", body.last_renewal_date);
      if (body.cycle_start_date !== undefined) writeConfig("cycle_start_date",  body.cycle_start_date);
      if (body.cycle_trade_days !== undefined) writeConfig("cycle_trade_days",  body.cycle_trade_days);
      return ok();
    }

    // 2. 슬롯 업데이트
    if (action === "updateSlot") {
      var ss    = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(SHEET_SLOTS);
      var data  = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === body.id) {
          sheet.getRange(i+1, 1, 1, 8).setValues([[
            body.id,
            body.status      || "EMPTY",
            body.entryPrice  || "",
            body.entryDate   || "",
            body.entryMode   || "",
            body.quantity    || "",
            body.sellTarget  || "",
            body.expireDate  || "",
          ]]);
          return ok();
        }
      }
      return err("슬롯 ID를 찾을 수 없음: " + body.id);
    }

    // 3. 복리 갱신 실행
    if (action === "applyRenewal") {
      var cfg       = readConfig();
      var curCap    = parseFloat(cfg.current_capital)  || 1000000;
      var reserve   = parseFloat(cfg.profit_reserve)   || 0;
      var pRate     = parseFloat(cfg.profit_rate)       || 0.80;
      var lRate     = parseFloat(cfg.loss_rate)         || 0.30;
      var cycStart  = cfg.cycle_start_date             || "";
      var cyclePnl  = calcCyclePnl(cycStart);
      var renewal   = calcRenewal(curCap, cyclePnl, pRate, lRate, reserve);

      writeConfig("current_capital",    renewal.nextCapital);
      writeConfig("profit_reserve",     renewal.nextReserve);
      writeConfig("last_renewal_date",  Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd"));
      writeConfig("cycle_start_date",   Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd"));
      writeConfig("cycle_trade_days",   0);
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: true,
          nextCapital: renewal.nextCapital,
          nextReserve: renewal.nextReserve,
          cyclePnl:    cyclePnl,
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return err("unknown action: " + action);

  } catch(e2) {
    return err(e2.message);
  }
}

function ok()    { return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON); }
function err(msg){ return ContentService.createTextOutput(JSON.stringify({ok:false,error:msg})).setMimeType(ContentService.MimeType.JSON); }

// ── onEdit 트리거 (체결내역 입력 시 자동 처리) ──────────────
function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  if (sheet.getName() !== SHEET_HISTORY) return;

  var row = e.range.getRow();
  if (row <= 1) return; // 헤더 제외

  var data = sheet.getRange(row, 1, 1, 7).getValues()[0];
  var date    = data[0];
  var slotId  = data[1];
  var side    = data[2];
  var price   = parseFloat(data[3]);
  var qty     = parseInt(data[4]);

  if (!date || !slotId || !side || !price || !qty) return;

  var dateStr = Utilities.formatDate(new Date(date), "Asia/Seoul", "yyyy-MM-dd");

  if (side === 'BUY') {
    onBuyFilled(dateStr, slotId, price, qty);
  } else if (side === 'SELL' || side === 'MOC') {
    onSellFilled(dateStr, slotId, price, qty, side, row);
  }
}

// ── 매수 체결 처리 ──
function onBuyFilled(date, slotId, price, qty) {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var slots  = ss.getSheetByName(SHEET_SLOTS);
  var cfg    = readConfig();
  var mode   = cfg.current_mode || 'SAFE';

  // 매도목표가 계산
  var sellTarget = mode === 'SAFE'
    ? Math.round(price * 1.002 * 100) / 100
    : Math.round(price * 1.025 * 100) / 100;

  // 만료일 계산
  var maxDays   = mode === 'SAFE' ? 30 : 7;
  var expireD   = addTradingDays(new Date(date), maxDays);
  var expireStr = Utilities.formatDate(expireD, "Asia/Seoul", "yyyy-MM-dd");

  // 슬롯상태 업데이트
  var data = slots.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === slotId) {
      slots.getRange(i+1, 1, 1, 8).setValues([[
        slotId, 'HOLDING', price, date, mode, qty, sellTarget, expireStr
      ]]);
      break;
    }
  }

  // 사이클 시작일 설정 (첫 매수 시)
  var cfg2 = readConfig();
  if (!cfg2.cycle_start_date) {
    writeConfig('cycle_start_date', date);
  }

  // 체결내역 손익 0 자동입력
  updateHistoryPnl(date, slotId, 'BUY', 0);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    slotId + ' 매수 처리 완료 → 매도목표 $' + sellTarget + ' / 만료 ' + expireStr,
    '✅ 자동처리', 4
  );
}

// ── 매도 체결 처리 ──
function onSellFilled(date, slotId, price, qty, side, histRow) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var slots = ss.getSheetByName(SHEET_SLOTS);

  // 슬롯에서 매수가 찾기
  var slotData  = slots.getDataRange().getValues();
  var entryPrice = null;
  var entryQty   = null;
  for (var i = 1; i < slotData.length; i++) {
    if (slotData[i][0] === slotId && slotData[i][1] === 'HOLDING') {
      entryPrice = parseFloat(slotData[i][2]);
      entryQty   = parseInt(slotData[i][5]);
      break;
    }
  }

  // 손익 계산
  var pnl = entryPrice
    ? Math.round((price - entryPrice) * qty * 100) / 100
    : 0;

  // 체결내역 손익 자동입력
  var hist = ss.getSheetByName(SHEET_HISTORY);
  hist.getRange(histRow, 6).setValue(pnl);

  // 슬롯상태 EMPTY로 초기화
  for (var j = 1; j < slotData.length; j++) {
    if (slotData[j][0] === slotId) {
      slots.getRange(j+1, 1, 1, 8).setValues([[
        slotId, 'EMPTY', '', '', '', '', '', ''
      ]]);
      break;
    }
  }

  // 사이클 손익 누계 업데이트 (설정 시트)
  var cfg = readConfig();
  var curPnl = parseFloat(cfg.cycle_pnl) || 0;
  writeConfig('cycle_pnl', Math.round((curPnl + pnl) * 100) / 100);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    slotId + ' 매도 처리 완료 → 손익 $' + pnl + ' / 슬롯 EMPTY',
    '✅ 자동처리', 4
  );
}

// ── 체결내역 손익 업데이트 헬퍼 ──
function updateHistoryPnl(date, slotId, side, pnl) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hist = ss.getSheetByName(SHEET_HISTORY);
  var data = hist.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    var d = data[i][0] ? Utilities.formatDate(new Date(data[i][0]), "Asia/Seoul", "yyyy-MM-dd") : '';
    if (d === date && data[i][1] === slotId && data[i][2] === side) {
      hist.getRange(i+1, 6).setValue(pnl);
      return;
    }
  }
}
