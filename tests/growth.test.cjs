const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].split('// ── Passcode gate')[0];

function browserStub(){
  const elements = {};
  return {
    elements,
    document: {
      getElementById(id){
        return elements[id] ??= {value: 'all', textContent: '', innerHTML: '', style: {}, hidden: false, classList: {toggle(){}, add(){}, remove(){}}};
      },
      createElement(){return {style: {}, textContent: '', className: '', hidden: false, appendChild(){}};},
      addEventListener(){},
      querySelector(){return null;},
      querySelectorAll(){return [];},
      body: {classList: {toggle(){}, add(){}, remove(){}}}
    }
  };
}
function setup(){
  const stub = browserStub();
  const context = vm.createContext({
    console: {warn(){}, error(){}, log(){}},
    window: {devicePixelRatio: 1, addEventListener(){}},
    Chart: {defaults: {font: {}}, register(){}},
    document: stub.document
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  return {run, elements: stub.elements, context};
}
function setupWho(){
  const stub = browserStub();
  const context = vm.createContext({
    console: {warn(){}, error(){}, log(){}},
    window: {devicePixelRatio: 1, addEventListener(){}},
    Chart: {defaults: {font: {}}, register(){}},
    document: stub.document
  });
  const dir = require('node:path').join(__dirname, '../who');
  vm.runInContext(fs.readFileSync(require('node:path').join(dir, 'who-lms.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require('node:path').join(dir, 'who-z.js'), 'utf8'), context);
  vm.runInContext(source, context);
  return {run: code => vm.runInContext(code, context), elements: stub.elements, context};
}
function child(id, extra){
  return Object.assign({
    Claude_ID: id, State: 'RJ', District: 'Jaipur', Facility: 'CS Jaipur', Sex: 'Male',
    Baseline_age_y: '7', Latest_age_y: '8',
    Baseline_weight_kg: '22', Latest_weight_kg: '25',
    Baseline_height_cm: '120', Latest_height_cm: '127',
    Latest_HbA1c: '10.5', Enrolment_date: '2026-06-15'
  }, extra);
}
function idSet(ids){
  const set = {};
  ids.forEach(id => { set[String(id).toLowerCase()] = true; });
  return set;
}
function point(baz, extra){
  return Object.assign({baz, haz: -1, waz: -1, ageMonths: 96, wazNotApplicable: false, missing: false}, extra);
}
function kid(id, spec){
  spec = spec || {};
  return {
    id, state: spec.state || 'RJ', district: spec.district || 'Jaipur', sex: spec.sex || 'Male',
    latestHba: spec.hba, gapMonths: spec.gap == null ? 12 : spec.gap, careBand: spec.band || '',
    baseWeight: spec.bw == null ? 22 : spec.bw, latestWeight: spec.lw == null ? 25 : spec.lw,
    whoBase: spec.base || point(spec.baseBaz == null ? 0 : spec.baseBaz, spec.baseExtra),
    whoLatest: spec.latest || point(spec.baz == null ? 0 : spec.baz, spec.latestExtra)
  };
}

test('growth monitoring is shown while SHOW_GROWTH is on', () => {
  const {run, elements} = setup();
  assert.match(html, /let SHOW_GROWTH = true/);
  assert.match(html, /id="growth-section"/);
  assert.equal(run('SHOW_GROWTH'), true);
  assert.equal(elements['growth-section'].hidden, false);
  run('SHOW_GROWTH=false; applyGrowthVisibility();');
  assert.equal(elements['growth-section'].hidden, true);
});

test('growth section uses plain shares and no longer loads the visit trend', () => {
  const tab = html.slice(html.indexOf('id="tab-1"'), html.indexOf('id="tab-2"'));
  assert.match(tab, /Did BMI improve/);
  assert.match(tab, /Did underweight fall/);
  assert.match(tab, /keeping up with expected weight gain/i);
  assert.match(tab, /Latest HbA1c/);
  assert.match(tab, /id="growth-thin-pct"/);
  assert.equal(tab.includes('Month-on-month'), false);
  assert.equal(tab.includes('weight-for-height'), false);
  assert.equal(html.includes("load(C.wb1,'Growth_milestones'"), false);
  assert.equal(html.includes("load(C.wb1,'Growth_visits_dash'"), false);
  assert.match(html, /load\(C\.wb1,'Growth_child',\{soft:true\}\)/);
});

test('published shares are the tenth-percent split, and the plan counts round the same way', () => {
  const {run} = setup();
  assert.equal(JSON.stringify(run('pctTenths([173,913,344,52])')), JSON.stringify([11.7, 61.6, 23.2, 3.5]));
  assert.equal(run('growthPct(371,1736)'), 21.4);
  assert.equal(run('growthPct(556,1738)'), 32.0);
  assert.equal(run('growthPct(206,1736)'), 11.9);
  assert.equal(run('growthPct(299,1195)'), 25.0);
  assert.equal(run('growthPct(236,1195)'), 19.7);
  assert.equal(run('growthPct(352,1195)'), 29.5);
  assert.equal(run('growthPct(386,1195)'), 32.3);
  const mix = run(`(() => {
    const zs = [];
    for (let i = 0; i < 371; i++) zs.push(-3);
    for (let i = 0; i < 206; i++) zs.push(2);
    while (zs.length < 1736) zs.push(0);
    return growthMix(zs);
  })()`);
  assert.equal(mix.thinPct, 21.4);
  assert.equal(mix.overPct, 11.9);
  assert.equal(mix.n, 1736);
});

test('headers are read by name, and a missing or empty tab is not an error', () => {
  const {run} = setup();
  assert.equal(run('growthObjects(null)'), null);
  assert.equal(run('growthObjects([])'), null);
  assert.equal(run("growthObjects([['Note'],['soon']])"), null);
  assert.equal(run("growthObjects([['Claude_ID','BAZ_bucket']])"), null);
  const parsed = run(`growthObjects([
    ['BAZ_bucket','District','Claude_ID'],
    ['Watch','Kota','c9']
  ])`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].Claude_ID, 'c9');
  const view = run("growthView({age:'all'}, {status:'missing'})");
  assert.equal(view.mode, 'missing');
  const adults = run("growthView({age:'adu'}, {status:'ok', cohort:3})");
  assert.equal(adults.mode, 'adults');
  assert.equal(adults.message, 'Not applicable for adults');
});

test('blank numeric growth headers are refilled, and a fully blank header stays hidden', () => {
  const {run} = setup();
  const got = run(`(() => {
    const keep = new Set(['Claude_ID','State','BAZ_bucket']);
    const hdr = GR_CHILD_CANON.map(h => keep.has(h) ? h : '');
    const row = GR_CHILD_CANON.map(h => h==='Claude_ID'?'c1':h==='State'?'RJ':h==='Latest_HbA1c'?'10.70':h==='BAZ_bucket'?'Stable':'');
    const child=[hdr, row];
    const childFilled = fillGrowthHeaders(child, ['Claude_ID','State','BAZ_bucket'], GR_CHILD_CANON);
    const parsed = growthObjects(child)[0];
    const blank = [GR_CHILD_CANON.map(()=>''), GR_CHILD_CANON.map((_,i)=> i===0 ? 'c1' : '1')];
    const blankFilled = fillGrowthHeaders(blank, ['Claude_ID','State','BAZ_bucket'], GR_CHILD_CANON);
    return {childFilled, hba: parsed.Latest_HbA1c, blankFilled, blankRows: growthObjects(blank)};
  })()`);
  assert.equal(got.childFilled, true);
  assert.equal(got.hba, '10.70');
  assert.equal(got.blankFilled, false);
  assert.equal(got.blankRows, null);
});

test('plain groups use the WHO cuts and hide shares under 20', () => {
  const {run, context} = setup();
  const kids = [];
  for (let i = 0; i < 10; i++) kids.push(kid('t'+i, {baz: -2.1, baseBaz: -3, gap: 8, band: '6–12', hba: 10.96}));
  for (let i = 0; i < 10; i++) kids.push(kid('h'+i, {baz: -2, baseBaz: 0, gap: 4, band: '3–6', hba: 10.33}));
  for (let i = 0; i < 5; i++) kids.push(kid('o'+i, {baz: 1.2, baseBaz: 0.2, gap: 20, band: '18+', hba: 9.59}));
  kids.push(kid('edge', {baz: 1, baseBaz: -2, gap: 2}));
  kids.push(kid('young', {baz: -3, gap: 2, latestExtra: {ageMonths: 40, waz: null, wazNotApplicable: false}}));
  kids.push(kid('old', {baz: 0, gap: 2, latestExtra: {ageMonths: 130, waz: null, wazNotApplicable: true}, baseExtra: {waz: null, wazNotApplicable: true}}));
  context.kids = kids;
  const got = run(`(() => {
    const plain = growthPlain(kids, {state:'all'});
    const small = growthPlain(kids.slice(0, 5), {state:'all'});
    return {
      thin: plain.now.thin, stunt: plain.now.stunt, over: plain.now.over,
      under5: plain.now.under5, wazNa: plain.now.wazNotApplicable,
      edge: growthBmiGroup(1), edgeLow: growthBmiGroup(-2), justThin: growthBmiGroup(-2.01),
      changeN: plain.bmiChange.all.n,
      left: plain.bmiChange.all.leftThin,
      thinFirst: plain.bmiChange.all.thinFirst,
      smallTake: growthNowTakeaway(small.now),
      hba: plain.hba.groups.map(g => ({key: g.key, n: g.n, mean: g.mean}))
    };
  })()`);
  assert.equal(got.edge, 'healthy');
  assert.equal(got.edgeLow, 'healthy');
  assert.equal(got.justThin, 'thin');
  assert.equal(got.changeN, 25);
  assert.equal(got.thinFirst, 10);
  assert.equal(got.left, 0);
  assert.equal(got.under5.n, 1);
  assert.equal(got.under5.thin, 1);
  assert.equal(got.wazNa, 1);
  assert.equal(got.smallTake, '');
  assert.equal(got.hba.find(g => g.key === 'thin').mean, null);
  assert.ok(got.thin.N >= 20);
});

test('same-child change, underweight and weight pace follow the filters and the age limit', () => {
  const {run, context} = setup();
  const kids = [];
  for (let i = 0; i < 20; i++) {
    kids.push(kid('a'+i, {
      state: 'RJ', district: 'Jaipur',
      sex: i < 8 ? 'Male' : 'Female',
      baseBaz: -2.5, baz: i < 8 ? -1 : -2.5,
      gap: i < 10 ? 4 : 14, band: i < 10 ? '3–6' : '12–18',
      baseExtra: {waz: -2.4}, latestExtra: {waz: i < 10 ? -2.2 : -1.2},
      bw: 20, lw: i < 10 ? 21 : 24
    }));
  }
  for (let i = 0; i < 5; i++) kids.push(kid('small'+i, {state: 'RJ', district: 'Kota', baz: -3, baseBaz: -3, gap: 9, band: '6–12'}));
  context.kids = kids;
  const got = run(`(() => {
    const open = growthPlain(kids, {state:'all'});
    const districts = growthPlain(kids.filter(k => k.state === 'RJ'), {state:'RJ'});
    const pace = open.pace.all;
    return {
      left: open.bmiChange.all.leftThin,
      thinFirst: open.bmiChange.all.thinFirst,
      firstThin: open.bmiChange.all.first.thinPct,
      latestThin: open.bmiChange.all.latest.thinPct,
      underFirst: open.under.firstPct,
      underLatest: open.under.latestPct,
      underN: open.under.n,
      fell: pace.fell, steady: pace.steady, rose: pace.rose, kg: pace.kgYear,
      hiddenBand: open.bmiChange.bands.find(b => b.key === '6–12').hidden,
      mode: districts.place.mode,
      places: districts.place.rows.map(r => r.label)
    };
  })()`);
  assert.equal(got.thinFirst, 25);
  assert.equal(got.left, 8);
  assert.equal(typeof got.firstThin, 'number');
  assert.ok(got.latestThin < got.firstThin);
  assert.equal(got.underN, 25);
  assert.equal(typeof got.underFirst, 'number');
  assert.ok(got.underLatest < got.underFirst);
  assert.equal(got.fell + got.steady + got.rose, 25);
  assert.equal(typeof got.kg, 'number');
  assert.equal(got.hiddenBand, true);
  assert.equal(got.mode, 'district');
  assert.equal(JSON.stringify(got.places), JSON.stringify(['Jaipur']));
});

test('sex, period and the roster change who is counted', () => {
  const {run, context} = setupWho();
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push(child('m'+i, {Sex: 'Male', State: 'RJ', Enrolment_date: '2026-06-15'}));
  for (let i = 0; i < 12; i++) rows.push(child('f'+i, {Sex: 'Female', State: 'MP', District: 'Bhopal', Enrolment_date: '2020-01-15'}));
  context.rows = rows;
  context.ids = idSet(rows.map(r => r.Claude_ID));
  context.rjIds = idSet(rows.filter(r => r.State === 'RJ').map(r => r.Claude_ID));
  const got = run(`(() => {
    const open = {state:'all', sex:'all', age:'all', period:'all'};
    const all = computeGrowth(ids, rows, open).plain.now.thin.N;
    const male = computeGrowth(ids, rows, Object.assign({}, open, {sex:'M'})).plain.now.thin.N;
    const recent = computeGrowth(ids, rows, Object.assign({}, open, {period:'12'})).cohort;
    const rj = computeGrowth(rjIds, rows, open).cohort;
    const none = computeGrowth({}, rows, open).cohort;
    const hba = computeGrowth(ids, rows, open).plain.hba.groups;
    return {all, male, recent, rj, none, hbaN: hba.reduce((s,g)=>s+g.n,0)};
  })()`);
  assert.ok(got.all > got.male);
  assert.equal(got.male, 12);
  assert.equal(got.recent, 12);
  assert.equal(got.rj, 12);
  assert.equal(got.none, 0);
  assert.equal(got.hbaN, 24);
});

test('a short growth insight is hidden below 20 children', () => {
  const {run, elements} = setup();
  run("growthInsight('growth-now-take', '21.4% are thin', 19)");
  assert.equal(elements['growth-now-take'].hidden, true);
  run("growthInsight('growth-now-take', '21.4% are thin', 20)");
  assert.equal(elements['growth-now-take'].hidden, false);
  assert.equal(elements['growth-now-take'].textContent, '21.4% are thin');
});

test('missing growth tab and the adult filter show a friendly state', async () => {
  const {run, elements, context} = setup();
  run(`SHOW_GROWTH=true; GROWTH={status:'missing'}; renderGrowth();`);
  assert.equal(elements['growth-status'].textContent, 'Growth data not yet available');
  assert.equal(elements['growth-body'].hidden, true);
  run(`getF=()=>({age:'adu', state:'all'}); GROWTH={status:'ok', cohort:4}; renderGrowth();`);
  assert.equal(elements['growth-status'].textContent, 'Not applicable for adults');
  const calls = [];
  context.fetchTab = async (id, name) => {
    calls.push(name);
    if (name === 'Growth_child') throw new Error('HTTP 400 for "'+name+'"');
    if (name === 'Enrolled List') return [['Claude_ID','State','Age','Sex','Facility Name','Date of enrolment'], ...Array.from({length: 50}, (_, i) => ['synthetic-'+i, 'RJ', '10', 'Male', 'CS Jaipur', '2026-01-01'])];
    if (name === 'Targets') return [['State','Enrolment target'], ['RJ','1']];
    return [['State']];
  };
  run('buildGeo=populateFilters=buildInfoTable=addSumNotes=()=>{}; applyFilters=()=>{recompute();};');
  await run('boot()');
  assert.equal(run('GROWTH.status'), 'missing');
  assert.ok(calls.includes('Growth_child'));
  assert.equal(calls.includes('Growth_milestones'), false);
  assert.equal(calls.includes('Growth_visits_dash'), false);
  assert.equal(calls.length, 13);
});
