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
  return {run: code => vm.runInContext(code, context)};
}

function arm(run){
  run(`FUP_MATCHED=12; FUP_MOM=[{m:'Oct 26', v:48, n:20, partial:false}]; FUP_PENDING=[{m:'Nov 26', visits:4}]; fupFilterStamp=fupFilterKey(getF()); fupOff=3;`);
}

test('follow-up paging returns to the latest window when any filter changes', () => {
  const {run} = setup();
  arm(run);
  assert.equal(run('syncFupOffset(getF())'), false);
  assert.equal(run('fupOff'), 3);
  for (const key of ['state', 'division', 'district', 'facility', 'dpc', 'status', 'sex', 'age', 'support', 'period']) {
    arm(run);
    const value = key === 'support' ? 'cs' : key === 'period' ? '12' : key === 'sex' ? 'M' : key === 'age' ? 'ped' : key === 'status' ? 'active' : 'CG';
    run(`syncFupOffset(Object.assign({}, getF(), {${key}:'${value}'}))`);
    assert.equal(run('fupOff'), null, key);
  }
  arm(run);
  run(`syncFupOffset(Object.assign({}, getF(), {from:'2025-05', to:'2025-11'}))`);
  assert.equal(run('fupOff'), null);
});

test('the unmarked-month footnote is only shown when that month is on screen', () => {
  const {run} = setup();
  arm(run);
  const latest = run(`fupNote([{m:'May 26'},{m:'Jun 26'},{m:'Jul 26'},{m:'Aug 26'},{m:'Sep 26'},{m:'Oct 26'},{m:'Nov 26'}], true)`);
  const earlier = run(`fupNote([{m:'May 25'},{m:'Jun 25'},{m:'Jul 25'},{m:'Aug 25'},{m:'Sep 25'},{m:'Oct 25'},{m:'Nov 25'}], false)`);
  assert.match(latest, /Nov 26: not marked Y\/N; blank means unreported, not 0%/);
  assert.match(latest, /SMBG visits exist but do not establish the attendance denominator/);
  assert.equal(latest.includes('Showing earlier months'), false);
  assert.equal(earlier.includes('Nov 26'), false);
  assert.equal(earlier.includes('not marked Y/N'), false);
  assert.match(earlier, /Showing earlier months — use Forward to return to latest/);
  const olderPending = run(`(() => { FUP_PENDING=[{m:'Jun 25', visits:0}]; return fupNote([{m:'May 25'},{m:'Jun 25'}], false); })()`);
  assert.match(olderPending, /Jun 25: not marked Y\/N/);
  assert.equal(olderPending.includes('Nov 26'), false);
  assert.equal(olderPending.includes('Showing earlier months'), false);
});
