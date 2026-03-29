// ── TOSS 대시보드 Google Sheets 동기화 ──────────────────────
// 설치 방법:
// 1. Google Sheets 새 시트 생성
// 2. 상단 메뉴 → 확장 프로그램 → Apps Script
// 3. 이 코드 전체 붙여넣기 (기존 코드 삭제 후)
// 4. 저장(Ctrl+S) → 배포 → 새 배포
// 5. 유형: 웹 앱 / 액세스: 모든 사용자 → 배포
// 6. 생성된 URL을 대시보드 HTML의 GS_URL에 입력

var SHEET_NAME = "toss-dashboard";

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    // 헤더 초기화
    sh.getRange("A1:B1").setValues([["key", "value"]]);
  }
  return sh;
}

// key-value 방식으로 저장
function readAll() {
  var sh = getSheet();
  var data = sh.getDataRange().getValues();
  var result = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) result[data[i][0]] = data[i][1];
  }
  return result;
}

function writeKey(sh, key, value) {
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  // 없으면 새 행 추가
  sh.appendRow([key, value]);
}

// ── GET 핸들러 (읽기) ────────────────────────────────────────
function doGet(e) {
  try {
    var action = e.parameter.action || "read";

    if (action === "read") {
      var raw = readAll();
      var result = {
        quantities:   raw.quantities   ? JSON.parse(raw.quantities)   : {},
        prices:       raw.prices       ? JSON.parse(raw.prices)       : {},
        dca:          raw.dca          ? parseFloat(raw.dca)          : 200,
        dividendsYtd: raw.dividendsYtd ? parseFloat(raw.dividendsYtd): 0,
        qqqDD:        raw.qqqDD        ? parseFloat(raw.qqqDD)        : 8,
        vix:          raw.vix          ? parseFloat(raw.vix)          : 18,
        vixRising:    raw.vixRising    ? raw.vixRising === "true"     : false,
        mom:          raw.mom          ? parseFloat(raw.mom)          : 2,
        below200:     raw.below200 === "true",
        manualRS:     raw.manualRS && raw.manualRS !== "null" ? parseInt(raw.manualRS) : null,
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

// ── POST 핸들러 (저장) ───────────────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var sh   = getSheet();

    if (body.below200 !== undefined)
      writeKey(sh, "below200", String(body.below200));
    if (body.quantities !== undefined)
      writeKey(sh, "quantities", JSON.stringify(body.quantities));
    if (body.prices !== undefined)
      writeKey(sh, "prices", JSON.stringify(body.prices));
    if (body.dca !== undefined)
      writeKey(sh, "dca", body.dca);
    if (body.dividendsYtd !== undefined)
      writeKey(sh, "dividendsYtd", body.dividendsYtd);
    if (body.qqqDD !== undefined)
      writeKey(sh, "qqqDD", body.qqqDD);
    if (body.vix !== undefined)
      writeKey(sh, "vix", body.vix);
    if (body.vixRising !== undefined)
      writeKey(sh, "vixRising", String(body.vixRising));
    if (body.mom !== undefined)
      writeKey(sh, "mom", body.mom);
    if (body.manualRS !== undefined)
      writeKey(sh, "manualRS", body.manualRS === null ? "null" : String(body.manualRS));

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
