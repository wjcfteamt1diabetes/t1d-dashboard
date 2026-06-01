// T1D Program Dashboard — Apps Script aggregation endpoint
// Phase 2: real aggregation from Google Sheets
// Deploy as: Web app · Execute as Me · Access Anyone

const WB1_ID = '1cgMB5RIomWGSw_cQfmFkxx3qfBXlXxIL9fR4FzFuwIg'; // T1D_Data_Claude_Sheet1_v1
const WB2_ID = '1zObGfUcDOszt82v9V65OAK7yV5McXzeusFx5XqU_d6M'; // T1D_Data_Claude_Sheet2_v1
const CACHE_KEY  = 't1d_payload_v2';
const CACHE_SECS = 600; // 10 min

function doGet(e) {
  var cache = CacheService.getScriptCache();
  var json  = cache.get(CACHE_KEY);
  if (!json || (e && e.parameter && e.parameter.fresh === '1')) {
    json = JSON.stringify(buildPayload());
    cache.put(CACHE_KEY, json, CACHE_SECS);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ── Utilities ────────────────────────────────────────────────

function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function pct(num, den) { return den > 0 ? Math.round(num / den * 100) : 0; }

var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMonth(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  return MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
}

// Read sheet using a specific row (0-indexed) as header row.
// Multi-row-header sheets (title in row 1, headers in row 2) use headerRow=1.
function readTab(wb, tabName, headerRow) {
  var sh = wb.getSheetByName(tabName);
  if (!sh) throw new Error('Missing tab: ' + tabName);
  var data = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var hdrs = data[headerRow].map(function(h) { return String(h).trim(); });
  return data.slice(headerRow + 1).map(function(r) {
    var obj = {};
    hdrs.forEach(function(h, i) { obj[h] = r[i]; });
    return obj;
  });
}

function countDistinct(rows, col) {
  var s = {};
  rows.forEach(function(r) { var v = norm(r[col]); if (v) s[v] = true; });
  return Object.keys(s).length;
}

// ── Main payload ─────────────────────────────────────────────

// Read a sheet's DISPLAYED values (including IMPORTRANGE results) via the
// Sheets REST API using the script's own OAuth token.
// No additional services needed — works with the existing spreadsheet scope.
function readTabViaAPI(spreadsheetId, tabName, headerRow) {
  var token = ScriptApp.getOAuthToken();
  var range = encodeURIComponent("'" + tabName + "'");
  var url   = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId +
              '/values/' + range + '?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS';
  var resp  = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Sheets API error ' + resp.getResponseCode() + ': ' +
      resp.getContentText().substring(0, 300));
  }
  var data = JSON.parse(resp.getContentText()).values || [];
  if (data.length === 0) return [];
  var hdrs = (data[headerRow] || []).map(function(h) { return String(h).trim(); });
  return data.slice(headerRow + 1)
    .filter(function(r) { return r && r.some(function(v) { return v !== '' && v !== undefined; }); })
    .map(function(r) {
      var obj = {};
      hdrs.forEach(function(h, i) { obj[h] = (r[i] !== undefined ? r[i] : ''); });
      return obj;
    });
}

function buildPayload() {
  var wb1 = SpreadsheetApp.openById(WB1_ID);
  var wb2 = SpreadsheetApp.openById(WB2_ID);

  // Enrolled List uses IMPORTRANGE. SpreadsheetApp.getValues() cannot read it.
  // Sheets Advanced Service (Sheets.Spreadsheets.Values.get) returns displayed values.
  // Prerequisite: enable "Google Sheets API" under Services in the Apps Script editor.
  var enrolled = readTabViaAPI(WB1_ID, 'Enrolled List', 0);
  if (enrolled.length < 100) {
    throw new Error('Enrolled List returned only ' + enrolled.length + ' rows via API. ' +
      'Make sure "Google Sheets API" is added under Services, and the sheet has data visible in the browser.');
  }
  var csFac    = readTab(wb1, 'CompleteSupport_Facilities', 1);
  var cap      = readTab(wb1, 'Capacity_Building',          0);
  var orient   = readTab(wb1, 'Orientation_T1D signs',      1);
  var targets  = readTab(wb1, 'Targets',                    0);
  var ltSh     = wb1.getSheetByName('Light_touch_facilities');
  var fupSh    = wb1.getSheetByName('Followup_adherence');
  var opsSh    = wb2.getSheetByName('Operations_Summary');
  var offsSh   = wb2.getSheetByName('# of offs');

  // Global rule 1: exclude non-survivors from all metrics
  // (Enrolled List = CS patients only per global rule 2)
  var survivors = enrolled.filter(function(p) {
    return norm(p['Survival Status']) !== 'no';
  });

  // Per-facility lookup sets (normalised facility names)
  var csFacSet = buildFacSet(csFac,  'Facility name');
  var ltFacSet = buildLtFacSet(ltSh);

  // Per-state target map
  var tgtMap = buildTargetMap(targets);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      n:            survivors.length,
      schemaVersion:'1.1'
    },
    states:       buildStates(survivors, enrolled, csFac, ltSh, csFacSet, ltFacSet, tgtMap, cap, orient),
    series:       buildSeries(survivors, csFac, ltSh),
    followup:     buildFollowup(fupSh, survivors),
    smbg:         SMBG_MOCK,
    glycemia:     GLYCEMIA_MOCK,
    clinicOps:    buildClinicOps(opsSh, offsSh),
    trainedStaff: buildTrainedStaff(csFac),
    hba1c:        HBA1C_MOCK,
    demographics: buildDemographics(survivors),
    insulin:      buildInsulin(survivors),
    capacity:     buildCapacitySection(cap, orient)
  };
}

// ── Facility helpers ─────────────────────────────────────────

function buildFacSet(rows, col) {
  var s = {};
  rows.forEach(function(r) { var n = norm(r[col] || ''); if (n) s[n] = true; });
  return s;
}

function buildLtFacSet(ltSh) {
  var data = ltSh.getRange(1, 1, ltSh.getLastRow(), ltSh.getLastColumn()).getValues();
  var hdrs = data[1]; // row 2 = headers
  var nameIdx = -1;
  for (var i = 0; i < hdrs.length; i++) {
    if (String(hdrs[i]).trim() === 'Facility name') { nameIdx = i; break; }
  }
  var s = {};
  for (var r = 2; r < data.length; r++) {
    var n = norm(data[r][nameIdx] || '');
    if (n) s[n] = true;
  }
  return s;
}

function buildTargetMap(targets) {
  var m = {};
  targets.forEach(function(t) {
    var s = norm(t['State']);
    var v = Number(t['State-level targets']);
    if (s && !isNaN(v) && s !== 'total' && s !== 'follow-up adherence') m[s] = v;
  });
  m['all'] = Object.keys(m).reduce(function(sum, k) { return sum + (m[k] || 0); }, 0);
  return m;
}

// Read LT facility monthly enrolment data
// Returns { facCount, totalEnr, monthly: { 'Jan 25': N, ... } }
function readLtData(ltSh, stateFilter) {
  var data = ltSh.getRange(1, 1, ltSh.getLastRow(), ltSh.getLastColumn()).getValues();
  var hdrs = data[1]; // row 2
  var stateIdx = -1, nameIdx = -1, totalIdx = -1;
  var monthCols = [];
  for (var i = 0; i < hdrs.length; i++) {
    var h = String(hdrs[i]).trim();
    if (h === 'State')                               stateIdx = i;
    if (h === 'Facility name')                        nameIdx  = i;
    if (h === 'Total enrolments (autocalculated)')    totalIdx = i;
    if (hdrs[i] instanceof Date && !isNaN(hdrs[i].getTime())) {
      monthCols.push({ idx: i, label: fmtMonth(hdrs[i]) });
    }
  }
  var facCount = 0, totalEnr = 0;
  var monthly = {};
  for (var r = 2; r < data.length; r++) {
    var row = data[r];
    if (stateFilter && norm(row[stateIdx]) !== norm(stateFilter)) continue;
    var name = norm(row[nameIdx] || '');
    if (!name) continue;
    facCount++;
    var te = Number(row[totalIdx]);
    if (!isNaN(te)) totalEnr += te;
    monthCols.forEach(function(mc) {
      var v = Number(row[mc.idx]);
      if (!isNaN(v) && mc.label) monthly[mc.label] = (monthly[mc.label] || 0) + v;
    });
  }
  return { facCount: facCount, totalEnr: totalEnr, monthly: monthly };
}

// ── States builder ───────────────────────────────────────────

function buildStates(survivors, enrolled, csFac, ltSh, csFacSet, ltFacSet, tgtMap, cap, orient) {
  var out = {};
  ['all', 'RJ', 'MP', 'UK', 'CG'].forEach(function(k) {
    var isAll = k === 'all';
    var sk = norm(k);
    var survs  = isAll ? survivors : survivors.filter(function(p) { return norm(p['State']) === sk; });
    var enrAll = isAll ? enrolled  : enrolled.filter(function(p)  { return norm(p['State']) === sk; });
    var csF    = isAll ? csFac     : csFac.filter(function(f)     { return norm(f['State']) === sk; });
    var capF   = isAll ? cap       : cap.filter(function(r)       { return norm(r['State']) === sk; });
    var oriF   = isAll ? orient    : orient.filter(function(r)    { return norm(r['State']) === sk; });
    var ltD    = readLtData(ltSh, isAll ? null : k);

    out[k] = buildStateObj(k, survs, enrAll, csF, ltD, tgtMap, capF, oriF);
  });
  return out;
}

function buildStateObj(key, survs, enrAll, csF, ltD, tgtMap, capF, oriF) {
  var n       = survs.length;
  var nonSurv = enrAll.filter(function(p) { return norm(p['Survival Status']) === 'no'; }).length;
  var active  = survs.filter(function(p)  { return norm(p['Case Status (Active/Inactive)']) === 'active'; }).length;

  // Facility footprint
  var csOp  = csF.filter(function(f) { return norm(f['T1D Clinic Operational?']) === 'yes'; }).length;
  var ltOp  = ltD.facCount;
  var plan  = csF.length + ltD.facCount;

  // Districts (from CS facilities)
  var dists = {};
  csF.forEach(function(f) { var d = norm(f['District']); if (d) dists[d] = true; });
  var dist = Object.keys(dists).length;

  // Enrolment (CS from Enrolled List, LT from LT sheet totals)
  var csEnr = n;
  var ltEnr = ltD.totalEnr;
  var target = tgtMap[key === 'all' ? 'all' : norm(key)] || 0;

  // New enrolments: last and previous calendar month
  var now       = new Date();
  var lastM     = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var prevM     = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  var newLast   = survs.filter(function(p) {
    var d = new Date(p['Date of enrolment']);
    return !isNaN(d) && d.getFullYear() === lastM.getFullYear() && d.getMonth() === lastM.getMonth();
  }).length;
  var newPrev   = survs.filter(function(p) {
    var d = new Date(p['Date of enrolment']);
    return !isNaN(d) && d.getFullYear() === prevM.getFullYear() && d.getMonth() === prevM.getMonth();
  }).length;
  var avgClin   = csOp > 0 ? Math.round(newLast / csOp * 10) / 10 : 0;

  // Insulin regimen
  var insBase = pct(
    survs.filter(function(p) { return norm(p['Previous treatment regimen']) === 'basal-bolus'; }).length, n);
  var insLast = pct(
    survs.filter(function(p) { return norm(p['Insulin regimen check']) === 'basal-bolus'; }).length, n);

  // DKA / hypoglycaemia — denominator = those with follow-up visit in last 12 months
  var fupDenom = survs.filter(function(p) {
    return norm(p['Follow-up visit in the last 12 months?']) === 'yes';
  });
  var dka  = pct(fupDenom.filter(function(p) {
    return Number(p['# of DKA episodes in the last 12 months']) > 0; }).length, fupDenom.length);
  var hypo = pct(fupDenom.filter(function(p) {
    return Number(p['# of severe hypoglycemia episodes in the last 12 months']) > 0; }).length, fupDenom.length);

  // Training — doctors
  var drs  = capF.filter(function(r) { return norm(r['Type of Service Provider']) === 'doctor'; });
  var drBat = countDistinct(drs, 'Training Batch');
  var drSet = {}; drs.forEach(function(r) { var nm = norm(r['Name of Service Provider']); if (nm) drSet[nm] = true; });
  var drTr  = Object.keys(drSet).length;
  var drSc  = calcPrePost(drs);

  // Training — nurses
  var nrs  = capF.filter(function(r) { var t = norm(r['Type of Service Provider']); return t === 'staff nurse' || t === 'nurse'; });
  var nrBat = countDistinct(nrs, 'Training Batch');
  var nrSet = {}; nrs.forEach(function(r) { var nm = norm(r['Name of Service Provider']); if (nm) nrSet[nm] = true; });
  var nrTr  = Object.keys(nrSet).length;
  var nrSc  = calcPrePost(nrs);

  // FLW orientation
  var flwSes  = countDistinct(oriF, 'Session #');
  var flwHr   = oriF.reduce(function(s, r) { return s + (Number(r['# of Service Providers']) || 0); }, 0);
  var pilotAll = {}, pilotWithSess = {};
  oriF.forEach(function(r) {
    var d = norm(r['District']);
    if (!d) return;
    if (norm(r['Pilot District? (Yes/No)']) === 'yes') pilotAll[d] = true;
    pilotWithSess[d] = true;
  });
  // Use CS facility districts as total pilot district count if orientation data is sparse
  var flwTotDist = dist > 0 ? dist : Object.keys(pilotAll).length;
  var flwDist    = Object.keys(pilotWithSess).length;

  return {
    states:      key === 'all' ? 4 : 1,
    dist:        dist,
    plan:        plan,
    op:          csOp + ltOp,
    csOp:        csOp,
    ltOp:        ltOp,
    enr:         csEnr + ltEnr,
    target:      target,
    csEnr:       csEnr,
    ltEnr:       ltEnr,
    active:      active,
    inactive:    n - active,
    nonSurviving:nonSurv,
    newLast:     newLast,
    newPrev:     newPrev,
    avgClin:     avgClin,
    insBase:     insBase,
    insLast:     insLast,
    hbTest:      null,  // pending: Hba1c_Baseline/Latest sheet not yet populated
    hbDec:       null,
    hbDecN:      null,
    dka:         dka,
    hypo:        hypo,
    drBat:       drBat,
    drTr:        drTr,
    drPre:       drSc.pre,
    drPost:      drSc.post,
    nrBat:       nrBat,
    nrTr:        nrTr,
    nrPre:       nrSc.pre,
    nrPost:      nrSc.post,
    flwSes:      flwSes,
    flwHr:       flwHr,
    flwDist:     flwDist,
    flwTotDist:  flwTotDist
  };
}

function calcPrePost(rows) {
  var pre = [], post = [];
  rows.forEach(function(r) {
    var p = Number(r['Pre-test Score']), q = Number(r['Post-test Score']), m = Number(r['Maximum Score']);
    if (!isNaN(p) && !isNaN(q) && m > 0) { pre.push(p/m*100); post.push(q/m*100); }
  });
  var mean = function(a) { return a.length ? Math.round(a.reduce(function(x,y){return x+y;},0)/a.length) : 0; };
  return { pre: mean(pre), post: mean(post) };
}

// ── Series builder ───────────────────────────────────────────

function buildSeries(survivors, csFac, ltSh) {
  var now    = new Date();
  var months = [];
  var d      = new Date(2025, 0, 1);
  while (d.getFullYear() < now.getFullYear() || (d.getFullYear() === now.getFullYear() && d.getMonth() <= now.getMonth())) {
    months.push({ label: MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2), year: d.getFullYear(), month: d.getMonth() });
    d.setMonth(d.getMonth() + 1);
  }

  var ltMonthly = readLtData(ltSh, null).monthly;

  var csCum = [], ltCum = [], clin = [], newEnrCs = [], newEnrLt = [], avgCl = [];
  var cumLt  = 0;

  months.forEach(function(m) {
    var eom = new Date(m.year, m.month + 1, 0, 23, 59, 59);

    // Cumulative CS enrolments
    var cumCs = survivors.filter(function(p) {
      var enrD = new Date(p['Date of enrolment']);
      return !isNaN(enrD) && enrD <= eom;
    }).length;
    csCum.push(cumCs);

    // New CS enrolments this month
    var newCs = survivors.filter(function(p) {
      var enrD = new Date(p['Date of enrolment']);
      return !isNaN(enrD) && enrD.getFullYear() === m.year && enrD.getMonth() === m.month;
    }).length;
    newEnrCs.push(newCs);

    // Operational CS clinics by end of month
    var opClinics = csFac.filter(function(f) {
      if (norm(f['T1D Clinic Operational?']) !== 'yes') return false;
      var opD = new Date(f['Date of Operationalisation']);
      return !isNaN(opD) && opD <= eom;
    }).length;
    clin.push(opClinics);

    // LT monthly new enrolments
    var newLt = ltMonthly[m.label] || 0;
    newEnrLt.push(newLt);
    cumLt += newLt;
    ltCum.push(cumLt);

    avgCl.push(opClinics > 0 ? Math.round(newCs / opClinics * 10) / 10 : 0);
  });

  return {
    months:   months.map(function(m) { return m.label; }),
    csCum:    csCum,
    ltCum:    ltCum,
    clin:     clin,
    newEnrCs: newEnrCs,
    newEnrLt: newEnrLt,
    avgCl:    avgCl
  };
}

// ── Follow-up builder ────────────────────────────────────────

function buildFollowup(fupSh, survivors) {
  var data  = fupSh.getRange(1, 1, fupSh.getLastRow(), fupSh.getLastColumn()).getValues();
  var hdrs  = data[0];

  // Survivor ID set
  var survIds = {};
  survivors.forEach(function(p) { survIds[norm(p['Claude_ID'])] = true; });

  // Date columns: day-of-month encodes year (24→2024, 25→2025…), getMonth() = actual month
  var dateCols = [];
  for (var i = 2; i < hdrs.length; i++) {
    var h = hdrs[i];
    if (h instanceof Date && !isNaN(h.getTime())) {
      var yearSuffix = h.getDate();
      dateCols.push({ idx: i, label: MON[h.getMonth()] + ' ' + yearSuffix, year: 2000 + yearSuffix, month: h.getMonth() });
    }
  }

  var stats = {};
  dateCols.forEach(function(dc) { stats[dc.label] = { y: 0, n: 0 }; });

  for (var r = 1; r < data.length; r++) {
    if (!survIds[norm(data[r][0])]) continue;
    dateCols.forEach(function(dc) {
      var v = norm(data[r][dc.idx]);
      if (v === 'y') stats[dc.label].y++;
      else if (v === 'n') stats[dc.label].n++;
    });
  }

  // Keep last 7 months that have Y+N > 0, most-recent first
  var validCols = dateCols.filter(function(dc) {
    return stats[dc.label].y + stats[dc.label].n > 0;
  }).sort(function(a, b) {
    return a.year !== b.year ? a.year - b.year : a.month - b.month;
  }).slice(-7).reverse();

  return {
    mom: validCols.map(function(dc) {
      var s = stats[dc.label], total = s.y + s.n;
      return { m: dc.label, v: pct(s.y, total), n: total };
    })
  };
}

// ── Clinic ops builder ───────────────────────────────────────

function buildClinicOps(opsSh, offsSh) {
  var opsData  = parseOpsSheet(opsSh);
  var offsData = parseOpsSheet(offsSh);

  var months = [], funcPct = [], offDays = [];

  opsData.months.forEach(function(om, mi) {
    var opFacs = opsData.facilities.filter(function(f) { return f.operational; });
    var denom  = 0, numFunc = 0;
    opFacs.forEach(function(f) {
      var v = Number(om.vals[f.name]);
      if (!isNaN(v) && om.vals[f.name] !== '') { denom++; if (v >= 0.75) numFunc++; }
    });
    months.push(om.label);
    funcPct.push(pct(numFunc, denom));

    var om2 = offsData.months[mi];
    if (om2) {
      var b = [0,0,0,0], offDen = 0;
      opFacs.forEach(function(f) {
        var v = Number(om2.vals[f.name]);
        if (!isNaN(v) && om2.vals[f.name] !== '') {
          offDen++;
          if (v === 1) b[0]++; else if (v === 2) b[1]++; else if (v === 3) b[2]++; else if (v >= 4) b[3]++;
        }
      });
      offDays.push(b.map(function(x) { return pct(x, offDen); }));
    } else {
      offDays.push([0,0,0,0]);
    }
  });

  var take = Math.min(8, months.length), s = months.length - take;
  return { months: months.slice(s), functionalPct: funcPct.slice(s), offDays: offDays.slice(s) };
}

// Sheet2 structure: row2=facility names (col5+), row3=operational, row7+=data (col3=month label)
function parseOpsSheet(sh) {
  var data = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var facRow = data[1], opRow = data[2];
  var facs = [];
  for (var i = 4; i < facRow.length; i++) {
    var nm = String(facRow[i]).trim();
    if (nm) facs.push({ name: nm, idx: i, operational: norm(opRow[i]) === 'yes' });
  }
  var months = [];
  for (var r = 6; r < data.length; r++) {
    var lbl = String(data[r][2]).trim();
    if (!lbl || lbl === 'Month/Year') continue;
    var vals = {};
    facs.forEach(function(f) { vals[f.name] = data[r][f.idx]; });
    months.push({ label: lbl, vals: vals });
  }
  return { facilities: facs, months: months };
}

// ── Trained staff builder ────────────────────────────────────

function buildTrainedStaff(csFac) {
  var op    = csFac.filter(function(f) { return norm(f['T1D Clinic Operational?']) === 'yes'; });
  var total = op.length || 1;
  return [
    { lbl:'With trained Pediatrician',    v: pct(op.filter(function(f){ return norm(f['Trained pediatrician available?']) === 'yes'; }).length, total) },
    { lbl:'With trained MD Medicine',     v: pct(op.filter(function(f){ return norm(f['Trained MD Medicine available?'])  === 'yes'; }).length, total) },
    { lbl:'With trained MO',              v: pct(op.filter(function(f){ return norm(f['Trained Medical Officer available?']) === 'yes'; }).length, total) }
  ];
}

// ── Demographics builder ─────────────────────────────────────

function buildDemographics(survivors) {
  // Gender
  var male = 0, female = 0;
  survivors.forEach(function(p) {
    var s = norm(p['Sex']);
    if (s.charAt(0) === 'm') male++; else if (s.charAt(0) === 'f') female++;
  });
  var gTot = (male + female) || 1;

  // Age groups: compute from Age column (Age group only has 2 buckets in the sheet)
  var ped = 0, pub = 0, adu = 0;
  survivors.forEach(function(p) {
    var a = Number(p['Age']);
    if (isNaN(a)) return;
    if (a < 13) ped++; else if (a < 18) pub++; else adu++;
  });
  var aTot = (ped + pub + adu) || 1;

  // Previous treatment facility
  var FAC_LABEL = {
    'phc':'PHC','chc':'CHC','dh':'DH','state mc':'State MC','central mc':'Central MC',
    'private hospital':'Pvt Hospital','private clinic':'Pvt Clinic',
    'newly diagnosed':'Newly Dx','newly dx':'Newly Dx'
  };
  var facMap = {};
  survivors.forEach(function(p) {
    var cat;
    if (norm(p['Previous treatment regimen']) === 'newly diagnosed') {
      cat = 'Newly Dx';
    } else {
      var raw = norm(p['Previous treatment facility category']);
      cat = FAC_LABEL[raw] || (raw ? raw.toUpperCase() : null);
    }
    if (cat) facMap[cat] = (facMap[cat] || 0) + 1;
  });
  var ptfTot = survivors.length || 1;
  var ptf = Object.keys(facMap).map(function(l) {
    return { l: l, v: pct(facMap[l], ptfTot) };
  }).filter(function(d) { return d.v > 0; }).sort(function(a,b) { return b.v - a.v; });

  // Inactive reasons
  var inactMap = {};
  survivors.filter(function(p) { return norm(p['Case Status (Active/Inactive)']) === 'inactive'; })
    .forEach(function(p) {
      var r = String(p['Reason for marking inactive']).trim();
      if (r) inactMap[r] = (inactMap[r] || 0) + 1;
    });
  var inact = Object.keys(inactMap).map(function(r) {
    return { l: r, v: inactMap[r] };
  }).sort(function(a,b) { return b.v - a.v; });

  return {
    gender: [
      { l:'Male',     v: pct(male, gTot) },
      { l:'Female',   v: pct(female, gTot) },
      { l:'Other/NS', v: Math.max(0, 100 - pct(male, gTot) - pct(female, gTot)) }
    ],
    age: [
      { l:'Pediatric (<13)',  v: pct(ped, aTot) },
      { l:'Pubertal (13–17)', v: pct(pub, aTot) },
      { l:'Adults (≥18)',     v: pct(adu, aTot) }
    ],
    prevFacility:    ptf,
    inactiveReasons: inact
  };
}

// ── Insulin builder ──────────────────────────────────────────

function buildInsulin(survivors) {
  var AGE_GROUPS = [
    { grp:'Pediatric <13',  test: function(p) { return Number(p['Age']) < 13; } },
    { grp:'Pubertal 13–17', test: function(p) { var a=Number(p['Age']); return a>=13 && a<18; } },
    { grp:'Adults ≥18',     test: function(p) { return Number(p['Age']) >= 18; } }
  ];

  var tdd = AGE_GROUPS.map(function(g) {
    var rows = survivors.filter(g.test).filter(function(p) {
      var ir = norm(p['In Range?']);
      return ir === 'below' || ir === 'in range' || ir === 'above';
    });
    var tot = rows.length || 1;
    return {
      grp:     g.grp,
      n:       rows.length,
      below:   pct(rows.filter(function(p){ return norm(p['In Range?'])==='below';   }).length, tot),
      inRange: pct(rows.filter(function(p){ return norm(p['In Range?'])==='in range';}).length, tot),
      above:   pct(rows.filter(function(p){ return norm(p['In Range?'])==='above';   }).length, tot)
    };
  });

  // Basal % stored as decimal (0.40 = 40%)
  var bRows = survivors.filter(function(p) {
    var b = Number(p['Basal %']); return !isNaN(b) && b > 0;
  });
  var bN = bRows.length || 1;
  var basal = [
    { l:'<20%',   v: pct(bRows.filter(function(p){ return Number(p['Basal %']) <  0.20; }).length, bN) },
    { l:'20–30%', v: pct(bRows.filter(function(p){ var b=Number(p['Basal %']); return b>=0.20&&b<0.30; }).length, bN) },
    { l:'30–50%', v: pct(bRows.filter(function(p){ var b=Number(p['Basal %']); return b>=0.30&&b<=0.50; }).length, bN), ideal:true },
    { l:'50–60%', v: pct(bRows.filter(function(p){ var b=Number(p['Basal %']); return b>0.50&&b<=0.60; }).length, bN) },
    { l:'> 60%',  v: pct(bRows.filter(function(p){ return Number(p['Basal %']) >  0.60; }).length, bN) }
  ];

  return { tdd: tdd, basal: basal };
}

// ── Capacity section builder ─────────────────────────────────

function buildCapacitySection(cap, orient) {
  var doctors = cap.filter(function(r) { return norm(r['Type of Service Provider']) === 'doctor'; });
  var drTot   = doctors.length || 1;

  // Specialty
  var SPEC = { 'pediatrician':'Pediatrician','paediatrician':'Pediatrician','md medicine':'MD Medicine','medical officer':'Medical Officer','mo':'Medical Officer' };
  var specMap = {};
  doctors.forEach(function(r) {
    var d = norm(r['Designation/ Department']);
    var lbl = SPEC[d] || 'Other';
    specMap[lbl] = (specMap[lbl] || 0) + 1;
  });
  var ORDER = ['Pediatrician','MD Medicine','Medical Officer','Other'];
  var specialty = ORDER.map(function(l) {
    return { l:l, v:pct(specMap[l]||0, drTot) };
  }).filter(function(d) { return d.v > 0; });

  // Pilot split
  var pilotDr = doctors.filter(function(r) { return norm(r['Pilot facility? (Yes/No)']) === 'yes'; }).length;
  var pilotSplit = [pct(pilotDr, drTot), 100 - pct(pilotDr, drTot)];

  // FLW cadre from orientation sessions
  var CADRE = { 'asha':'ASHA Worker','asha worker':'ASHA Worker','anm':'ANM','bcm':'BCM' };
  var cadreMap = {};
  orient.forEach(function(r) {
    var t   = norm(r['Type of Service Provider']);
    var lbl = CADRE[t] || 'Other';
    var v   = Number(r['# of Service Providers']) || 0;
    cadreMap[lbl] = (cadreMap[lbl] || 0) + v;
  });
  var cadTot = Object.keys(cadreMap).reduce(function(s,k){ return s+(cadreMap[k]||0); },0) || 1;
  var CORD   = ['ASHA Worker','ANM','BCM','Other'];
  var flwCadre = CORD.map(function(l) {
    return { l:l, v:pct(cadreMap[l]||0, cadTot) };
  }).filter(function(d){ return d.v > 0; });

  return { specialty:specialty, pilotSplit:pilotSplit, flwCadre:flwCadre };
}

// ── Mock sections ────────────────────────────────────────────
// SMBG_Monthly, SMBG_Hyper/Hypo, Hba1c_Baseline/Latest sheets are not yet
// populated in the workbook. These return mock values until the sheets are filled.

var SMBG_MOCK = {
  mom: [
    {m:'Apr 26',v:[25,54,12,9],n:1512},{m:'Mar 26',v:[25,43,18,14],n:1398},
    {m:'Feb 26',v:[21,42,21,16],n:1244},{m:'Jan 26',v:[20,48,19,13],n:1108},
    {m:'Dec 25',v:[27,51,17,5], n:1002},{m:'Nov 25',v:[30,43,19,8], n:889}
  ],
  last: {m:'May 26',v:[25,55,12,8],n:911}
};

var GLYCEMIA_MOCK = {
  months:    [{m:'May 26',n:943},{m:'Apr 26',n:891},{m:'Mar 26',n:824}],
  hyperDist: [[22,31,27,13,7],[20,29,28,15,8],[18,28,30,16,8]],
  hypoDist:  [[63,20,10,5,2], [60,22,11,5,2], [62,21,10,5,2]]
};

var HBA1C_MOCK = {
  changeLabels:[['Overall',''],['3–6 months',''],['6–9 months',''],['9–12 months',''],['12–15 months',''],['15–18 months',''],['>18 months','']],
  changeN:   [0,0,0,0,0,0,0], improved4:[0,0,0,0,0,0,0], improved2:[0,0,0,0,0,0,0], improvedL:[0,0,0,0,0,0,0],
  noChange:  [0,0,0,0,0,0,0], worsenedL:[0,0,0,0,0,0,0], worsened2:[0,0,0,0,0,0,0], worsened4:[0,0,0,0,0,0,0],
  avgBaseline:[0,0,0,0,0,0,0], avgLatest:[0,0,0,0,0,0,0],
  distLabels:[['3–6m',''],['6–9m',''],['9–12m',''],['12–15m',''],['15–18m',''],['>18m','']],
  distLt7:[0,0,0,0,0,0], dist7_10:[0,0,0,0,0,0], dist10_13:[0,0,0,0,0,0],
  dist13_16:[0,0,0,0,0,0], distGt16:[0,0,0,0,0,0], latestAvg:[0,0,0,0,0,0]
};

// RUN THIS if clinicOps shows all-zero — checks actual values in Operations_Summary
function diagnose_opsValues() {
  var sh = SpreadsheetApp.openById(WB2_ID).getSheetByName('Operations_Summary');
  var data = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  // Print facility names (row 2, index 1) cols 5-15
  var facRow = data[1];
  Logger.log('Facility names (cols 5-15): ' + JSON.stringify(
    facRow.slice(4,15).map(function(v){ return String(v).substring(0,20); })
  ));
  // Print last 5 data rows with their month label + first 5 facility values
  for (var r = data.length - 5; r < data.length; r++) {
    var row = data[r];
    Logger.log('ROW' + (r+1) + ' label=' + String(row[2]).substring(0,8) +
      ' vals=' + JSON.stringify(row.slice(4,9).map(function(v){ return v === '' ? 'EMPTY' : v; })));
  }
  // Count months with at least one non-empty facility value
  var filledMonths = 0;
  for (var r2 = 6; r2 < data.length; r2++) {
    var hasVal = data[r2].slice(4).some(function(v){ return v !== '' && v !== null && !isNaN(Number(v)); });
    if (hasVal) filledMonths++;
  }
  Logger.log('Months with at least one facility value: ' + filledMonths + ' of ' + (data.length - 6));
}

// ── Payload health check — run from editor to verify all sections ─────────────
function testPayload() {
  var p = buildPayload();
  var ok = [], warn = [];

  function chk(label, val) {
    var ok_ = val !== null && val !== undefined && val !== 0 && !(Array.isArray(val) && val.every(function(v){return !v;}));
    (ok_ ? ok : warn).push(label + ': ' + JSON.stringify(val).substring(0,60));
  }
  function arr(label, a) {
    var nonZero = (a||[]).filter(function(v){return Number(v)>0;}).length;
    (nonZero > 0 ? ok : warn).push(label + ' → ' + nonZero + '/' + (a||[]).length + ' non-zero');
  }

  // meta
  chk('meta.n',           p.meta.n);
  chk('meta.generatedAt', p.meta.generatedAt);

  // states
  var s = p.states.all;
  chk('states.all.enr',     s.enr);
  chk('states.all.csEnr',   s.csEnr);
  chk('states.all.ltEnr',   s.ltEnr);
  chk('states.all.active',  s.active);
  chk('states.all.dka',     s.dka);
  chk('states.all.hypo',    s.hypo);
  chk('states.all.insBase', s.insBase);
  chk('states.all.insLast', s.insLast);
  chk('states.all.drTr',    s.drTr);
  chk('states.all.flwHr',   s.flwHr);

  // series
  arr('series.months',   p.series.months);
  arr('series.csCum',    p.series.csCum);
  arr('series.ltCum',    p.series.ltCum);
  arr('series.clin',     p.series.clin);
  arr('series.newEnrCs', p.series.newEnrCs);
  arr('series.newEnrLt', p.series.newEnrLt);

  // followup
  chk('followup.mom length', p.followup.mom.length);
  if (p.followup.mom.length > 0) chk('followup.mom[0]', p.followup.mom[0]);

  // clinicOps
  arr('clinicOps.months',       p.clinicOps.months);
  arr('clinicOps.functionalPct',p.clinicOps.functionalPct);

  // demographics
  chk('demographics.gender[0].v',        (p.demographics.gender[0]||{}).v);
  chk('demographics.age[0].v',           (p.demographics.age[0]||{}).v);
  chk('demographics.prevFacility length', p.demographics.prevFacility.length);

  // insulin
  chk('insulin.tdd[0].n',    (p.insulin.tdd[0]||{}).n);
  chk('insulin.basal length', p.insulin.basal.length);

  // trainedStaff
  chk('trainedStaff[0].v', (p.trainedStaff[0]||{}).v);

  // capacity
  chk('capacity.specialty[0].v', (p.capacity.specialty[0]||{}).v);
  chk('capacity.flwCadre[0].v',  (p.capacity.flwCadre[0]||{}).v);

  Logger.log('=== OK (' + ok.length + ') ===');
  ok.forEach(function(l){ Logger.log('  ✓ ' + l); });
  Logger.log('=== WARN / ZERO (' + warn.length + ') ===');
  warn.forEach(function(l){ Logger.log('  ✗ ' + l); });
}
