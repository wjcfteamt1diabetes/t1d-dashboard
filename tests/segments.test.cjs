const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].split('// ── Passcode gate')[0];

function setup(){
  const context = vm.createContext({
    console,
    window: {devicePixelRatio: 1},
    Chart: {defaults:{font:{}}, register(){}},
    document: {
      getElementById(){return {value:'all', textContent:'', innerHTML:'', style:{}};},
      createElement(){return {style:{}, setAttribute(){}, appendChild(){return null;}};},
      addEventListener(){},
      querySelector(){return null;},
      querySelectorAll(){return [];}
    }
  });
  vm.runInContext(source, context);
  return {run: code => vm.runInContext(code, context)};
}

test('chart tooltips are compact and stacked rows use a short count', () => {
  const {run} = setup();
  assert.equal(run(`shareTooltip().callbacks.label({dataset:{label:'Improved ≥4 pp', _counts:[20]}, dataIndex:0, parsed:{y:13}})`), 'Improved ≥4 pp  13% (20)');
  assert.equal(run(`shareTooltip().callbacks.label({dataset:{label:'0 offs', _counts:[4], _pct:false}, dataIndex:0, parsed:{y:4}})`), '0 offs (4)');
  assert.equal(run(`shareTooltip().callbacks.label({dataset:{label:'Improved ≥4 pp'}, dataIndex:0, parsed:{y:13}})`), 'Improved ≥4 pp  13%');
  assert.equal(run('shareTooltip().enabled'), false);
  assert.equal(run('shareTooltip().bodyFont.size'), 11);
  assert.equal(run('shareTooltip().titleFont.size'), 12);
  assert.equal(run('shareTooltip().padding'), 5);
  assert.equal(run('typeof shareTooltip().external'), 'function');
  assert.equal(run('Chart.defaults.plugins.tooltip.enabled'), false);
  assert.equal(run('Chart.defaults.plugins.tooltip.bodyFont.size'), 11);
  assert.equal(run('Chart.defaults.plugins.tooltip.titleFont.size'), 12);
  assert.equal(run('typeof Chart.defaults.plugins.tooltip.external'), 'function');
});

test('segment tooltip names the category, share and count and the page has no footnote paragraphs', () => {
  const {run} = setup();
  assert.equal(run("segmentTip('Improved ≥4 pp', 16, 189)"), 'Improved ≥4 pp · 16% · n = 189');
  const bar = run("momSegs([16,4,0], ['#064e3b','#059669','#334155'], ['Improved ≥4 pp','Improved 2–4 pp','No change'], [189,40,0])");
  assert.match(bar, /Improved ≥4 pp · 16% · n = 189/);
  assert.match(bar, /seg-hit/);
  assert.equal(bar.includes('No change'), false);
  assert.equal(html.includes('Too small to label'), false);
  assert.equal(html.includes('Rounded shares total 100%'), false);
});

test('Goa uses a blue that is distinct from the other programme states', () => {
  const {run} = setup();
  const color = run('DN_COL.GA');
  assert.equal(color, '#0a6b7d');
  for (const state of ['MP','RJ','UK','CG']) assert.notEqual(run(`DN_COL.${state}`), color);
});

test('SMBG and hyper counts travel with the same percentage windows', () => {
  const {run} = setup();
  run(`Date = class extends Date { constructor(...a){ super(...(a.length?a:[2026,10,17])); } };`);
  const smbg = run(`RAW={smbgGrid:[
    ['Claude ID','Enrolled for >3 months','May 2026','Jun 2026','Jul 2026','Aug 2026','Sep 2026','Oct 2026','Nov 2026'],
    ['P1','Yes','0','1','3','4','2','3','0']
  ]}; computeSmbg({p1:true});`);
  assert.deepEqual(Array.from(smbg.mom, r => String(r.m)), ['Oct 26','Sep 26','Aug 26','Jul 26','Jun 26','May 26']);
  assert.equal(smbg.last.m, 'Oct 26');
  assert.equal(smbg.last.count34, 1);
  assert.equal(smbg.mom[0].c[2], 1);
});
