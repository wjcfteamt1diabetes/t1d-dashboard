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
  const run = code => vm.runInContext(code, context);
  return {run, elements: stub.elements, context};
}

function child(id, extra){
  return Object.assign({
    Claude_ID: id, State: 'RJ', District: 'Jaipur', Facility: 'CS Jaipur',
    BAZ_bucket: 'Stable', HAZ_bucket: 'Stable', dHAZ: '0.20',
    Time_in_care_bucket: '18+ months', Growth_group: 'steady or improved',
    BMI_category_latest: 'Normal', Stunted_latest: 'No',
    Latest_BMI_within_6m: 'Yes', Latest_HAZ_within_6m: 'Yes',
    Latest_HbA1c: '8', dHbA1c: '', Enrolment_quarter: '2025-Q1'
  }, extra);
}
function idSet(ids){
  const set = {};
  ids.forEach(id => { set[String(id).toLowerCase()] = true; });
  return set;
}

test('growth monitoring is shown while SHOW_GROWTH is on', () => {
  const {run, elements} = setup();
  assert.match(html, /let SHOW_GROWTH = true/);
  assert.match(html, /id="growth-section"/);
  assert.equal(run('SHOW_GROWTH'), true);
  assert.equal(elements['growth-section'].hidden, false);
  run('SHOW_GROWTH=false; applyGrowthVisibility();');
  assert.equal(elements['growth-section'].hidden, true);
  run('SHOW_GROWTH=true; applyGrowthVisibility();');
  assert.equal(elements['growth-section'].hidden, false);
});

test('growth section sits on the clinical tab and loads both sheets by name', () => {
  const tab = html.slice(html.indexOf('id="tab-1"'), html.indexOf('id="tab-2"'));
  assert.ok(tab.indexOf('tc-wrap cs-only') >= 0);
  assert.ok(tab.indexOf('Growth (ages 2–18)') > tab.indexOf('tc-wrap cs-only'));
  assert.match(tab, /including state, division, district, facility, DPC, support, sex, age group, status and enrolment period/);
  assert.match(tab, /id="c-growth-bmi-under"/);
  assert.match(tab, /id="growth-wt-metric"/);
  assert.match(tab, /weight in kilograms, height in centimetres/);
  assert.match(html, /weight_kg, height_cm/);
  assert.match(tab, /BMI-for-age \(BAZ\) is BMI, weight divided by height squared, scored against the WHO reference/);
  assert.match(tab, /0 is the WHO median/);
  assert.match(tab, /The benchmark is the WHO median, z = 0, for the same age and sex/);
  assert.match(html, /BMI-for-age score \(BAZ\)/);
  assert.match(html, /Height-for-age score \(HAZ\)/);
  assert.match(html, /Score \(0 = reference median for the same age and sex\)/);
  assert.equal(html.includes('bin mean'), false);
  assert.equal(html.includes('Month bin'), false);
  assert.equal(html.includes('Mean z-score'), false);
  assert.match(html, /load\(C\.wb1,'Growth_child',\{soft:true\}\)/);
  assert.match(html, /load\(C\.wb1,'Growth_milestones',\{soft:true\}\)/);
  assert.equal(html.includes('Growth_child:'), false);
  assert.match(html, /sheet='\+encodeURIComponent\(tabName\)/);
});

test('published growth shares are the tenth-percent split of those counts', () => {
  const {run} = setup();
  // Live sheet, once synced: chart 1 All N=1,482 and chart 3 All N=1,420.
  // These counts are the integer split behind the published shares. They are not hard-coded in the dashboard.
  assert.equal(JSON.stringify(run('pctTenths([173,913,344,52])')), JSON.stringify([11.7, 61.6, 23.2, 3.5]));
  assert.equal(JSON.stringify(run('pctTenths([124,180,959,126,31])')), JSON.stringify([8.7, 12.7, 67.5, 8.9, 2.2]));
  assert.equal(run('growthPct(149,500)'), 29.8);
});

test('headers are read by name, and a missing or empty tab is not an error', () => {
  const {run} = setup();
  assert.equal(run('growthObjects(null)'), null);
  assert.equal(run('growthObjects([])'), null);
  assert.equal(run("growthObjects([['Note'],['soon']])"), null);
  assert.equal(run("growthObjects([['Claude_ID','BAZ_bucket']])"), null);
  const parsed = run(`growthObjects([
    ['BAZ_bucket','District','Claude_ID','Time_in_care_bucket'],
    ['Watch','Kota','c9','0–6 months']
  ])`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].Claude_ID, 'c9');
  assert.equal(parsed[0].BAZ_bucket, 'Watch');
  const view = run("growthView({age:'all'}, {status:'missing'})");
  assert.equal(view.mode, 'missing');
  assert.equal(view.message, 'Growth data not yet available');
  const adults = run("growthView({age:'adu'}, {status:'ok', cohort:3})");
  assert.equal(adults.mode, 'adults');
  assert.equal(adults.message, 'Not applicable for adults');
});

test('blank numeric growth headers are refilled, and a fully blank header stays hidden', () => {
  const {run} = setup();
  const got = run(`(() => {
    const keep = new Set(['Claude_ID','State','BAZ_bucket','Time_in_care_bucket','Growth_group']);
    const hdr = GR_CHILD_CANON.map(h => keep.has(h) ? h : '');
    const row = GR_CHILD_CANON.map(h => h==='Claude_ID'?'c1':h==='State'?'RJ':h==='dHAZ'?'0.04':h==='Latest_HbA1c'?'10.70':h==='BAZ_bucket'?'Stable':h==='Time_in_care_bucket'?'18+ months':h==='Growth_group'?'steady or improved':'');
    const child=[hdr, row];
    const mileHdr = GR_MILE_CANON.map(h => ['Claude_ID','Enrolment_quarter','State'].includes(h) ? h : '');
    const mileRow = GR_MILE_CANON.map(h => h==='Claude_ID'?'c1':h==='Month_bin'?'6':h==='Mean_BAZ'?'-0.40':h==='Mean_HAZ'?'-1.20':h==='Enrolment_quarter'?'2025-Q3':h==='State'?'RJ':'');
    const miles=[mileHdr, mileRow];
    const childFilled = fillGrowthHeaders(child, ['Claude_ID','State','BAZ_bucket'], GR_CHILD_CANON);
    const mileFilled = fillGrowthHeaders(miles, ['Claude_ID','Enrolment_quarter','State'], GR_MILE_CANON);
    const parsed = growthObjects(child)[0];
    const mile = growthObjects(miles)[0];
    const blank = [GR_CHILD_CANON.map(()=>''), GR_CHILD_CANON.map((_,i)=> i===0 ? 'c1' : '1')];
    const blankFilled = fillGrowthHeaders(blank, ['Claude_ID','State','BAZ_bucket'], GR_CHILD_CANON);
    const blankMile = [GR_MILE_CANON.map(()=>''), ['c1','0','1','1','1','1','2025-Q1','RJ','M','CS Jaipur','Jaipur']];
    const blankMileFilled = fillGrowthHeaders(blankMile, ['Claude_ID','Enrolment_quarter','State'], GR_MILE_CANON);
    return {
      childFilled, mileFilled,
      dHaz: parsed.dHAZ, hba: parsed.Latest_HbA1c, baz: parsed.BAZ_bucket,
      dHazHeader: child[0][GR_CHILD_CANON.indexOf('dHAZ')],
      hbaHeader: child[0][GR_CHILD_CANON.indexOf('Latest_HbA1c')],
      kept: child[0][GR_CHILD_CANON.indexOf('BAZ_bucket')],
      bin: mile.Month_bin, bazMean: mile.Mean_BAZ, hazMean: mile.Mean_HAZ,
      blankFilled, blankHeader: blank[0].every(c => c===''), blankRows: growthObjects(blank),
      blankMileFilled, blankMileHeader: blankMile[0].every(c => c===''), blankMileRows: growthObjects(blankMile)
    };
  })()`);
  assert.equal(got.childFilled, true);
  assert.equal(got.mileFilled, true);
  assert.equal(got.dHaz, '0.04');
  assert.equal(got.hba, '10.70');
  assert.equal(got.baz, 'Stable');
  assert.equal(got.dHazHeader, 'dHAZ');
  assert.equal(got.hbaHeader, 'Latest_HbA1c');
  assert.equal(got.kept, 'BAZ_bucket');
  assert.equal(got.bin, '6');
  assert.equal(got.bazMean, '-0.40');
  assert.equal(got.hazMean, '-1.20');
  assert.equal(got.blankFilled, false);
  assert.equal(got.blankHeader, true);
  assert.equal(got.blankRows, null);
  assert.equal(got.blankMileFilled, false);
  assert.equal(got.blankMileHeader, true);
  assert.equal(got.blankMileRows, null);
});

test('filter join, bucket aggregation, min-N and period independence', () => {
  const {run, context} = setup();
  const rows = [];
  for(let i = 0; i < 8; i++) rows.push(child('f'+i, {BAZ_bucket: 'Faltering', HAZ_bucket: 'Watch', Time_in_care_bucket: '0-6 months', dHAZ: ''}));
  for(let i = 0; i < 3; i++) rows.push(child('w'+i, {BAZ_bucket: 'Watch', HAZ_bucket: 'Faltering', Time_in_care_bucket: '0–6 months', dHAZ: ''}));
  for(let i = 0; i < 8; i++) rows.push(child('s'+i, {BAZ_bucket: 'Stable', Time_in_care_bucket: '0-6 months', dHAZ: ''}));
  for(let i = 0; i < 21; i++) rows.push(child('a'+i, {BAZ_bucket: 'Stable', HAZ_bucket: 'Watch', dHAZ: '0.20', State: 'MP', District: 'Bhopal'}));
  rows.push(child('dup', {BAZ_bucket: ''}));
  rows.push(child('dup', {BAZ_bucket: 'Faltering'}));
  rows.push(child('outsider', {BAZ_bucket: 'Excess gain', Latest_HbA1c: '99', State: 'UK'}));
  const ids = rows.map(r => r.Claude_ID).filter(id => id !== 'outsider');
  context.rows = rows;
  context.ids = idSet(ids);
  const pack = run(`(() => {
    const geo = {state:'all', district:'all', facility:'all', age:'all'};
    const a = computeGrowth(ids, rows, null, Object.assign({period:'12'}, geo));
    const b = computeGrowth(ids, rows, null, Object.assign({period:'all'}, geo));
    const all = b.baz.bars[0];
    const early = b.baz.bars[1];
    const late = b.baz.bars[4];
    return {
      same: JSON.stringify(a) === JSON.stringify(b),
      undatedLeftOut: a.cohort,
      cohort: b.cohort,
      all: {n: all.n, shares: all.shares, mean: all.meanDHaz, haz: all.hazBehindPct, suppressed: all.suppressed},
      early: {n: early.n, suppressed: early.suppressed, shares: early.shares},
      late: {n: late.n, shares: late.shares, mean: late.meanDHaz, haz: late.hazBehindPct},
      states: b.bmi.bars.map(bar => ({label: bar.label, n: bar.n, suppressed: bar.suppressed, share: bar.shares && bar.shares[2], stunt: bar.stuntPct}))
    };
  })()`);
  assert.equal(pack.same, false);
  assert.equal(pack.undatedLeftOut, 0, 'a dated period leaves out children with no enrolment date');
  assert.equal(pack.cohort, ids.length - 1, 'duplicate Claude_ID counts once and the outsider is left out');
  assert.equal(pack.all.n, 40);
  assert.equal(pack.all.suppressed, false);
  assert.equal(JSON.stringify(pack.all.shares), JSON.stringify([27.5, 72.5, 0, 0]));
  assert.equal(pack.all.mean, 0.2);
  assert.equal(pack.all.haz, 80);
  assert.equal(pack.early.n, 19);
  assert.equal(pack.early.suppressed, true);
  assert.equal(pack.early.shares, null);
  assert.equal(pack.late.n, 21);
  assert.equal(JSON.stringify(pack.late.shares), JSON.stringify([0, 100, 0, 0]));
  assert.equal(pack.late.mean, 0.2);
  assert.equal(pack.late.haz, 100);
  assert.equal(JSON.stringify(pack.states.map(s => s.label)), JSON.stringify(['Rajasthan', 'Madhya Pradesh']));
  assert.equal(pack.states[1].n, 21);
  assert.equal(pack.states[1].suppressed, false);
});

test('current growth status drills from state to district to facility and keeps stunting on its own denominator', () => {
  const {run, context} = setup();
  const rows = [];
  for(let i = 0; i < 20; i++) rows.push(child('j'+i, {District: 'Jaipur', Facility: 'CS Jaipur', BMI_category_latest: 'Normal', Stunted_latest: i < 10 ? 'Yes' : 'No'}));
  for(let i = 0; i < 20; i++) rows.push(child('u'+i, {District: 'Udaipur', Facility: 'CS Udaipur', BMI_category_latest: 'Thinness', Stunted_latest: 'No', Latest_HAZ_within_6m: 'No'}));
  for(let i = 0; i < 5; i++) rows.push(child('k'+i, {District: 'Kota', Facility: 'CS Kota', BMI_category_latest: 'Obese'}));
  for(let i = 0; i < 10; i++) rows.push(child('h'+i, {District: 'Jaipur', Facility: 'CHC Amber', BMI_category_latest: 'Overweight', Latest_BMI_within_6m: 'Yes', Latest_HAZ_within_6m: 'Yes', Stunted_latest: 'Yes'}));
  // Height-for-age only: counts toward stunting, not the BMI bar.
  for(let i = 0; i < 10; i++) rows.push(child('z'+i, {District: 'Jaipur', Facility: 'CS Jaipur', Latest_BMI_within_6m: 'No', Stunted_latest: 'Yes'}));
  context.rows = rows;
  context.ids = idSet(rows.map(r => r.Claude_ID));
  const got = run(`(() => {
    const base = {age:'all', period:'all'};
    const states = computeGrowth(ids, rows, [], Object.assign({state:'all', district:'all', facility:'all'}, base));
    const districts = computeGrowth(ids, rows, [], Object.assign({state:'RJ', district:'all', facility:'all'}, base));
    const facilities = computeGrowth(ids, rows, [], Object.assign({state:'RJ', district:'Jaipur', facility:'all'}, base));
    const slim = bars => bars.map(b => ({label: b.label, n: b.n, suppressed: b.suppressed, shares: b.shares, stunt: b.stuntPct, stuntN: b.stuntN}));
    return {level: [states.bmi.level, districts.bmi.level, facilities.bmi.level], states: slim(states.bmi.bars), districts: slim(districts.bmi.bars), facilities: slim(facilities.bmi.bars), measured: states.bmi.measured};
  })()`);
  assert.equal(JSON.stringify(got.level), JSON.stringify(['state', 'district', 'facility']));
  assert.equal(got.measured, 55);
  assert.equal(got.states[0].label, 'Rajasthan');
  assert.equal(got.states[0].n, 55);
  assert.equal(got.states[0].suppressed, false);
  const jaipur = got.districts.find(b => b.label === 'Jaipur');
  const kota = got.districts.find(b => b.label === 'Kota');
  assert.equal(jaipur.n, 30);
  assert.equal(jaipur.stuntN, 40);
  assert.equal(jaipur.stunt, 75);
  assert.equal(kota.n, 5);
  assert.equal(kota.suppressed, true);
  assert.equal(kota.shares, null);
  assert.equal(kota.stunt, null);
  const amber = got.facilities.find(b => b.label === 'CHC Amber');
  const cs = got.facilities.find(b => b.label === 'CS Jaipur');
  assert.equal(amber.n, 10);
  assert.equal(amber.suppressed, true);
  assert.equal(cs.n, 20);
  assert.equal(cs.suppressed, false);
  assert.equal(JSON.stringify(cs.shares), JSON.stringify([0, 0, 100, 0, 0]));
});

test('HbA1c means follow growth group, and a short change series stays n<20', () => {
  const {run, context} = setup();
  const rows = [];
  for(let i = 0; i < 20; i++) rows.push(child('b'+i, {Growth_group: 'fell behind', Latest_HbA1c: '10.70', dHbA1c: i < 5 ? '-1' : ''}));
  for(let i = 0; i < 20; i++) rows.push(child('s'+i, {Growth_group: 'steady or improved', Latest_HbA1c: '10.24', dHbA1c: '-0.50'}));
  for(let i = 0; i < 10; i++) rows.push(child('e'+i, {Growth_group: 'excess gain', Latest_HbA1c: '12', dHbA1c: '1'}));
  rows.push(child('blank', {Growth_group: 'fell behind', Latest_HbA1c: ''}));
  context.rows = rows;
  context.ids = idSet(rows.map(r => r.Claude_ID));
  const groups = run(`computeGrowth(ids, rows, null, {state:'all', age:'all'}).hba.groups`);
  assert.equal(groups[0].label, 'Fell behind');
  assert.equal(groups[0].n, 20);
  assert.equal(groups[0].mean, 10.7);
  assert.equal(groups[0].meanD, null);
  assert.equal(groups[0].suppressed, false);
  assert.equal(groups[1].label, 'Steady or improved');
  assert.equal(groups[1].n, 20);
  assert.equal(groups[1].mean, 10.24);
  assert.equal(groups[1].meanD, -0.5);
  assert.equal(groups[1].dN, 20);
  assert.equal(groups[2].n, 10);
  assert.equal(groups[2].suppressed, true);
  assert.equal(groups[2].mean, null);
});

test('milestone means average one value per child and hide cohorts under 20', () => {
  const {run, context} = setup();
  const rows = [];
  const miles = [];
  for(let i = 0; i < 20; i++){
    rows.push(child('q'+i, {Enrolment_quarter: '2025-Q1'}));
    miles.push({Claude_ID: 'q'+i, 'month bin': 0, 'mean BAZ in the bin': '0', 'mean HAZ in the bin': '-2', 'Enrolment quarter': '2025-Q1'});
    miles.push({Claude_ID: 'q'+i, 'month bin': 0, 'mean BAZ in the bin': '2', 'mean HAZ in the bin': '0', 'Enrolment quarter': '2024-Q4'});
    miles.push({Claude_ID: 'q'+i, 'month bin': '3', 'mean BAZ in the bin': '1', 'mean HAZ in the bin': '-1', 'Enrolment quarter': '2025-Q1'});
  }
  for(let i = 0; i < 19; i++){
    rows.push(child('p'+i, {Enrolment_quarter: '2025-Q2'}));
    miles.push({Claude_ID: 'p'+i, 'month bin': '0', 'mean BAZ in the bin': '9', 'mean HAZ in the bin': '9', Enrolment_quarter: '2025-Q2'});
  }
  for(let i = 0; i < 10; i++){
    miles.push({Claude_ID: 'q'+i, 'month bin': '6', 'mean BAZ in the bin': '4', 'mean HAZ in the bin': '4'});
  }
  miles.push({Claude_ID: 'ghost', 'month bin': '0', 'mean BAZ in the bin': '50', 'mean HAZ in the bin': '50'});
  rows.push(child('ghost'));
  context.rows = rows;
  context.miles = miles;
  context.ids = idSet(rows.map(r => r.Claude_ID).filter(id => id !== 'ghost'));
  const trend = run(`computeGrowth(ids, rows, miles, {age:'all', state:'all'}).trend`);
  const bin0 = trend.bins[0];
  const bin3 = trend.bins[1];
  const bin6 = trend.bins[2];
  assert.equal(trend.status, 'ok');
  assert.equal(bin0.bazN, 39);
  assert.equal(bin0.bazMean, 4.9);
  assert.equal(bin0.hazMean, 3.87);
  assert.equal(bin3.bazN, 20);
  assert.equal(bin3.bazMean, 1);
  assert.equal(bin3.hazMean, -1);
  assert.equal(bin6.bazN, 10);
  assert.equal(bin6.bazMean, null);
  assert.equal(bin6.hazMean, null);
  const q1 = trend.cohorts.find(c => c.quarter === '2025-Q1');
  const q2 = trend.cohorts.find(c => c.quarter === '2025-Q2');
  assert.equal(q1.hidden, false);
  assert.equal(q1.n, 20);
  assert.equal(q1.baz[0], 1);
  assert.equal(q1.baz[2], null);
  assert.equal(q2.n, 19);
  assert.equal(q2.hidden, true);
  assert.equal(trend.measured, 39);
});

test('missing growth tabs and the adult filter show a friendly state', async () => {
  const {run, elements, context} = setup();
  run(`SHOW_GROWTH=true; GROWTH={status:'missing'}; renderGrowth();`);
  assert.equal(elements['growth-status'].textContent, 'Growth data not yet available');
  assert.equal(elements['growth-body'].hidden, true);
  run(`getF=()=>({age:'adu', state:'all'}); GROWTH={status:'ok', cohort:4}; renderGrowth();`);
  assert.equal(elements['growth-status'].textContent, 'Not applicable for adults');
  assert.equal(elements['growth-body'].hidden, true);

  const calls = [];
  context.fetchTab = async (id, name) => {
    calls.push(name);
    if(name === 'Growth_child' || name === 'Growth_milestones') throw new Error('HTTP 400 for "'+name+'"');
    if(name === 'Enrolled List') return [['Claude_ID','State','Age','Sex','Facility Name','Date of enrolment'], ...Array.from({length: 50}, (_, i) => ['synthetic-'+i, 'RJ', '10', 'Male', 'CS Jaipur', '2026-01-01'])];
    if(name === 'Targets') return [['State','Enrolment target'], ['RJ','1']];
    return [['State']];
  };
  run('buildGeo=populateFilters=buildInfoTable=addSumNotes=()=>{}; applyFilters=()=>{recompute();};');
  await run('boot()');
  assert.equal(run('GROWTH.status'), 'missing');
  assert.ok(calls.includes('Growth_child'));
  assert.ok(calls.includes('Growth_milestones'));
  assert.ok(calls.includes('Growth_visits_dash'));
  assert.equal(calls.length, 15);
  assert.equal(elements['overlay'].style.display, 'none');
});

test('takeaways describe the filtered trend and skip groups under 20', () => {
  const {run} = setup();
  const text = run(`(() => {
    const bar = (time, label, n, behind) => ({time, label, n, suppressed:n<20, shares:n<20?null:[behind, 100-behind, 0, 0]});
    const rising = growthBazTakeaway([
      bar('all','All',40,12),
      bar('0–6','0–6 months',20,8),
      bar('6–12','6–12 months',15,40),
      bar('12–18','12–18 months',24,16)
    ]);
    const onlyOne = growthBazTakeaway([bar('0–6','0–6 months',20,8)]);
    const trend = growthTrendTakeaway([
      {bin:'0', bazN:30, bazMean:-1, hazN:30, hazMean:-1.5},
      {bin:'3', bazN:10, bazMean:2, hazN:10, hazMean:2},
      {bin:'12', bazN:28, bazMean:-0.81, hazN:28, hazMean:-1.52}
    ]);
    const through18 = growthTrendTakeaway([
      {bin:'0', bazN:30, bazMean:-1, hazN:30, hazMean:-1.5, wazN:30, wazMean:-1},
      {bin:'12', bazN:28, bazMean:-0.8, hazN:28, hazMean:-1.58, wazN:28, wazMean:-0.8},
      {bin:'18+', bazN:22, bazMean:-0.7, hazN:22, hazMean:-1.4, wazN:10, wazMean:2}
    ]);
    const thin = growthBmiTakeaway({
      overallN:60, overallThin:14, overallStunt:0, overallStuntN:10,
      bars:[
        {label:'Rajasthan', n:40, suppressed:false, counts:[1,7,32,0,0], stuntN:8, stuntPct:50},
        {label:'Uttarakhand', n:12, suppressed:true, counts:[6,6,0,0,0], stuntN:12, stuntPct:80},
        {label:'Madhya Pradesh', n:20, suppressed:false, counts:[2,4,14,0,0], stuntN:8, stuntPct:10}
      ]
    });
    const hba = growthHbaTakeaway([
      {key:'behind', n:20, suppressed:false, mean:10.70},
      {key:'steady', n:40, suppressed:false, mean:10.24},
      {key:'excess', n:10, suppressed:true, mean:null}
    ]);
    const hbaSmall = growthHbaTakeaway([
      {key:'behind', n:12, suppressed:true, mean:null},
      {key:'steady', n:40, suppressed:false, mean:10.24}
    ]);
    return {rising, onlyOne, trend, through18, thin, hba, hbaSmall};
  })()`);
  assert.equal(text.rising, 'Falling behind rises from 8% at 0–6 months to 16% at 12–18 months');
  assert.equal(text.onlyOne, 'Not enough data for a takeaway');
  assert.equal(text.trend, 'BMI-for-age improves +0.19 SD by 12 months; height-for-age stays flat through 12 months');
  assert.equal(text.through18, 'BMI-for-age improves +0.30 SD by 18+ months; height-for-age improves +0.10 SD by 18+ months; weight-for-age improves +0.20 SD by 12 months');
  assert.equal(text.thin, 'Madhya Pradesh has the highest BMI-for-age thinness, 30% against 23.3% overall');
  assert.equal(text.hba, 'Children whose BMI-for-age fell behind have 0.46 points higher mean HbA1c');
  assert.equal(text.hbaSmall, 'Not enough data for a takeaway');
});

test('BMI category and kilogram weight charts keep the filtered cohort and show n', () => {
  const {run, context} = setup();
  const rows = [];
  for(let i = 0; i < 20; i++){
    rows.push(child('a'+i, {
      BMI_category_latest: i < 15 ? 'Normal' : 'Thinness',
      Time_in_care_bucket: '0-6 months',
      Baseline_weight_kg: '20', Latest_weight_kg: '22',
      Baseline_height_cm: '110', Latest_height_cm: '112',
      Baseline_age_y: '8', Latest_age_y: '9'
    }));
  }
  for(let i = 0; i < 5; i++){
    rows.push(child('b'+i, {
      BMI_category_latest: 'Obese',
      Time_in_care_bucket: '18+ months',
      Baseline_weight_kg: '40', Latest_weight_kg: '36',
      Baseline_height_cm: '140', Latest_height_cm: '145',
      Baseline_age_y: '12', Latest_age_y: '14'
    }));
  }
  rows.push(child('light', {BMI_category_latest: 'Normal', Time_in_care_bucket: '6-12 months', Latest_weight_kg: '18'}));
  rows.push(child('nobody', {BMI_category_latest: 'Normal', Time_in_care_bucket: '0-6 months'}));
  context.rows = rows;
  context.ids = idSet(rows.map(r => r.Claude_ID).filter(id => id !== 'b0'));
  const out = run(`(() => {
    const data = computeGrowth(ids, rows, null, {state:'all', age:'all', period:'all'});
    const again = computeGrowth(ids, rows, null, {state:'all', age:'all', period:'all'});
    const all = data.bmiDuration.bars[0];
    const early = data.bmiDuration.bars[1];
    const late = data.bmiDuration.bars[4];
    const pos = data.weightPos.bars[0];
    const chg = data.weightChg.bars[1];
    return {
      same: JSON.stringify(data.bmiDuration) === JSON.stringify(again.bmiDuration),
      bmiN: all.n,
      early: early.shares && early.shares[2],
      earlyN: early.n,
      lateSuppressed: late.suppressed,
      now: data.bmiNow.bars[0].n,
      weightN: pos.n,
      base: pos.meanBase,
      latest: pos.meanLatest,
      delta: pos.meanDelta,
      earlyDelta: chg.meanDelta,
      over10: data.weightPos.over10,
      current: data.weightNow.bars[0].n,
      currentCounts: data.weightNow.bars[0].counts
    };
  })()`);
  assert.equal(out.same, true);
  assert.equal(out.bmiN, 24);
  assert.equal(out.earlyN, 20);
  assert.equal(out.early, 75);
  assert.equal(out.lateSuppressed, true);
  assert.equal(out.now, 24);
  assert.equal(out.weightN, 24);
  assert.equal(out.base, 23.33);
  assert.equal(out.latest, 24.33);
  assert.equal(out.delta, 1);
  assert.equal(out.earlyDelta, 2);
  assert.equal(out.over10, 4);
  assert.equal(out.current, 25);
  assert.equal(out.currentCounts[1], 21);
  assert.equal(out.currentCounts[3], 4);
});

test('drill-down lists only the children in the clicked slice', () => {
  const {run, context} = setup();
  const rows = [];
  const miles = [];
  for(let i = 0; i < 20; i++){
    rows.push(child('b'+i, {BAZ_bucket:i<12?'Faltering':'Stable', Time_in_care_bucket:'0-6 months', State:'RJ', District:'Jaipur', Facility:'CS Jaipur', BMI_category_latest:i<5?'Thinness':'Normal', Growth_group:'fell behind', Latest_HbA1c:'10.7', Enrolment_quarter:'2025-Q1'}));
    miles.push({Claude_ID:'b'+i, 'month bin':'0', 'mean BAZ in the bin':'1', 'mean HAZ in the bin':'-1', Enrolment_quarter:'2025-Q1'});
  }
  for(let i = 0; i < 20; i++){
    rows.push(child('s'+i, {BAZ_bucket:'Healthy shift', Time_in_care_bucket:'18+ months', State:'MP', District:'Bhopal', Facility:'CS Bhopal', BMI_category_latest:'Normal', Growth_group:'steady or improved', Latest_HbA1c:'10.2', Enrolment_quarter:'2025-Q3'}));
    miles.push({Claude_ID:'s'+i, 'month bin':'6', 'mean BAZ in the bin':'0.2', 'mean HAZ in the bin':'-0.4', Enrolment_quarter:'2025-Q3'});
  }
  rows.push(child('out', {BAZ_bucket:'Faltering', Time_in_care_bucket:'0-6 months', Latest_HbA1c:'99'}));
  rows.push(child('blank', {Growth_group:'fell behind', Latest_HbA1c:'', BAZ_bucket:'Stable', Time_in_care_bucket:'18+ months'}));
  context.rows = rows;
  context.miles = miles;
  const ids = rows.map(r => r.Claude_ID).filter(id => id !== 'out');
  context.ids = idSet(ids);
  const got = run(`(() => {
    const data = computeGrowth(ids, rows, miles, {state:'all', district:'all', facility:'all', age:'all'});
    const idsOf = spec => growthDrill(data, spec).map(r => r.id).sort();
    const cols = growthDrillColumns('baz').map(c => c.label).join('|');
    const csv = growthCsv([{key:'facility', label:'Facility'}], [{facility:'CS, Jaipur'}]);
    return {
      behind: idsOf({chart:'baz', time:'0–6', seg:'behind'}).length,
      steadyEarly: idsOf({chart:'baz', time:'0–6', seg:'steady'}).length,
      allImproved: idsOf({chart:'baz', time:'all', seg:'improved'}).length,
      outsider: idsOf({chart:'baz', time:'all', seg:'behind'}).includes('out'),
      bazPoint: idsOf({chart:'trend', bin:'0', series:'baz'}).length,
      otherBin: idsOf({chart:'trend', bin:'0', series:'baz'}).filter(id => id.startsWith('s')).length,
      cohort: idsOf({chart:'trend', bin:'6', series:'cohort', quarter:'2025-Q3'}).length,
      otherCohort: idsOf({chart:'trend', bin:'6', series:'cohort', quarter:'2025-Q1'}).length,
      thin: idsOf({chart:'bmi', place:'RJ', category:'Thinness'}).length,
      normalMp: idsOf({chart:'bmi', place:'MP', category:'Normal'}).length,
      hba: idsOf({chart:'hba', group:'behind'}).length,
      cols,
      csv
    };
  })()`);
  assert.equal(got.behind, 12);
  assert.equal(got.steadyEarly, 8);
  assert.equal(got.allImproved, 20);
  assert.equal(got.outsider, false);
  assert.equal(got.bazPoint, 20);
  assert.equal(got.otherBin, 0);
  assert.equal(got.cohort, 20);
  assert.equal(got.otherCohort, 0);
  assert.equal(got.thin, 5);
  assert.equal(got.normalMp, 20);
  assert.equal(got.hba, 20);
  assert.match(got.cols, /Claude_ID/);
  assert.equal(/name|phone|unique/i.test(got.cols), false);
  assert.equal(got.csv, 'Facility\n"CS, Jaipur"');
});

test('a short growth insight is hidden below 20 children', () => {
  const {run, elements} = setup();
  run("growthInsight('growth-baz-take', 'Mean moved', 19)");
  assert.equal(elements['growth-baz-take'].hidden, true);
  assert.equal(elements['growth-baz-take'].textContent, '');
  run("growthInsight('growth-baz-take', 'Mean moved', 20)");
  assert.equal(elements['growth-baz-take'].hidden, false);
  assert.equal(elements['growth-baz-take'].textContent, 'Mean moved');
  run("growthShowTakeaway('growth-trend-take', 'Not enough data for a takeaway')");
  assert.equal(elements['growth-trend-take'].hidden, true);
});

test('every growth chart follows the roster, sex, age and enrolment period', () => {
  const {run, context} = setupWho();
  const rows = [];
  const miles = [];
  const sexes = ['Male', 'Female'];
  const states = ['RJ', 'MP'];
  const ages = [3, 8, 12];
  const enrolled = ['2026-06-15', '2020-01-15'];
  sexes.forEach(sex => states.forEach(state => ages.forEach(age => enrolled.forEach(when => {
    const id = [sex, state, age, when].join('-');
    const young = age < 5;
    const older = age >= 12;
    rows.push(child(id, {
      Sex: sex, State: state,
      District: state === 'RJ' ? 'Jaipur' : 'Bhopal',
      Facility: state === 'RJ' ? 'CS Jaipur' : 'CS Bhopal',
      Enrolment_date: when,
      Baseline_age_y: String(age - 1),
      Latest_age_y: String(age),
      Baseline_height_cm: young ? '90' : older ? '140' : '120',
      Latest_height_cm: young ? '96' : older ? '149' : '127',
      Baseline_weight_kg: young ? '12' : older ? '35' : '22',
      Latest_weight_kg: young ? '14' : older ? '40' : '25',
      Latest_HbA1c: '9.4'
    }));
    miles.push({Claude_ID: id, Month_bin: '0', Mean_BAZ: '-0.4', Mean_HAZ: '-1.1'});
  }))));
  for(let i = 0; i < 8; i++){
    const id = 'pad'+i;
    rows.push(child(id, {
      Sex: 'Male', State: 'RJ', Enrolment_date: '2026-06-15',
      Baseline_age_y: '7', Latest_age_y: '8',
      Baseline_height_cm: '120', Latest_height_cm: '127',
      Baseline_weight_kg: '22', Latest_weight_kg: '25',
      Latest_HbA1c: '9.1'
    }));
    miles.push({Claude_ID: id, Month_bin: '0', Mean_BAZ: '-0.3', Mean_HAZ: '-0.8'});
  }
  for(let i = 0; i < 4; i++){
    const id = 'adult'+i;
    rows.push(child(id, {
      Sex: 'Male', State: 'RJ', Enrolment_date: '2026-06-15',
      Baseline_age_y: '17.5', Latest_age_y: '18.5',
      Baseline_height_cm: '170', Latest_height_cm: '174',
      Baseline_weight_kg: '60', Latest_weight_kg: '64',
      Latest_HbA1c: '8.2'
    }));
    miles.push({Claude_ID: id, Month_bin: '0', Mean_BAZ: '0.1', Mean_HAZ: '-0.2'});
  }
  context.rows = rows;
  context.miles = miles;
  context.ids = idSet(rows.map(r => r.Claude_ID));
  context.rj = idSet(rows.filter(r => r.State === 'RJ').map(r => r.Claude_ID));
  const got = run(`(() => {
    const open = {state:'all', sex:'all', age:'all', period:'all'};
    const full = computeGrowth(ids, rows, miles, open);
    const roster = computeGrowth(rj, rows, miles, open);
    const male = computeGrowth(ids, rows, miles, Object.assign({}, open, {sex:'M'}));
    const ped = computeGrowth(ids, rows, miles, Object.assign({}, open, {age:'ped'}));
    const adults = computeGrowth(ids, rows, miles, Object.assign({}, open, {age:'adu'}));
    const recent = computeGrowth(ids, rows, miles, Object.assign({}, open, {period:'12'}));
    const custom = computeGrowth(ids, rows, miles, {period:'custom', from:'2020-01', to:'2020-06', sex:'all', age:'all'});
    const none = computeGrowth({}, rows, miles, open);
    const bar = full.displayed.weightChange.bars[0];
    const keys = Object.keys(growthChartCensus(full));
    const shrinks = (part) => keys.filter(k => growthChartCensus(part)[k] < growthChartCensus(full)[k]);
    const unchanged = (part) => keys.filter(k => growthChartCensus(part)[k] === growthChartCensus(full)[k]);
    return {
      charts: growthFilterMap().map(row => row.chart),
      full: growthChartCensus(full),
      roster: shrinks(roster),
      male: shrinks(male),
      recent: shrinks(recent),
      pedSmaller: shrinks(ped),
      pedSame: unchanged(ped),
      adults: growthChartCensus(adults),
      adultView: growthView({age:'adu'}, full).mode,
      custom: custom.cohort,
      none: growthChartCensus(none),
      perYear: bar.meanPerYear,
      dwaz: bar.meanDWaz,
      dwazN: bar.dwazN,
      underNames: full.displayed.bmiNowUnder.names
    };
  })()`);
  assert.equal(got.charts.length, 10);
  Object.entries(got.full).forEach(([key, n]) => assert.ok(n > 0, key+' starts above zero'));
  ['baz','trend','bmiPlace','hba','bmiTime','bmiNow','bmiUnder','wazPos','weightChg','wazNow'].forEach(key => {
    assert.ok(got.roster.includes(key), 'roster filter shrinks '+key);
    assert.ok(got.male.includes(key), 'sex filter shrinks '+key);
    assert.ok(got.recent.includes(key), 'enrolment period shrinks '+key);
  });
  ['baz','trend','bmiPlace','hba','bmiTime','bmiNow','weightChg'].forEach(key => {
    assert.ok(got.pedSmaller.includes(key), 'ages 2–18 drops an 18-year-old from '+key);
  });
  ['bmiUnder','wazPos','wazNow'].forEach(key => {
    assert.ok(got.pedSame.includes(key), key+' has nobody 18 or older, so that age cut does not change its n');
  });
  Object.values(got.adults).forEach(n => assert.equal(n, 0));
  assert.equal(got.adultView, 'adults');
  assert.equal(got.custom, 12);
  Object.values(got.none).forEach(n => assert.equal(n, 0));
  assert.equal(typeof got.perYear, 'number');
  assert.equal(typeof got.dwaz, 'number');
  assert.ok(got.dwazN >= 20);
  assert.ok(got.underNames.includes('Severely wasted') || got.underNames.includes('Normal') || got.underNames.length > 0);
});

function visit(id, extra){
  return Object.assign({
    Claude_ID: id, Sex: 'Male', age_m: 96, weight_kg: 25, height_cm: 125,
    month_bin: 6, clean_bmi: 1, clean_haz: 1, in_scope_2_18: 1,
    qc_wt_range: 0, qc_wt_jump10: 0
  }, extra);
}

test('a missing visit tab leaves the trend on the stored milestone means', () => {
  const plain = setup();
  const who = setupWho();
  const rows = [];
  const miles = [];
  for(let i = 0; i < 20; i++){
    rows.push(child('m'+i, {Enrolment_quarter: '2025-Q1'}));
    miles.push({Claude_ID: 'm'+i, Month_bin: '6', Mean_BAZ: '-0.40', Mean_HAZ: '-1.10', Enrolment_quarter: '2025-Q1'});
  }
  const ids = idSet(rows.map(r => r.Claude_ID));
  plain.context.rows = rows;
  plain.context.miles = miles;
  plain.context.ids = ids;
  plain.context.visits = rows.map(r => visit(r.Claude_ID));
  const withoutWho = plain.run(`computeGrowth(ids, rows, miles, {period:'all', sex:'all', age:'all'}, visits).trend`);
  assert.equal(withoutWho.source, 'milestones');
  assert.equal(withoutWho.bins.find(b => b.bin === '6').bazMean, -0.4);
  who.context.rows = rows;
  who.context.miles = miles;
  who.context.ids = ids;
  who.context.broken = rows.map(r => ({Claude_ID: r.Claude_ID, Sex: 'Male'}));
  const fallback = who.run(`computeGrowth(ids, rows, miles, {period:'all', sex:'all', age:'all'}, broken).trend`);
  const absent = who.run(`computeGrowth(ids, rows, miles, {period:'all', sex:'all', age:'all'}, null).trend`);
  assert.equal(fallback.source, 'milestones');
  assert.equal(absent.source, 'milestones');
  assert.equal(fallback.bins.find(b => b.bin === '6').bazMean, -0.4);
  assert.match(html, /load\(C\.wb1,'Growth_visits_dash',\{soft:true\}\)/);
});

test('visit trend averages one child per bin, hides n under 20, and omits WAZ from age 10', () => {
  const {run, context} = setupWho();
  const rows = [child('c1', {Sex: 'Male', Enrolment_quarter: '2025-Q1'})];
  const visits = [
    visit('c1', {weight_kg: 22, height_cm: 125}),
    visit('c1', {weight_kg: 28, height_cm: 125}),
    visit('c1', {month_bin: '', weight_kg: 40}),
    visit('old', {age_m: 130, weight_kg: 35, height_cm: 145, month_bin: 12}),
    visit('out', {in_scope_2_18: 0}),
    visit('c1', {clean_bmi: 0, clean_haz: 0, weight_kg: 25, height_cm: 125, month_bin: 9})
  ];
  rows.push(child('old', {Sex: 'Male'}));
  context.rows = rows;
  context.visits = visits;
  context.ids = idSet(['c1', 'old', 'out']);
  const got = run(`(() => {
    const open = {period:'all', sex:'all', age:'all', state:'all'};
    const data = computeGrowth(ids, rows, [], open, visits);
    const bin6 = data.trend.bins.find(b => b.bin === '6');
    const z1 = whoZ.measure({sex:'Male', ageMonths:96, weightKg:22, heightCm:125}).baz;
    const z2 = whoZ.measure({sex:'Male', ageMonths:96, weightKg:28, heightCm:125}).baz;
    const many = [];
    const manyVisits = [];
    for(let i = 0; i < 19; i++){
      many.push({Claude_ID:'n'+i, Sex:'Male', State:'RJ', Enrolment_quarter:'2025-Q1', BAZ_bucket:'Stable'});
      manyVisits.push({Claude_ID:'n'+i, Sex:'Male', age_m:96, weight_kg:25, height_cm:125, month_bin:0, clean_bmi:1, clean_haz:1, in_scope_2_18:1, qc_wt_range:0, qc_wt_jump10:0});
    }
    const smallIds = {};
    many.forEach(r => { smallIds[r.Claude_ID.toLowerCase()] = true; });
    const hidden = computeGrowth(smallIds, many, null, open, manyVisits).trend.bins.find(b => b.bin === '0');
    many.push({Claude_ID:'n19', Sex:'Female', State:'MP', Enrolment_quarter:'2025-Q1', BAZ_bucket:'Stable'});
    manyVisits.push({Claude_ID:'n19', Sex:'Female', age_m:96, weight_kg:24, height_cm:124, month_bin:0, clean_bmi:1, clean_haz:1, in_scope_2_18:1, qc_wt_range:0, qc_wt_jump10:0});
    smallIds.n19 = true;
    const shownAll = computeGrowth(smallIds, many, null, open, manyVisits);
    const shown = shownAll.trend.bins.find(b => b.bin === '0');
    const males = computeGrowth(smallIds, many, null, Object.assign({}, open, {sex:'M'}), manyVisits).trend;
    const onlyRj = {};
    many.filter(r => r.State === 'RJ').forEach(r => { onlyRj[r.Claude_ID.toLowerCase()] = true; });
    const roster = computeGrowth(onlyRj, many, null, open, manyVisits).trend;
    const one = whoZ.measure({sex:'Male', ageMonths:96, weightKg:25, heightCm:125}).baz;
    return {
      source: data.trend.source,
      childMean: data.trend.members.find(m => m.bin === '6').baz,
      expected: (z1 + z2) / 2,
      bazN: bin6.bazN,
      bazMean: bin6.bazMean,
      wazAt10: data.trend.members.find(m => m.id === 'old').waz,
      bazAt10: data.trend.members.find(m => m.id === 'old').baz,
      wazNa: data.trend.drops.wazNotApplicable,
      noBin: data.trend.drops.noBin,
      outOfScope: data.trend.drops.outOfScope,
      notClean: data.trend.drops.notClean,
      hiddenN: hidden.bazN,
      hiddenMean: hidden.bazMean,
      shownN: shown.bazN,
      shownMean: shown.bazMean,
      one,
      maleN: males.measured,
      allN: shownAll.trend.measured,
      rosterN: roster.measured,
      placeholder: shown.bazMean === 0 && one !== 0
    };
  })()`);
  assert.equal(got.source, 'visits');
  assert.ok(Math.abs(got.childMean - got.expected) < 1e-6);
  assert.equal(got.bazN, 1);
  assert.equal(got.bazMean, null);
  assert.equal(got.wazAt10, null);
  assert.equal(typeof got.bazAt10, 'number');
  assert.equal(got.wazNa, 1);
  assert.equal(got.noBin, 1);
  assert.ok(got.outOfScope >= 1);
  assert.equal(got.notClean, 1);
  assert.equal(got.hiddenN, 19);
  assert.equal(got.hiddenMean, null);
  assert.equal(got.shownN, 20);
  assert.equal(typeof got.shownMean, 'number');
  assert.equal(got.placeholder, false);
  assert.ok(Math.abs(got.shownMean - got.one) < 0.05);
  assert.ok(got.maleN < got.allN);
  assert.ok(got.rosterN < got.allN);
});
