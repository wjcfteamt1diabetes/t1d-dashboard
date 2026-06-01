// T1D Program Dashboard — Apps Script aggregation endpoint
// Deploy as: Web app · Execute as Me · Access Anyone
// Version control: edit here, then Manage deployments → new version in Apps Script UI

const WB1_ID = '1cgMB5RIomWGSw_cQfmFkxx3qfBXlXxIL9fR4FzFuwIg'; // T1D_Data_Claude_Sheet1_v1
const WB2_ID = '1zObGfUcDOszt82v9V65OAK7yV5McXzeusFx5XqU_d6M'; // T1D_Data_Claude_Sheet2_v1
const CACHE_KEY = 't1d_payload_v1';
const CACHE_SECONDS = 600; // 10 min

function doGet(e) {
  var cache = CacheService.getScriptCache();
  var json = cache.get(CACHE_KEY);
  if (!json || (e && e.parameter && e.parameter.fresh === '1')) {
    json = JSON.stringify(buildPayload());
    cache.put(CACHE_KEY, json, CACHE_SECONDS);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ─── PHASE 1: hardcoded mock payload (same numbers as the original HTML) ───
// Replace this with real aggregation in Phase 2.
function buildPayload() {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      n: 2216,
      schemaVersion: '1.1'
    },

    // Per-state aggregates. target now reads from Targets sheet (corrected from 3080).
    states: {
      all: {
        states:4, dist:46, plan:58, op:56, csOp:38, ltOp:18,
        enr:2216, target:5954, csEnr:1647, ltEnr:569,
        active:1950, inactive:215, nonSurviving:51,
        newLast:51, newPrev:96, avgClin:0.9,
        insBase:44, insLast:96,
        hbTest:38, hbDec:61, hbDecN:843,
        dka:8, hypo:11,
        drBat:11, drTr:387, drPre:62, drPost:81,
        nrBat:4,  nrTr:60,  nrPre:79, nrPost:87,
        flwSes:73, flwHr:12817, flwDist:15, flwTotDist:46
      },
      RJ: {
        states:1, dist:18, plan:24, op:23, csOp:14, ltOp:9,
        enr:810, target:4000, csEnr:520, ltEnr:290,
        active:712, inactive:79, nonSurviving:19,
        newLast:18, newPrev:38, avgClin:0.8,
        insBase:41, insLast:94,
        hbTest:35, hbDec:58, hbDecN:312,
        dka:9, hypo:12,
        drBat:4, drTr:142, drPre:60, drPost:79,
        nrBat:2, nrTr:22,  nrPre:77, nrPost:85,
        flwSes:28, flwHr:4820, flwDist:6, flwTotDist:18
      },
      MP: {
        states:1, dist:14, plan:18, op:17, csOp:17, ltOp:0,
        enr:712, target:1082, csEnr:712, ltEnr:0,
        active:626, inactive:69, nonSurviving:17,
        newLast:16, newPrev:31, avgClin:0.9,
        insBase:46, insLast:97,
        hbTest:40, hbDec:63, hbDecN:268,
        dka:7, hypo:10,
        drBat:3, drTr:118, drPre:64, drPost:82,
        nrBat:1, nrTr:20,  nrPre:81, nrPost:89,
        flwSes:22, flwHr:3800, flwDist:5, flwTotDist:14
      },
      UK: {
        states:1, dist:8, plan:10, op:10, csOp:5, ltOp:5,
        enr:380, target:602, csEnr:210, ltEnr:170,
        active:334, inactive:37, nonSurviving:9,
        newLast:10, newPrev:16, avgClin:1.0,
        insBase:43, insLast:96,
        hbTest:37, hbDec:60, hbDecN:148,
        dka:8, hypo:11,
        drBat:2, drTr:74,  drPre:61, drPost:80,
        nrBat:1, nrTr:10,  nrPre:78, nrPost:86,
        flwSes:14, flwHr:2200, flwDist:3, flwTotDist:8
      },
      CG: {
        states:1, dist:6, plan:6, op:6, csOp:6, ltOp:0,
        enr:314, target:270, csEnr:314, ltEnr:0,
        active:278, inactive:30, nonSurviving:6,
        newLast:7, newPrev:11, avgClin:1.2,
        insBase:47, insLast:97,
        hbTest:42, hbDec:66, hbDecN:115,
        dka:6, hypo:9,
        drBat:2, drTr:53,  drPre:65, drPost:83,
        nrBat:1, nrTr:8,   nrPre:80, nrPost:90,
        flwSes:9, flwHr:1997, flwDist:1, flwTotDist:6
      }
    },

    series: {
      months:    ['Jan 25','Feb 25','Mar 25','Apr 25','May 25','Jun 25','Jul 25','Aug 25','Sep 25','Oct 25','Nov 25','Dec 25','Jan 26','Feb 26','Mar 26','Apr 26','May 26'],
      csCum:     [152,216,318,370,540,638,704,762,804,862,914,980,1034,1090,1140,1186,1221],
      ltCum:     [65,79,95,107,146,160,174,176,179,185,190,196,200,206,214,232,237],
      clin:      [17,19,22,26,32,35,42,44,47,49,50,52,52,54,55,56,56],
      newEnrCs:  [58,45,102,80,134,107,100,118,86,108,68,80,72,61,72,34,0],
      newEnrLt:  [26,21,48,34,57,43,46,61,47,57,31,33,39,35,37,17,0],
      avgCl:     [4.9,3.5,6.8,4.4,5.9,4.3,3.5,4.1,2.8,3.4,2.0,2.2,2.1,1.8,2.0,0.9,0]
    },

    followup: {
      mom: [
        {m:'May 26',v:25,n:1843},{m:'Apr 26',v:49,n:1987},{m:'Mar 26',v:42,n:1893},
        {m:'Feb 26',v:48,n:1764},{m:'Jan 26',v:50,n:1580},{m:'Dec 25',v:46,n:1469},
        {m:'Nov 25',v:40,n:1372}
      ]
    },

    smbg: {
      mom: [
        {m:'Apr 26',v:[25,54,12,9],n:1512},{m:'Mar 26',v:[25,43,18,14],n:1398},
        {m:'Feb 26',v:[21,42,21,16],n:1244},{m:'Jan 26',v:[20,48,19,13],n:1108},
        {m:'Dec 25',v:[27,51,17,5],n:1002},{m:'Nov 25',v:[30,43,19,8],n:889}
      ],
      last: {m:'May 26',v:[25,55,12,8],n:911}
    },

    glycemia: {
      months:    [{m:'May 26',n:943},{m:'Apr 26',n:891},{m:'Mar 26',n:824}],
      hyperDist: [[22,31,27,13,7],[20,29,28,15,8],[18,28,30,16,8]],
      hypoDist:  [[63,20,10,5,2],[60,22,11,5,2],[62,21,10,5,2]]
    },

    clinicOps: {
      months:        ['Oct 25','Nov 25','Dec 25','Jan 26','Feb 26','Mar 26','Apr 26','May 26'],
      functionalPct: [75,78,72,80,78,82,84,82],
      offDays:       [[35,25,20,10],[38,28,18,8],[32,30,20,10],[40,27,18,8],[38,29,19,7],[42,28,17,6],[44,27,16,6],[43,27,17,6]]
    },

    trainedStaff: [
      {lbl:'With trained Pediatrician',    v:72},
      {lbl:'With trained MD Medicine',     v:65},
      {lbl:'With trained MO',              v:45},
      {lbl:'With Paed + MD Medicine both', v:58}
    ],

    hba1c: {
      changeLabels: [
        ['Overall','(n=77)'],['3–6 months','(n=27)'],['6–9 months','(n=24)'],
        ['9–12 months','(n=21)'],['12–15 months','(n=14)'],['15–18 months','(n=10)'],['>18 months','(n=5)']
      ],
      changeN:    [77,27,24,21,14,10,5],
      improved4:  [14,0,4,5,8,12,18],
      improved2:  [3,19,13,14,18,22,26],
      improvedL:  [38,41,33,38,34,30,26],
      noChange:   [5,7,4,5,5,4,4],
      worsenedL:  [35,26,42,33,28,24,20],
      worsened2:  [3,4,0,0,4,5,4],
      worsened4:  [3,4,4,5,3,3,2],
      avgBaseline:[9.2,9.2,9.3,9.2,9.1,9.0,8.9],
      avgLatest:  [8.8,8.8,9.1,8.6,8.3,7.9,7.7],
      distLabels: [
        ['3–6m','(n=27)'],['6–9m','(n=24)'],['9–12m','(n=21)'],
        ['12–15m','(n=14)'],['15–18m','(n=10)'],['>18m','(n=5)']
      ],
      distLt7:    [4,8,14,22,30,40],
      dist7_10:   [30,34,36,38,40,36],
      dist10_13:  [38,33,30,26,22,18],
      dist13_16:  [19,17,14,10,6,4],
      distGt16:   [9,8,6,4,2,2],
      latestAvg:  [9.1,8.7,8.5,8.2,7.9,7.7]
    },

    demographics: {
      gender: [
        {l:'Male',v:58},{l:'Female',v:40},{l:'Other/NS',v:2}
      ],
      age: [
        {l:'Pediatric (<13)',v:19},{l:'Pubertal (13–17)',v:12},{l:'Adults (≥18)',v:69}
      ],
      prevFacility: [
        {l:'PHC',v:22},{l:'CHC',v:31},{l:'DH',v:18},{l:'State MC',v:8},
        {l:'Central MC',v:3},{l:'Pvt Hospital',v:10},{l:'Pvt Clinic',v:4},{l:'Newly Dx',v:4}
      ],
      inactiveReasons: []
    },

    insulin: {
      tdd: [
        {grp:'Pediatric <13',  n:423,  below:24, inRange:58, above:18},
        {grp:'Pubertal 13–17', n:264,  below:20, inRange:62, above:18},
        {grp:'Adults ≥18',     n:1529, below:18, inRange:67, above:15}
      ],
      basal: [
        {l:'<20%',   v:8},
        {l:'20–30%', v:14},
        {l:'30–50%', v:38, ideal:true},
        {l:'50–60%', v:28},
        {l:'> 60%',  v:12}
      ]
    },

    capacity: {
      specialty: [
        {l:'Pediatrician',    v:54},
        {l:'MD Medicine',     v:37},
        {l:'Medical Officer', v:5},
        {l:'Other',           v:4}
      ],
      pilotSplit: [54, 46],
      flwCadre: [
        {l:'ASHA Worker', v:77},
        {l:'ANM',         v:7},
        {l:'BCM',         v:6},
        {l:'Other',       v:10}
      ]
    }
  };
}

// ─── PHASE 2: real aggregation helpers (implement tab-by-tab) ───
// Uncomment and complete these when replacing the hardcoded payload above.

/*
function readTab(wb, tabName) {
  var sh = wb.getSheetByName(tabName);
  if (!sh) throw new Error('Missing tab: ' + tabName);
  var rows = sh.getDataRange().getValues();
  var headers = rows.shift().map(function(h){ return String(h).trim(); });
  return rows.map(function(r){
    return Object.fromEntries(headers.map(function(h,i){ return [h, r[i]]; }));
  });
}

function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
*/

// ─── DIAGNOSTICS — run each function separately from the Apps Script editor ───
// These are split into small functions to avoid log truncation.

// RUN THIS FIRST — shows all tab names + row counts for both workbooks
function diagnose_tabList() {
  var out = { Sheet1: {}, Sheet2: {} };
  var wb1 = SpreadsheetApp.openById(WB1_ID);
  var wb2 = SpreadsheetApp.openById(WB2_ID);
  wb1.getSheets().forEach(function(s){ out.Sheet1[s.getName()] = s.getLastRow(); });
  wb2.getSheets().forEach(function(s){ out.Sheet2[s.getName()] = s.getLastRow(); });
  Logger.log(JSON.stringify(out, null, 2));
}

// RUN 2 — ALL headers in Followup_adherence (this is the main patient sheet, 2236 rows)
function diagnose_followup() {
  var sh = SpreadsheetApp.openById(WB1_ID).getSheetByName('Followup_adherence');
  var totalCols = sh.getLastColumn();
  // Row 1: headers. Row 2: first data row (mask IDs)
  var r1 = sh.getRange(1, 1, 1, totalCols).getValues()[0].map(function(v){ return String(v).substring(0,35); });
  var r2 = sh.getRange(2, 1, 1, totalCols).getValues()[0].map(function(v){
    var s = String(v).trim();
    return (s.length > 3 && /^[A-Za-z]{2,}\d+/.test(s)) ? '***ID***' : s.substring(0,25);
  });
  Logger.log('TOTAL COLS: ' + totalCols);
  Logger.log('HEADERS: ' + JSON.stringify(r1));
  Logger.log('SAMPLE:  ' + JSON.stringify(r2));
}

// RUN 3 — Enrolled List: show all rows (only 2 rows, shows what's there + #REF detail)
function diagnose_enrolledList() {
  var sh = SpreadsheetApp.openById(WB1_ID).getSheetByName('Enrolled List');
  Logger.log('Rows: ' + sh.getLastRow() + '  Cols: ' + sh.getLastColumn());
  var rows = sh.getRange(1, 1, sh.getLastRow(), Math.min(sh.getLastColumn(), 40)).getValues();
  rows.forEach(function(row, i) {
    Logger.log('ROW'+(i+1)+': '+JSON.stringify(row.map(function(v){ return String(v).substring(0,25); })));
  });
}

// RUN 4 — Targets tab (8 rows — need column names + all values)
function diagnose_targets() {
  var sh = SpreadsheetApp.openById(WB1_ID).getSheetByName('Targets');
  var rows = sh.getDataRange().getValues();
  rows.forEach(function(row, i) {
    Logger.log('ROW'+(i+1)+': '+JSON.stringify(row.map(function(v){ return String(v).substring(0,30); })));
  });
}

// RUN 5 — Sheet2: Operations_Summary + # of offs (show rows 1-3 + last 3 col headers)
function diagnose_sheet2() {
  var wb2 = SpreadsheetApp.openById(WB2_ID);
  ['Operations_Summary','# of offs'].forEach(function(name) {
    var sh = wb2.getSheetByName(name);
    if (!sh) { Logger.log(name + ': NOT FOUND'); return; }
    var totalCols = sh.getLastColumn();
    Logger.log('=== '+name+' ('+sh.getLastRow()+' rows, '+totalCols+' cols) ===');
    var rows = sh.getRange(1, 1, Math.min(3, sh.getLastRow()), Math.min(totalCols, 8)).getValues();
    rows.forEach(function(row, i){
      Logger.log('ROW'+(i+1)+': '+JSON.stringify(row.map(function(v){ return String(v).substring(0,25); })));
    });
    // Also show last 3 column headers to see the date range
    if (totalCols > 8) {
      var lastCols = sh.getRange(1, totalCols-2, 1, 3).getValues()[0];
      Logger.log('LAST 3 COL HEADERS: '+JSON.stringify(lastCols.map(function(v){ return String(v).substring(0,25); })));
    }
  });
}

// RUN 6 — SMBG_Monthly: show rows 1-4 (all cols up to 30)
function diagnose_smbgMonthly() {
  var sh = SpreadsheetApp.openById(WB1_ID).getSheetByName('SMBG_Monthly');
  Logger.log('Rows: '+sh.getLastRow()+'  Cols: '+sh.getLastColumn());
  var rows = sh.getRange(1, 1, sh.getLastRow(), Math.min(sh.getLastColumn(), 30)).getValues();
  rows.forEach(function(row, i){
    Logger.log('ROW'+(i+1)+': '+JSON.stringify(row.map(function(v){ return String(v).substring(0,25); })));
  });
}

// RUN 7 — Hba1c_Baseline/Latest: show all rows
function diagnose_hba1c() {
  var sh = SpreadsheetApp.openById(WB1_ID).getSheetByName('Hba1c_Baseline/Latest');
  if (!sh) { Logger.log('NOT FOUND'); return; }
  Logger.log('Rows: '+sh.getLastRow()+'  Cols: '+sh.getLastColumn());
  var rows = sh.getRange(1, 1, sh.getLastRow(), Math.min(sh.getLastColumn(), 25)).getValues();
  rows.forEach(function(row, i){
    Logger.log('ROW'+(i+1)+': '+JSON.stringify(row.map(function(v){ return String(v).substring(0,30); })));
  });
}

// RUN 8 — SMBG_Hyper/Hypo: show all rows
function diagnose_hyperHypo() {
  var sh = SpreadsheetApp.openById(WB1_ID).getSheetByName('SMBG_Hyper/Hypo');
  if (!sh) { Logger.log('NOT FOUND'); return; }
  Logger.log('Rows: '+sh.getLastRow()+'  Cols: '+sh.getLastColumn());
  var rows = sh.getRange(1, 1, sh.getLastRow(), Math.min(sh.getLastColumn(), 15)).getValues();
  rows.forEach(function(row, i){
    Logger.log('ROW'+(i+1)+': '+JSON.stringify(row.map(function(v){ return String(v).substring(0,30); })));
  });
}
