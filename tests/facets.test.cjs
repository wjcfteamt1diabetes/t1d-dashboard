const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].split('// ── Passcode gate')[0];

function setup(now){
  now = now || new Date(2026, 10, 18, 12, 0, 0);
  const elements = {};
  const RealDate = Date;
  function Clock(...args){return args.length ? new RealDate(...args) : new RealDate(now.getTime());}
  Clock.now = () => now.getTime();
  Clock.parse = RealDate.parse;
  Clock.UTC = RealDate.UTC;
  const context = vm.createContext({
    console, Date: Clock,
    window: {devicePixelRatio: 1, addEventListener(){}},
    Chart: {defaults: {font: {}}, register(){}},
    document: {
      getElementById(id){
        return elements[id] ??= {value: 'all', textContent: '', innerHTML: '', style: {}, hidden: true, title: '', classList: {toggle(name, on){this[name]=!!on;}}};
      },
      createElement(){return {style: {}, textContent: ''};},
      addEventListener(){},
      querySelector(){return null;},
      querySelectorAll(){return [];},
      body: {classList: {toggle(){}}}
    }
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  run(`RAW={geo:[
      {state:'RJ', division:'Jaipur', district:'Jaipur', dpc:'DPC A', facility:'CS Jaipur', support:'cs'},
      {state:'RJ', division:'Kota', district:'Kota', dpc:'DPC B', facility:'CS Kota', support:'cs'},
      {state:'GA', division:'Goa', district:'North Goa', dpc:'DPC Goa', facility:'DH Mapusa', support:'cs'},
      {state:'UK', division:'', district:'Nainital', dpc:'', facility:'LT Nainital', support:'lt', months:[${2026 * 12 + 9}]}
    ], enrolled:[
      {State:'RJ','Facility Name':'CS Jaipur',Sex:'F',Age:'10','Survival Status':'Yes','Case Status (Active/Inactive)':'Active','Date of enrolment':'2026-01-15'},
      {State:'RJ','Facility Name':'CS Kota',Sex:'M',Age:'30','Survival Status':'Yes','Case Status (Active/Inactive)':'Inactive','Date of enrolment':'2026-02-02'},
      {State:'GA','Facility Name':'DH Mapusa',Sex:'F',Age:'40','Survival Status':'No','Case Status (Active/Inactive)':'Active','Date of enrolment':'2026-05-01'}
    ], facAttr:{}};
    RAW.geo.forEach(g=>{RAW.facAttr[facKey(g.facility)]=g;});
    const blank={state:'all',division:'all',district:'all',facility:'all',dpc:'all',status:'all',sex:'all',age:'all',support:'all',period:'all',from:'',to:''};
    function pick(extra){return Object.assign({}, blank, extra||{});}`);
  return {run, elements};
}
function values(run, expr){return run(expr+'.map(o=>o.value).join("|")');}

test('a DPC chosen first narrows state, division, district and facility, and Goa stays on its own roster', () => {
  const {run} = setup();
  assert.equal(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({dpc:'DPC A'}), new Date(2026,10,18)).state"), 'RJ');
  assert.equal(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({dpc:'DPC A'}), new Date(2026,10,18)).division"), 'Jaipur');
  assert.equal(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({dpc:'DPC A'}), new Date(2026,10,18)).district"), 'Jaipur');
  assert.equal(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({dpc:'DPC A'}), new Date(2026,10,18)).facility"), 'CS Jaipur');
  assert.equal(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({dpc:'DPC A'}), new Date(2026,10,18)).dpc"), 'DPC A|DPC B|DPC Goa');
  assert.equal(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({state:'GA'}), new Date(2026,10,18)).facility"), 'DH Mapusa');
  assert.equal(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick(), new Date(2026,10,18)).state"), 'RJ|UK|GA');
});

test('a facility chosen first narrows division and state but leaves the other facilities selectable', () => {
  const {run} = setup();
  const at = "pick({facility:'CS Kota'})";
  assert.equal(values(run, `facetChoices(RAW.geo, RAW.enrolled, ${at}, new Date(2026,10,18)).division`), 'Kota');
  assert.equal(values(run, `facetChoices(RAW.geo, RAW.enrolled, ${at}, new Date(2026,10,18)).state`), 'RJ');
  assert.equal(values(run, `facetChoices(RAW.geo, RAW.enrolled, ${at}, new Date(2026,10,18)).dpc`), 'DPC B');
  assert.equal(values(run, `facetChoices(RAW.geo, RAW.enrolled, ${at}, new Date(2026,10,18)).facility`), 'CS Jaipur|CS Kota|DH Mapusa|LT Nainital');
  assert.equal(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({facility:'CS Kota', division:'Kota'}), new Date(2026,10,18)).facility"), 'CS Kota');
});

test('an incompatible state resets to All when a DPC is the filter just changed', () => {
  const {run, elements} = setup();
  run("['f-dpc','f-state','f-division','f-district','f-facility','f-support','f-status','f-sex','f-age','f-period','f-from','f-to','facet-reset'].forEach(id=>document.getElementById(id))");
  elements['f-dpc'].value = 'DPC Goa';
  elements['f-state'].value = 'RJ';
  run("populateFilters('dpc')");
  assert.equal(elements['f-state'].value, 'all');
  assert.equal(elements['f-dpc'].value, 'DPC Goa');
  assert.match(elements['f-state'].innerHTML, /Goa/);
  assert.doesNotMatch(elements['f-state'].innerHTML, /Rajasthan/);
  assert.equal(elements['f-state'].classList['is-reset'], true);
  assert.match(elements['facet-reset'].textContent, /State reset to All/);
  assert.equal(values(run, 'facetChoices(RAW.geo, RAW.enrolled, getF(), new Date(2026,10,18)).facility'), 'DH Mapusa');
});

test('sex, age and period narrow each other where patients exist, and an empty roster slice does not blank them', () => {
  const {run, elements} = setup();
  run("['f-sex','f-support','f-period','facet-reset'].forEach(id=>document.getElementById(id))");
  assert.equal(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({sex:'F'}), new Date(2026,10,18)).age"), 'ped');
  assert.equal(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({sex:'F'}), new Date(2026,10,18)).sex"), 'M|F');
  assert.equal(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({support:'cs'}), new Date(2026,10,18)).period").includes('3'), false);
  assert.match(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({support:'cs'}), new Date(2026,10,18)).period"), /12/);
  assert.match(values(run, "facetChoices(RAW.geo, RAW.enrolled, pick({support:'cs'}), new Date(2026,10,18)).period"), /custom/);
  elements['f-sex'].value = 'M';
  elements['f-support'].value = 'cs';
  elements['f-period'].value = '3';
  run("populateFilters('support')");
  assert.equal(elements['f-period'].value, 'all');
  assert.match(elements['facet-reset'].textContent, /Period reset to All/);
  assert.equal(values(run, "facetChoices(RAW.geo, [], pick({state:'GA'}), new Date(2026,10,18)).sex"), 'M|F');
  assert.match(values(run, "facetChoices(RAW.geo, [], pick({state:'GA'}), new Date(2026,10,18)).period"), /3/);
});

test('every filter at All still lists Goa and both support types', () => {
  const {run} = setup();
  assert.equal(values(run, 'facetChoices(RAW.geo, RAW.enrolled, pick(), new Date(2026,10,18)).state'), 'RJ|UK|GA');
  assert.equal(values(run, 'facetChoices(RAW.geo, RAW.enrolled, pick(), new Date(2026,10,18)).support'), 'cs|lt');
  assert.match(values(run, 'facetChoices(RAW.geo, RAW.enrolled, pick(), new Date(2026,10,18)).facility'), /DH Mapusa/);
});
