const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].split('// ── Passcode gate')[0];

function setup(){
  const elements = {};
  const context = vm.createContext({
    console: {warn(){}, error(){}, log(){}},
    window: {devicePixelRatio: 1, addEventListener(){}},
    Chart: {defaults: {font: {}}, register(){}},
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
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  return {run, elements, context};
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

test('growth section sits on the clinical tab and loads both sheets by name', () => {
  const tab = html.slice(html.indexOf('id="tab-1"'), html.indexOf('id="tab-2"'));
  assert.ok(tab.indexOf('tc-wrap cs-only') >= 0);
  assert.ok(tab.indexOf('Growth (ages 2–18)') > tab.indexOf('tc-wrap cs-only'));
  assert.match(tab, /The period filter does not apply/);
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
    const all = a.baz.bars[0];
    const early = a.baz.bars[1];
    const late = a.baz.bars[4];
    return {
      same: JSON.stringify(a) === JSON.stringify(b),
      cohort: a.cohort,
      all: {n: all.n, shares: all.shares, mean: all.meanDHaz, haz: all.hazBehindPct, suppressed: all.suppressed},
      early: {n: early.n, suppressed: early.suppressed, shares: early.shares},
      late: {n: late.n, shares: late.shares, mean: late.meanDHaz, haz: late.hazBehindPct},
      states: a.bmi.bars.map(bar => ({label: bar.label, n: bar.n, suppressed: bar.suppressed, share: bar.shares && bar.shares[2], stunt: bar.stuntPct}))
    };
  })()`);
  assert.equal(pack.same, true);
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
    const base = {age:'all', period:'6'};
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
  run(`GROWTH={status:'missing'}; renderGrowth();`);
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
  assert.equal(calls.length, 14);
  assert.equal(elements['overlay'].style.display, 'none');
});
