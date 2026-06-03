// T1D Program Dashboard — Apps Script aggregation endpoint
// Phase 3: real per-segment aggregation (State × Sex × Age × Status)
// Deploy as: Web app · Execute as Me · Access Anyone

const WB1_ID = '1cgMB5RIomWGSw_cQfmFkxx3qfBXlXxIL9fR4FzFuwIg'; // T1D_Data_Claude_Sheet1_v1
const WB2_ID = '1zObGfUcDOszt82v9V65OAK7yV5McXzeusFx5XqU_d6M'; // T1D_Data_Claude_Sheet2_v1
const CACHE_KEY  = 't1d_payload_v3';
const CACHE_SECS = 600; // 10 min
const SCHEMA     = '2.0';

function doGet(e) {
  var fresh = e && e.parameter && e.parameter.fresh === '1';
  var json  = fresh ? null : getCachedPayload();
  if (!json) {
    json = JSON.stringify(buildPayload());
    putCachedPayload(json);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ── Chunked cache (CacheService caps each entry at 100KB) ────
function getCachedPayload() {
  var c = CacheService.getScriptCache();
  var meta = c.get(CACHE_KEY + '_n');
  if (!meta) return null;
  var n = parseInt(meta, 10), keys = [];
  for (var i = 0; i < n; i++) keys.push(CACHE_KEY + '_' + i);
  var all = c.getAll(keys), parts = [];
  for (var j = 0; j < n; j++) {
    var part = all[CACHE_KEY + '_' + j];
    if (part == null) return null; // a chunk expired — rebuild
    parts.push(part);
  }
  return parts.join('');
}
function putCachedPayload(json) {
  var c = CacheService.getScriptCache(), CHUNK = 90000;
  var n = Math.ceil(json.length / CHUNK), obj = {};
  for (var i = 0; i < n; i++) obj[CACHE_KEY + '_' + i] = json.substr(i * CHUNK, CHUNK);
  obj[CACHE_KEY + '_n'] = String(n);
  c.putAll(obj, CACHE_SECS);
}

// ── Utilities ────────────────────────────────────────────────
function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function pct(num, den) { return den > 0 ? Math.round(num / den * 100) : 0; }
function isYes(v) { var s = norm(v); return s === 'yes' || s === 'y' || s === 'true' || s === '1'; }

var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMonth(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  return MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
}

// SpreadsheetApp read (static sheets) — headerRow 0-indexed
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

// Sheets REST read via OAuth token — needed for IMPORTRANGE sheets (Enrolled List)
function readTabViaAPI(spreadsheetId, tabName, headerRow) {
  var token = ScriptApp.getOAuthToken();
  var range = encodeURIComponent("'" + tabName + "'");
  var url   = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId +
              '/values/' + range + '?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS';
  var resp  = UrlFetchApp.fetch(url, { headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Sheets API error ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0, 300));
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

function countDistinct(rows, col) {
  var s = {};
  rows.forEach(function(r) { var v = norm(r[col]); if (v) s[v] = true; });
  return Object.keys(s).length;
}

// ── Segment dimension tokens ─────────────────────────────────
function stateTok(p) { var s = String(p['State']).trim().toUpperCase(); return s || 'NA'; }
function sexTok(p)   { var s = norm(p['Sex']); return s.charAt(0) === 'm' ? 'M' : s.charAt(0) === 'f' ? 'F' : 'O'; }
function ageTok(p)   { var a = Number(p['Age']); if (isNaN(a)) return 'unk'; return a < 13 ? 'ped' : a < 18 ? 'pub' : 'adu'; }
function statusTok(p){ return norm(p['Case Status (Active/Inactive)']) === 'inactive' ? 'inactive' : 'active'; }

// Generate all 16 generalisation keys (each dim → its value OR 'all')
function genKeys(st, sx, ag, status) {
  var S = ['all', st], X = ['all', sx], A = ['all', ag], T = ['all', status], out = [];
  for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++)
    for (var k = 0; k < 2; k++) for (var l = 0; l < 2; l++)
      out.push(S[i] + '|' + X[j] + '|' + A[k] + '|' + T[l]);
  return out;
}

// ── Main payload ─────────────────────────────────────────────
function buildPayload() {
  var wb1 = SpreadsheetApp.openById(WB1_ID);
  var wb2 = SpreadsheetApp.openById(WB2_ID);

  var enrolled = readTabViaAPI(WB1_ID, 'Enrolled List', 0);
  if (enrolled.length < 100) {
    throw new Error('Enrolled List returned only ' + enrolled.length + ' rows via API.');
  }
  var csFac   = readTab(wb1, 'CompleteSupport_Facilities', 1);
  var cap     = readTab(wb1, 'Capacity_Building', 0);
  var orient  = readTab(wb1, 'Orientation_T1D signs', 1);
  var targets = readTab(wb1, 'Targets', 0);
  var ltSh    = wb1.getSheetByName('Light_touch_facilities');
  var fupSh   = wb1.getSheetByName('Followup_adherence');
  var opsSh   = wb2.getSheetByName('Operations_Summary');
  var offsSh  = wb2.getSheetByName('# of offs');

  var survivors = enrolled.filter(function(p) { return norm(p['Survival Status']) !== 'no'; });
  var tgtMap    = buildTargetMap(targets);

  var STATES = ['all', 'RJ', 'MP', 'UK', 'CG'];
  var statesGeo = {}, seriesByState = {}, trainedByState = {}, capacityByState = {};
  STATES.forEach(function(k) {
    var isAll = k === 'all', sk = k.toUpperCase();
    var enrAll = isAll ? enrolled : enrolled.filter(function(p) { return stateTok(p) === sk; });
    var csF    = isAll ? csFac    : csFac.filter(function(f) { return String(f['State']).trim().toUpperCase() === sk; });
    var capF   = isAll ? cap      : cap.filter(function(r) { return String(r['State']).trim().toUpperCase() === sk; });
    var oriF   = isAll ? orient   : orient.filter(function(r) { return String(r['State']).trim().toUpperCase() === sk; });
    var ltD    = readLtData(ltSh, isAll ? null : k);
    var survs  = isAll ? survivors : survivors.filter(function(p) { return stateTok(p) === sk; });

    statesGeo[k]      = buildStateGeo(k, survs, enrAll, csF, ltD, tgtMap, capF, oriF);
    seriesByState[k]  = buildSeries(survs, csF, ltD);
    trainedByState[k] = buildTrainedStaff(csF);
    capacityByState[k]= buildCapacitySection(capF, oriF);
  });

  return {
    meta:            { generatedAt: new Date().toISOString(), n: survivors.length, schemaVersion: SCHEMA },
    states:          statesGeo,
    seriesByState:   seriesByState,
    trainedByState:  trainedByState,
    capacityByState: capacityByState,
    clinicOps:       buildClinicOps(opsSh, offsSh),  // program-wide (ops sheet has no state)
    segments:        buildSegments(survivors, fupSh),
    smbg:            SMBG_MOCK,
    glycemia:        GLYCEMIA_MOCK,
    hba1c:           HBA1C_MOCK
  };
}

// ── Geography (per-state, responds to State filter only) ─────
function buildStateGeo(key, survs, enrAll, csF, ltD, tgtMap, capF, oriF) {
  var nonSurv = enrAll.filter(function(p) { return norm(p['Survival Status']) === 'no'; }).length;
  var csOp = csF.filter(function(f) { return isYes(f['T1D Clinic Operational?']); }).length;
  var dists = {};
  csF.forEach(function(f) { var d = norm(f['District']); if (d) dists[d] = true; });

  var drs = capF.filter(function(r) { return norm(r['Type of Service Provider']) === 'doctor'; });
  var drSet = {}; drs.forEach(function(r) { var nm = norm(r['Name of Service Provider']); if (nm) drSet[nm] = true; });
  var drSc = calcPrePost(drs);
  var nrs = capF.filter(function(r) { var t = norm(r['Type of Service Provider']); return t === 'staff nurse' || t === 'nurse'; });
  var nrSet = {}; nrs.forEach(function(r) { var nm = norm(r['Name of Service Provider']); if (nm) nrSet[nm] = true; });
  var nrSc = calcPrePost(nrs);

  var flwHr = oriF.reduce(function(s, r) { return s + (Number(r['# of Service Providers']) || 0); }, 0);
  var pilotWithSess = {};
  oriF.forEach(function(r) { var d = norm(r['District']); if (d) pilotWithSess[d] = true; });

  return {
    states:      key === 'all' ? 4 : 1,
    dist:        Object.keys(dists).length,
    plan:        csF.length + ltD.facCount,
    op:          csOp + ltD.facCount,
    csOp:        csOp,
    ltOp:        ltD.facCount,
    ltEnr:       ltD.totalEnr,
    target:      tgtMap[key === 'all' ? 'all' : key.toLowerCase()] || 0,
    nonSurviving:nonSurv,
    drBat:       countDistinct(drs, 'Training Batch'),
    drTr:        Object.keys(drSet).length,
    drPre:       drSc.pre,
    drPost:      drSc.post,
    nrBat:       countDistinct(nrs, 'Training Batch'),
    nrTr:        Object.keys(nrSet).length,
    nrPre:       nrSc.pre,
    nrPost:      nrSc.post,
    flwSes:      countDistinct(oriF, 'Session #'),
    flwHr:       flwHr,
    flwDist:     Object.keys(pilotWithSess).length,
    flwTotDist:  Object.keys(dists).length || Object.keys(pilotWithSess).length
  };
}

function calcPrePost(rows) {
  var pre = [], post = [];
  rows.forEach(function(r) {
    var p = Number(r['Pre-test Score']), q = Number(r['Post-test Score']), m = Number(r['Maximum Score']);
    if (!isNaN(p) && !isNaN(q) && m > 0) { pre.push(p / m * 100); post.push(q / m * 100); }
  });
  var mean = function(a) { return a.length ? Math.round(a.reduce(function(x, y) { return x + y; }, 0) / a.length) : 0; };
  return { pre: mean(pre), post: mean(post) };
}

// ── Patient-level segments (single pass + generalisation) ────
function buildSegments(survivors, fupSh) {
  var FAC_LABEL = {
    'phc':'PHC','chc':'CHC','dh':'DH','state mc':'State MC','central mc':'Central MC',
    'private hospital':'Pvt Hospital','private clinic':'Pvt Clinic','newly diagnosed':'Newly Dx','newly dx':'Newly Dx'
  };
  var now   = new Date();
  var lastM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var prevM = new Date(now.getFullYear(), now.getMonth() - 2, 1);

  var acc = {}; // key -> accumulator
  function blank() {
    return {
      n:0, active:0, inactive:0, newLast:0, newPrev:0,
      male:0, female:0, other:0, ped:0, pub:0, adu:0,
      prevFac:{}, inact:{},
      insBaseNum:0, insLastNum:0,
      fupDenom:0, dkaNum:0, hypoNum:0,
      tdd:{ ped:{b:0,i:0,a:0,n:0}, pub:{b:0,i:0,a:0,n:0}, adu:{b:0,i:0,a:0,n:0} },
      basal:{ b1:0,b2:0,b3:0,b4:0,b5:0,n:0 }
    };
  }

  survivors.forEach(function(p) {
    var st = stateTok(p), sx = sexTok(p), ag = ageTok(p), status = statusTok(p);
    var keys = genKeys(st, sx, ag, status);
    var ageNum = Number(p['Age']);
    var sexc = norm(p['Sex']).charAt(0);
    var prevReg = norm(p['Previous treatment regimen']);
    var facCat = prevReg === 'newly diagnosed'
      ? 'Newly Dx'
      : (function() { var raw = norm(p['Previous treatment facility category']); return FAC_LABEL[raw] || (raw ? raw.toUpperCase() : null); })();
    var insBase = prevReg === 'basal-bolus';
    var insLast = norm(p['Insulin regimen check']) === 'basal-bolus';
    var hasFup  = isYes(p['Follow-up visit in the last 12 months?']);
    var dka     = Number(p['# of DKA episodes in the last 12 months']) > 0;
    var hypo    = Number(p['# of severe hypoglycemia episodes in the last 12 months']) > 0;
    var ir      = norm(p['In Range?']);
    var basal   = Number(p['Basal %']);
    var enrD    = new Date(p['Date of enrolment']);
    var isLast  = !isNaN(enrD) && enrD.getFullYear() === lastM.getFullYear() && enrD.getMonth() === lastM.getMonth();
    var isPrev  = !isNaN(enrD) && enrD.getFullYear() === prevM.getFullYear() && enrD.getMonth() === prevM.getMonth();
    var inact   = status === 'inactive' ? String(p['Reason for marking inactive']).trim() : null;
    var tddGrp  = ageNum < 13 ? 'ped' : (ageNum < 18 ? 'pub' : 'adu');

    keys.forEach(function(key) {
      var a = acc[key] || (acc[key] = blank());
      a.n++;
      if (status === 'active') a.active++; else a.inactive++;
      if (isLast) a.newLast++;
      if (isPrev) a.newPrev++;
      if (sexc === 'm') a.male++; else if (sexc === 'f') a.female++; else a.other++;
      if (!isNaN(ageNum)) { if (ageNum < 13) a.ped++; else if (ageNum < 18) a.pub++; else a.adu++; }
      if (facCat) a.prevFac[facCat] = (a.prevFac[facCat] || 0) + 1;
      if (inact) a.inact[inact] = (a.inact[inact] || 0) + 1;
      if (insBase) a.insBaseNum++;
      if (insLast) a.insLastNum++;
      if (hasFup) { a.fupDenom++; if (dka) a.dkaNum++; if (hypo) a.hypoNum++; }
      if (ir === 'below' || ir === 'in range' || ir === 'above') {
        var g = a.tdd[tddGrp]; if (g) { g.n++; if (ir === 'below') g.b++; else if (ir === 'in range') g.i++; else g.a++; }
      }
      if (!isNaN(basal) && basal > 0) {
        a.basal.n++;
        if (basal < 0.20) a.basal.b1++;
        else if (basal < 0.30) a.basal.b2++;
        else if (basal <= 0.50) a.basal.b3++;
        else if (basal <= 0.60) a.basal.b4++;
        else a.basal.b5++;
      }
    });
  });

  // Follow-up MoM per segment (join followup sheet to survivor tags by Claude_ID)
  var tagById = {};
  survivors.forEach(function(p) {
    tagById[norm(p['Claude_ID'])] = genKeys(stateTok(p), sexTok(p), ageTok(p), statusTok(p));
  });
  var fupData = fupSh.getRange(1, 1, fupSh.getLastRow(), fupSh.getLastColumn()).getValues();
  var fupHdr  = fupData[0];
  var dateCols = [];
  for (var i = 2; i < fupHdr.length; i++) {
    var h = fupHdr[i];
    if (h instanceof Date && !isNaN(h.getTime())) {
      var ys = h.getDate();
      dateCols.push({ idx: i, label: MON[h.getMonth()] + ' ' + ys, year: 2000 + ys, month: h.getMonth() });
    }
  }
  var fupAcc = {}; // key -> { label -> {y,n} }
  for (var r = 1; r < fupData.length; r++) {
    var keys = tagById[norm(fupData[r][0])];
    if (!keys) continue; // only survivors
    for (var c = 0; c < dateCols.length; c++) {
      var dc = dateCols[c], v = norm(fupData[r][dc.idx]);
      if (v !== 'y' && v !== 'n') continue;
      for (var kk = 0; kk < keys.length; kk++) {
        var fa = fupAcc[keys[kk]] || (fupAcc[keys[kk]] = {});
        var cell = fa[dc.label] || (fa[dc.label] = { y: 0, n: 0 });
        if (v === 'y') cell.y++; else cell.n++;
      }
    }
  }

  // Finalise every accumulated segment
  var out = {};
  Object.keys(acc).forEach(function(key) {
    var a = acc[key], n = a.n || 1;
    var gTot = (a.male + a.female + a.other) || 1;
    var aTot = (a.ped + a.pub + a.adu) || 1;

    var prevFacility = Object.keys(a.prevFac).map(function(l) { return { l: l, v: pct(a.prevFac[l], a.n || 1) }; })
      .filter(function(d) { return d.v > 0; }).sort(function(x, y) { return y.v - x.v; });
    var inactiveReasons = Object.keys(a.inact).map(function(l) { return { l: l, v: a.inact[l] }; })
      .sort(function(x, y) { return y.v - x.v; });

    var tdd = ['ped','pub','adu'].map(function(gk) {
      var g = a.tdd[gk], t = g.n || 1;
      return { grp: gk === 'ped' ? 'Pediatric <13' : gk === 'pub' ? 'Pubertal 13–17' : 'Adults ≥18',
        n: g.n, below: pct(g.b, t), inRange: pct(g.i, t), above: pct(g.a, t) };
    });
    var bN = a.basal.n || 1;
    var basal = [
      { l:'<20%',   v: pct(a.basal.b1, bN) },
      { l:'20–30%', v: pct(a.basal.b2, bN) },
      { l:'30–50%', v: pct(a.basal.b3, bN), ideal: true },
      { l:'50–60%', v: pct(a.basal.b4, bN) },
      { l:'> 60%',  v: pct(a.basal.b5, bN) }
    ];

    // Follow-up MoM for this key
    var fmom = [];
    var fa = fupAcc[key];
    if (fa) {
      fmom = dateCols.filter(function(dc) { return fa[dc.label] && (fa[dc.label].y + fa[dc.label].n) > 0; })
        .sort(function(x, y) { return x.year !== y.year ? x.year - y.year : x.month - y.month; })
        .slice(-7).reverse()
        .map(function(dc) { var s = fa[dc.label], tot = s.y + s.n; return { m: dc.label, v: pct(s.y, tot), n: tot }; });
    }

    out[key] = {
      csEnr: a.n, active: a.active, inactive: a.inactive,
      newLast: a.newLast, newPrev: a.newPrev,
      insBase: pct(a.insBaseNum, n), insLast: pct(a.insLastNum, n),
      dka: pct(a.dkaNum, a.fupDenom), hypo: pct(a.hypoNum, a.fupDenom), fupDenom: a.fupDenom,
      demographics: {
        gender: [ { l:'Male', v: pct(a.male, gTot) }, { l:'Female', v: pct(a.female, gTot) },
                  { l:'Other/NS', v: Math.max(0, 100 - pct(a.male, gTot) - pct(a.female, gTot)) } ],
        age: [ { l:'Pediatric (<13)', v: pct(a.ped, aTot) }, { l:'Pubertal (13–17)', v: pct(a.pub, aTot) },
               { l:'Adults (≥18)', v: pct(a.adu, aTot) } ],
        prevFacility: prevFacility, inactiveReasons: inactiveReasons
      },
      insulin: { tdd: tdd, basal: basal },
      followup: { mom: fmom }
    };
  });
  return out;
}

// ── Facility / LT helpers ────────────────────────────────────
function buildTargetMap(targets) {
  var m = {};
  targets.forEach(function(t) {
    var s = norm(t['State']), v = Number(t['State-level targets']);
    if (s && !isNaN(v) && s !== 'total' && s !== 'follow-up adherence') m[s] = v;
  });
  m['all'] = Object.keys(m).reduce(function(sum, k) { return sum + (m[k] || 0); }, 0);
  return m;
}

function readLtData(ltSh, stateFilter) {
  var data = ltSh.getRange(1, 1, ltSh.getLastRow(), ltSh.getLastColumn()).getValues();
  var hdrs = data[1];
  var stateIdx = -1, nameIdx = -1, totalIdx = -1, monthCols = [];
  for (var i = 0; i < hdrs.length; i++) {
    var h = String(hdrs[i]).trim();
    if (h === 'State') stateIdx = i;
    if (h === 'Facility name') nameIdx = i;
    if (h === 'Total enrolments (autocalculated)') totalIdx = i;
    if (hdrs[i] instanceof Date && !isNaN(hdrs[i].getTime())) monthCols.push({ idx: i, label: fmtMonth(hdrs[i]) });
  }
  var facCount = 0, totalEnr = 0, monthly = {};
  for (var r = 2; r < data.length; r++) {
    var row = data[r];
    if (stateFilter && String(row[stateIdx]).trim().toUpperCase() !== stateFilter.toUpperCase()) continue;
    var name = norm(row[nameIdx] || '');
    if (!name) continue;
    facCount++;
    var te = Number(row[totalIdx]); if (!isNaN(te)) totalEnr += te;
    monthCols.forEach(function(mc) { var v = Number(row[mc.idx]); if (!isNaN(v) && mc.label) monthly[mc.label] = (monthly[mc.label] || 0) + v; });
  }
  return { facCount: facCount, totalEnr: totalEnr, monthly: monthly };
}

// ── Series (per-state) ───────────────────────────────────────
function buildSeries(survs, csF, ltD) {
  var now = new Date(), months = [], d = new Date(2025, 0, 1);
  while (d.getFullYear() < now.getFullYear() || (d.getFullYear() === now.getFullYear() && d.getMonth() <= now.getMonth())) {
    months.push({ label: MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2), year: d.getFullYear(), month: d.getMonth() });
    d.setMonth(d.getMonth() + 1);
  }
  var csCum = [], ltCum = [], clin = [], newEnrCs = [], newEnrLt = [], avgCl = [], cumLt = 0;
  months.forEach(function(m) {
    var eom = new Date(m.year, m.month + 1, 0, 23, 59, 59);
    var cumCs = survs.filter(function(p) { var e = new Date(p['Date of enrolment']); return !isNaN(e) && e <= eom; }).length;
    csCum.push(cumCs);
    var newCs = survs.filter(function(p) { var e = new Date(p['Date of enrolment']); return !isNaN(e) && e.getFullYear() === m.year && e.getMonth() === m.month; }).length;
    newEnrCs.push(newCs);
    var op = csF.filter(function(f) {
      if (!isYes(f['T1D Clinic Operational?'])) return false;
      var o = new Date(f['Date of Operationalisation']); return !isNaN(o) && o <= eom;
    }).length;
    clin.push(op);
    var newLt = ltD.monthly[m.label] || 0;
    newEnrLt.push(newLt); cumLt += newLt; ltCum.push(cumLt);
    avgCl.push(op > 0 ? Math.round(newCs / op * 10) / 10 : 0);
  });
  return { months: months.map(function(m) { return m.label; }), csCum: csCum, ltCum: ltCum, clin: clin, newEnrCs: newEnrCs, newEnrLt: newEnrLt, avgCl: avgCl };
}

// ── Clinic ops (program-wide) ────────────────────────────────
function buildClinicOps(opsSh, offsSh) {
  var opsData = parseOpsSheet(opsSh), offsData = parseOpsSheet(offsSh);
  var opFacs = opsData.facilities.filter(function(f) { return f.operational; });
  var offsMap = {}; offsData.months.forEach(function(m) { offsMap[m.label] = m; });
  var months = [], funcPct = [], offDays = [];
  opsData.months.forEach(function(om) {
    var denom = 0, numFunc = 0;
    opFacs.forEach(function(f) { var v = Number(om.vals[f.name]); if (!isNaN(v) && om.vals[f.name] !== '') { denom++; if (v >= 0.75) numFunc++; } });
    if (denom === 0) return;
    months.push(om.label); funcPct.push(pct(numFunc, denom));
    var om2 = offsMap[om.label];
    if (om2) {
      var b = [0,0,0,0], offDen = 0;
      opFacs.forEach(function(f) {
        var v = Number(om2.vals[f.name]);
        if (!isNaN(v) && om2.vals[f.name] !== '') { offDen++; if (v === 1) b[0]++; else if (v === 2) b[1]++; else if (v === 3) b[2]++; else if (v >= 4) b[3]++; }
      });
      offDays.push(b.map(function(x) { return pct(x, offDen); }));
    } else offDays.push([0,0,0,0]);
  });
  var take = Math.min(8, months.length), s = months.length - take;
  return { months: months.slice(s), functionalPct: funcPct.slice(s), offDays: offDays.slice(s) };
}

function parseOpsSheet(sh) {
  var data = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var facRow = data[1], opRow = data[2], facs = [];
  for (var i = 4; i < facRow.length; i++) {
    var nm = String(facRow[i]).trim();
    if (nm) facs.push({ name: nm, idx: i, operational: isYes(opRow[i]) });
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

// ── Trained staff (per-state) ────────────────────────────────
function buildTrainedStaff(csFac) {
  var op = csFac.filter(function(f) { return isYes(f['T1D Clinic Operational?']); });
  var total = op.length || 1;
  return [
    { lbl:'With trained Pediatrician', v: pct(op.filter(function(f) { return isYes(f['Trained pediatrician available?']); }).length, total) },
    { lbl:'With trained MD Medicine',  v: pct(op.filter(function(f) { return isYes(f['Trained MD Medicine available?']); }).length, total) },
    { lbl:'With trained MO',           v: pct(op.filter(function(f) { return isYes(f['Trained Medical Officer available?']); }).length, total) }
  ];
}

// ── Capacity (per-state) ─────────────────────────────────────
function buildCapacitySection(cap, orient) {
  var doctors = cap.filter(function(r) { return norm(r['Type of Service Provider']) === 'doctor'; });
  var drTot = doctors.length || 1;
  var SPEC = { 'pediatrician':'Pediatrician','paediatrician':'Pediatrician','md medicine':'MD Medicine','medical officer':'Medical Officer','mo':'Medical Officer' };
  var specMap = {};
  doctors.forEach(function(r) { var d = norm(r['Designation/ Department']); specMap[SPEC[d] || 'Other'] = (specMap[SPEC[d] || 'Other'] || 0) + 1; });
  var specialty = ['Pediatrician','MD Medicine','Medical Officer','Other'].map(function(l) { return { l: l, v: pct(specMap[l] || 0, drTot) }; }).filter(function(d) { return d.v > 0; });
  var pilotDr = doctors.filter(function(r) { return isYes(r['Pilot facility? (Yes/No)']); }).length;
  var pilotSplit = [pct(pilotDr, drTot), 100 - pct(pilotDr, drTot)];
  var CADRE = { 'asha':'ASHA Worker','asha worker':'ASHA Worker','anm':'ANM','bcm':'BCM' };
  var cadreMap = {};
  orient.forEach(function(r) { var t = norm(r['Type of Service Provider']); var lbl = CADRE[t] || 'Other'; cadreMap[lbl] = (cadreMap[lbl] || 0) + (Number(r['# of Service Providers']) || 0); });
  var cadTot = Object.keys(cadreMap).reduce(function(s, k) { return s + (cadreMap[k] || 0); }, 0) || 1;
  var flwCadre = ['ASHA Worker','ANM','BCM','Other'].map(function(l) { return { l: l, v: pct(cadreMap[l] || 0, cadTot) }; }).filter(function(d) { return d.v > 0; });
  return { specialty: specialty, pilotSplit: pilotSplit, flwCadre: flwCadre };
}

// ── Mock sections (sheets not yet populated) ─────────────────
var SMBG_MOCK = {
  mom: [ {m:'Apr 26',v:[25,54,12,9],n:1512},{m:'Mar 26',v:[25,43,18,14],n:1398},{m:'Feb 26',v:[21,42,21,16],n:1244},{m:'Jan 26',v:[20,48,19,13],n:1108},{m:'Dec 25',v:[27,51,17,5],n:1002},{m:'Nov 25',v:[30,43,19,8],n:889} ],
  last: {m:'May 26',v:[25,55,12,8],n:911}
};
var GLYCEMIA_MOCK = { months:[{m:'May 26',n:943},{m:'Apr 26',n:891},{m:'Mar 26',n:824}], hyperDist:[[22,31,27,13,7],[20,29,28,15,8],[18,28,30,16,8]], hypoDist:[[63,20,10,5,2],[60,22,11,5,2],[62,21,10,5,2]] };
var HBA1C_MOCK = {
  changeLabels:[['Overall',''],['3–6 months',''],['6–9 months',''],['9–12 months',''],['12–15 months',''],['15–18 months',''],['>18 months','']],
  changeN:[0,0,0,0,0,0,0], improved4:[0,0,0,0,0,0,0], improved2:[0,0,0,0,0,0,0], improvedL:[0,0,0,0,0,0,0],
  noChange:[0,0,0,0,0,0,0], worsenedL:[0,0,0,0,0,0,0], worsened2:[0,0,0,0,0,0,0], worsened4:[0,0,0,0,0,0,0],
  avgBaseline:[0,0,0,0,0,0,0], avgLatest:[0,0,0,0,0,0,0],
  distLabels:[['3–6m',''],['6–9m',''],['9–12m',''],['12–15m',''],['15–18m',''],['>18m','']],
  distLt7:[0,0,0,0,0,0], dist7_10:[0,0,0,0,0,0], dist10_13:[0,0,0,0,0,0], dist13_16:[0,0,0,0,0,0], distGt16:[0,0,0,0,0,0], latestAvg:[0,0,0,0,0,0]
};

// ── Health check ─────────────────────────────────────────────
function testPayload() {
  var p = buildPayload();
  Logger.log('schema=' + p.meta.schemaVersion + '  n=' + p.meta.n);
  Logger.log('segment count: ' + Object.keys(p.segments).length);
  ['all|all|all|all','RJ|all|all|all','all|M|all|all','all|all|ped|all','all|all|all|active','RJ|F|adu|active'].forEach(function(k) {
    var s = p.segments[k];
    if (!s) { Logger.log(k + ' → MISSING'); return; }
    Logger.log(k + ' → csEnr=' + s.csEnr + ' insLast=' + s.insLast + '% dka=' + s.dka + '% gender=' +
      JSON.stringify(s.demographics.gender.map(function(g){return g.v;})) + ' fupMonths=' + s.followup.mom.length);
  });
  var g = p.states.all;
  Logger.log('states.all: csOp=' + g.csOp + ' target=' + g.target + ' drTr=' + g.drTr + ' flwHr=' + g.flwHr);
  Logger.log('trainedByState.all: ' + JSON.stringify(p.trainedByState.all));
  Logger.log('clinicOps.functionalPct: ' + JSON.stringify(p.clinicOps.functionalPct));
  Logger.log('seriesByState.all.csCum last: ' + p.seriesByState.all.csCum.slice(-3));
}
