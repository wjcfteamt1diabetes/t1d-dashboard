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
  assert.match(tab, /id="growth-change-metric"/);
  assert.match(tab, /About this data/);
  assert.equal(tab.includes('id="c-growth-mix"'), false);
  assert.equal(tab.includes('id="growth-paired-caveat"'), false);
  assert.equal(tab.includes('Did BMI improve'), false);
  assert.equal(tab.includes('Did underweight fall'), false);
  assert.match(tab, /id="growth-pace-title"/);
  assert.match(tab, /id="growth-hba-title"/);
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

test('the age heading and the shared who-is-counted note are computed', () => {
  const {run} = setup();
  assert.match(html, /_oneDp\?Number\(v\)\.toFixed\(1\)\+'%':v\+'%'/);
  const heading = run('growthAgeHeading([{latestAge:2},{latestAge:18.6},{latestAge:18.1}])');
  assert.match(heading, /latest age 2\.0–18\.6 years/);
  assert.match(heading, /2 are 18 or older/);
  const who = run("growthWhoText({cohort:10, noSexOrPair:1, shortGap:2, bazImplausible:3, hazImplausible:0, wazImplausible:0, wazNotApplicable:4})");
  assert.match(who, /^Who is counted/);
  assert.match(who, /No usable sex or weight and height: 1/);
  assert.match(who, /after 120 months/);
});

test('Wilson intervals, McNemar and the paired net change match the checked counts', () => {
  const {run} = setup();
  const got = run(`(() => {
    const thin = growthWilson(371, 1736);
    const stunt = growthWilson(556, 1738);
    const over = growthWilson(206, 1736);
    const under = growthWilson(99, 474);
    const thinFlow = growthPairedDiff(131, 68, 1195);
    const stuntFlow = growthPairedDiff(43, 77, 1195);
    const thinText = growthBmiChangeTakeaway({all:{
      n:1195, leftThin:131, enteredThin:68,
      first:{thinPct:25}, latest:{thinPct:19.7},
      net:-5.3, netLo:-7.6, netHi:-3, p:0.000009
    }});
    const underText = growthUnderTakeaway({n:295, firstPct:19.3, latestPct:18, net:-1.4, lo:-4, hi:1.3, p:0.68});
    const stuntText = growthStuntTakeaway({all:{n:1195, firstPct:29.5, latestPct:32.3, out:43, inn:77, net:2.8, lo:1.1, hi:4.6, p:0.0024468567628141693}});
    const attrition = growthAttritionSentence({baseN:1734, leftN:539, keptN:1195, shortN:539, shortGap:541, shortWithBase:539, noLaterN:0, leftThinPct:25.6, keptThinPct:25});
    const who = growthWhoText({cohort:2015, noSexOrPair:277, shortGap:541, bazImplausible:6, hazImplausible:0, wazImplausible:0, wazNotApplicable:1264}, {baseN:1734, leftN:539, keptN:1195, shortGap:541, shortWithBase:539, noLaterN:0, leftThinPct:25.6, keptThinPct:25});
    const edge = growthPairedDiff(47, 29, 486);
    const checks = [[131,68,1195],[43,77,1195],[29,25,295],[47,29,486],[13,4,243]].map(row => {
      const d = growthPairedDiff(row[0], row[1], row[2]);
      return (d.p < 0.05) === (d.hi < 0 || d.lo > 0);
    });
    return {
      thin, stunt, over, under, thinFlow, stuntFlow, thinText, underText, stuntText, attrition, who,
      tie: growthMcNemar(4, 4),
      real: growthVerdict(0.0024),
      border: growthVerdict(0.0504),
      border2: growthVerdict(0.09),
      noise: growthVerdict(0.68),
      edgeP: edge.p, edgeLo: edge.lo, edgeHi: edge.hi,
      checks,
      contradict: growthShownVerdict(0.04, -1, 1),
      contradictHigh: growthShownVerdict(0.2, -2, -0.2),
      placeExact: growthPlaceTakeaway({mode:'state', rows:[{label:'Madhya Pradesh', n:100, thinPct:24, thinLo:20.1, thinHi:28.4}]}),
      placeWide: growthPlaceTakeaway({mode:'district', rows:[{label:'Narsinghpur', n:22, thinPct:45.5, thinLo:24.5, thinHi:68},{label:'Smaller', n:10, thinPct:90, thinLo:70, thinHi:99}]})
    };
  })()`);
  assert.equal(got.thin.lo, 19.5);
  assert.equal(got.thin.hi, 23.4);
  assert.equal(got.stunt.lo, 29.8);
  assert.equal(got.stunt.hi, 34.2);
  assert.equal(got.over.lo, 10.4);
  assert.equal(got.over.hi, 13.5);
  assert.equal(got.under.lo, 17.5);
  assert.equal(got.under.hi, 24.8);
  assert.equal(got.thinFlow.net, -5.3);
  assert.equal(got.thinFlow.lo, -7.5);
  assert.equal(got.thinFlow.hi, -2.9);
  assert.ok(got.thinFlow.p < 0.05);
  assert.equal(got.stuntFlow.net, 2.8);
  assert.equal(got.stuntFlow.lo, 1);
  assert.equal(got.stuntFlow.hi, 4.6);
  assert.ok(Math.abs(got.stuntFlow.p - 0.0024) < 0.0001);
  assert.equal(got.tie, 1);
  assert.equal(got.real, 'a real change');
  assert.equal(got.border, 'borderline, may be chance');
  assert.equal(got.border2, 'borderline, may be chance');
  assert.equal(got.noise, 'within normal variation');
  assert.ok(got.edgeP >= 0.05 && got.edgeP < 0.10);
  assert.ok(got.edgeLo <= 0 && got.edgeHi >= 0);
  assert.equal(got.checks.every(Boolean), true);
  assert.equal(got.contradict, 'borderline, may be chance');
  assert.equal(got.contradictHigh, 'borderline, may be chance');
  assert.match(got.placeExact, /Madhya Pradesh has the highest thinness \(24\.0%\)/);
  assert.equal(got.placeExact.includes('wide range'), false);
  assert.match(got.placeWide, /Narsinghpur has the highest thinness \(45\.5%\)/);
  assert.match(got.placeWide, /Small group, wide range/);
  assert.equal(run("growthChangeTitle('Thinness', 25, 19.7, 0.00001)"), 'Thinness fell from 25.0% to 19.7%');
  assert.equal(run("growthChangeTitle('Stunting', 29.5, 32.3, 0.0024)"), 'Stunting rose from 29.5% to 32.3%');
  assert.equal(run("growthChangeTitle('Underweight', 19.3, 18, 0.68)"), 'Underweight is about the same (19.3% to 18.0%)');
  assert.match(run('growthChangeNote(131, 68, 0.000009)'), /131 moved out, 68 moved in\. This is a real change/);
  assert.match(run('growthChangeNote(29, 25, 0.68)'), /within normal variation/);
  assert.match(run("growthNowNote({under:{n:99,N:474}, wazNotApplicable:1267})"), /Underweight is only scored to age 10 \(99 of 474\)\. 1,267 children are older\./);
  assert.match(run("growthFaceLine({cohort:2018, noSexOrPair:277, shortGap:545}, {shortGap:545, leftN:539, keptN:1195, leftThinPct:25.6, keptThinPct:25})"), /2,018 children in this view\. 277 have no usable measure\. 545 have a second visit under 3 months later; their starting thinness was similar\./);
  assert.equal(got.who.includes('Gap under 3 months'), false);
  assert.equal((got.who.match(/3 months/g) || []).length, 1);
  assert.match(got.thinText, /131 moved out of thin, 68 moved into thin, net -5\.3 points \(95% CI -7\.6 to -3\.0\)/);
  assert.match(got.thinText, /a real change/);
  assert.match(got.underText, /19\.3% to 18\.0%/);
  assert.match(got.underText, /n=295/);
  assert.match(got.underText, /within normal variation/);
  assert.match(got.underText, /p=0\.68/);
  assert.match(got.stuntText, /29\.5% to 32\.3%/);
  assert.match(got.stuntText, /43 moved out of stunting, 77 moved into stunting, net \+2\.8 points \(95% CI \+1\.1 to \+4\.6\)/);
  assert.match(got.stuntText, /p=0\.0024/);
  assert.match(got.stuntText, /Height catch-up is slow/);
  assert.match(got.attrition, /541 have a second measurement less than 3 months after the first \(539 of the 1,734 with a baseline BMI-for-age\)/);
  assert.match(got.attrition, /similar \(25\.6% vs 25\.0%\)/);
});

test('same-child flows and the attrition note are computed from the children, not typed in', () => {
  const {run, context} = setup();
  const kids = [];
  for (let i = 0; i < 12; i++) kids.push(kid('stay'+i, {baseBaz: -2.5, baz: -2.5, gap: 8, band: '6–12', baseExtra: {haz: -2.5, waz: -2.4}, latestExtra: {haz: -1, waz: -1}}));
  for (let i = 0; i < 8; i++) kids.push(kid('out'+i, {baseBaz: -2.5, baz: -1, gap: 14, band: '12–18', baseExtra: {haz: -1, waz: -1}, latestExtra: {haz: -2.5, waz: -2.4}}));
  for (let i = 0; i < 6; i++) kids.push(kid('short'+i, {baseBaz: -3, baz: -1, gap: 1}));
  context.kids = kids;
  const got = run(`(() => {
    const plain = growthPlain(kids, {state:'all'});
    const thin = plain.bmiChange.all;
    const stunt = plain.stuntChange.all;
    const who = growthWhoText(plain.exclusions, plain.attrition);
    return {
      out: thin.leftThin, inn: thin.enteredThin, net: thin.net, p: thin.p,
      stuntOut: stunt.out, stuntIn: stunt.inn, stuntNet: stunt.net,
      underOut: plain.under.out, underIn: plain.under.inn,
      lo: plain.now.thin.lo, hi: plain.now.thin.hi,
      who
    };
  })()`);
  assert.equal(got.out, 8);
  assert.equal(got.inn, 0);
  assert.ok(got.net < 0);
  assert.ok(got.p < 0.05);
  assert.equal(got.stuntOut, 12);
  assert.equal(got.stuntIn, 8);
  assert.ok(got.stuntNet < 0);
  assert.equal(got.underOut, 12);
  assert.equal(got.underIn, 8);
  assert.equal(typeof got.lo, 'number');
  assert.ok(got.hi > got.lo);
  assert.match(got.who, /second measurement less than 3 months after the first/);
  assert.equal((got.who.match(/3 months/g) || []).length, 1);
});

test('horizontal bar labels stay inside only when they fit clear of the whisker', () => {
  const {run} = setup();
  assert.equal(run('growthHorizontalLabelPlan(120, 36, 120, 12)'), 'inside');
  assert.equal(run('growthHorizontalLabelPlan(80, 36, 28, 12)'), 'outside');
  assert.equal(run('growthHorizontalLabelPlan(80, 36, 80, 3)'), 'outside');
  assert.equal(run("contrastRatio('#0b2545','#ffffff')") >= 4.5, true);
});

test('narrow charts, contact columns and the partial-month mark stay display-only', () => {
  const {run} = setup();
  assert.match(html, /rel="icon"/);
  assert.match(html, /id="c1-sub">\* partial month/);
  assert.equal(html.includes('id="growth-pace-n"'), false);
  assert.match(html, /monthIsOpen\(label\)\?'\*'/);
  assert.match(html, /8\.5% target/);
  assert.match(html, /bar\.x-half/);
  assert.equal(html.includes('getPixelForTick'), false);
  assert.equal(run("sheetFetchQuery('Capacity_Building')"), 'select A,B,C,D,E,F,G,H,I,L,M,N,O,P,Q,R,S,T,U,V,W');
  assert.equal(run("sheetFetchQuery('Enrolled List')"), '');
  assert.equal(run("growthChangeAxisLabel('12–18 months', true)"), '12–18m');
  assert.equal(run("growthChangeAxisLabel('18+ months', true)"), '18+m');
  assert.equal(run("growthChangeAxisLabel('All', false)"), 'All');
  assert.equal(run('growthNarrow()'), false);
  const got = run(`(() => {
    const grid = [[
      'State','Name of Service Provider','Type of Service Provider','Designation/ Department','','','Attended on Day 1','Attended on Day 2','','','','Training Venue'
    ],[
      'RJ','Asha','Doctor','Pediatrician','B1','2024-01-01','Yes','Yes','10','4','8','Hall'
    ]];
    const rows = parseCapacity(grid);
    const dropped = dropContactColumns([
      ['Name of Service Provider','Contact Number','Email ID','Type of Service Provider'],
      ['Asha','hidden-phone','hidden-mail','Doctor']
    ]);
    return {
      batch: rows[0]['Training Batch'],
      pre: rows[0]['Pre-test Score'],
      post: rows[0]['Post-test Score'],
      max: rows[0]['Maximum Score'],
      keys: Object.keys(rows[0]).join('|'),
      headers: dropped[0].join('|'),
      kept: dropped[1].join('|')
    };
  })()`);
  assert.equal(got.batch, 'B1');
  assert.equal(got.pre, '4');
  assert.equal(got.post, '8');
  assert.equal(got.max, '10');
  assert.equal(got.keys.includes('Contact'), false);
  assert.equal(got.headers.includes('Contact Number'), false);
  assert.equal(got.headers.includes('Email ID'), false);
  assert.equal(got.kept.includes('hidden-phone'), false);
  assert.equal(got.kept, 'Asha|Doctor');
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
  assert.equal(elements['growth-heading'].hidden, true);
  assert.equal(elements['growth-lead'].hidden, true);
  assert.equal(elements['growth-body'].hidden, true);
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
