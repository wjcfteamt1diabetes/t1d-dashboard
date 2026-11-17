const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].split('// ── Passcode gate')[0];

function setup(now){
  const elements = {};
  const charts = [];
  function Chart(canvas, config){
    this.canvas = canvas;
    this.config = config;
    this.data = config.data;
    this.options = config.options || {};
    this.destroy = () => {};
    this.draw = () => {};
    charts.push(this);
  }
  Chart.defaults = {font: {}};
  Chart.register = () => {};
  const RealDate = Date;
  function Clock(...args){
    return args.length ? new RealDate(...args) : new RealDate(now.getTime());
  }
  Clock.now = () => now.getTime();
  Clock.parse = RealDate.parse;
  Clock.UTC = RealDate.UTC;
  const context = vm.createContext({
    console, Date: Clock,
    window: {devicePixelRatio: 1},
    Chart,
    document: {
      getElementById(id){return elements[id] ??= {value: 'all', textContent: '', innerHTML: '', style: {}};},
      createElement(){return {innerHTML: '', textContent: '', style: {}, children: [], appendChild(){}};},
      addEventListener(){},
      querySelector(){return null;},
      querySelectorAll(){return [];}
    }
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  return {run, elements, charts};
}

const NOV_2026 = new Date(2026, 10, 17, 12, 0, 0);

test('stock cards use the last completed month and facilities that reported', () => {
  const {run, elements} = setup(NOV_2026);
  run(`RAW={facAttr:{},stock:[
    {fac:'A',commodity:'Glucometer',month:'September',year:2026,coverage:50,stockout:0},
    {fac:'A',commodity:'Glucometer',month:'October',year:2026,coverage:40,stockout:1},
    {fac:'B',commodity:'Glucometer',month:'October',year:2026,coverage:80,stockout:0},
    {fac:'C',commodity:'Glucometer',month:'October',year:2026,coverage:null,stockout:1},
    {fac:'D',commodity:'Glucometer',month:'October',year:2026,coverage:60,stockout:0},
    {fac:'E',commodity:'Glucometer',month:'October',year:2026,coverage:null,stockout:null},
    {fac:'A',commodity:'Glucometer',month:'November',year:2026,coverage:10,stockout:1},
    {fac:'B',commodity:'Glucometer',month:'November',year:2026,coverage:90,stockout:0},
    {fac:'A',commodity:'Glucometer',month:'December',year:2026,coverage:99,stockout:0},
    {fac:'Goa',commodity:'Glucometer',month:'October',year:2026,coverage:100,stockout:0}
  ]}; renderStockKPIs();`);
  assert.equal(elements['stk-period-tag'].textContent, 'Oct 26');
  // Mean of reported coverage (40, 80, 60, 100). Blank coverage and the unreported roster row stay out.
  assert.equal(elements['stk-glm-cov'].textContent, '70%');
  // Two stock-outs among five facilities that filed a stock-out flag, including Goa.
  assert.equal(elements['stk-glm-stk'].textContent, '2 / 5 facilities stocked out (40%)');
  assert.equal(elements['stk-gst-cov'].textContent, '—');
});

test('stock trend drops the current month and any later column', () => {
  const {run, charts} = setup(NOV_2026);
  run(`RAW={facAttr:{},stock:[
    {fac:'A',commodity:'Glucometer',month:'September',year:2026,coverage:50,stockout:0},
    {fac:'A',commodity:'Glucometer',month:'October',year:2026,coverage:40,stockout:1},
    {fac:'A',commodity:'Glucometer',month:'November',year:2026,coverage:10,stockout:1},
    {fac:'A',commodity:'Glucometer',month:'December',year:2026,coverage:99,stockout:0}
  ]}; renderStockTrend();`);
  assert.deepEqual(Array.from(charts.at(-1).data.labels, String), ['Sep 26', 'Oct 26']);
  assert.deepEqual(Array.from(charts.at(-1).data.datasets[0].data, Number), [50, 40]);
});

test('a new calendar month promotes the month that just closed', () => {
  const {run, elements} = setup(new Date(2026, 11, 1, 12, 0, 0));
  run(`RAW={facAttr:{},stock:[
    {fac:'A',commodity:'Glucometer',month:'October',year:2026,coverage:40,stockout:1},
    {fac:'A',commodity:'Glucometer',month:'November',year:2026,coverage:10,stockout:1},
    {fac:'B',commodity:'Glucometer',month:'November',year:2026,coverage:null,stockout:null}
  ]}; renderStockKPIs();`);
  assert.equal(elements['stk-period-tag'].textContent, 'Nov 26');
  assert.equal(elements['stk-glm-cov'].textContent, '10%');
  assert.equal(elements['stk-glm-stk'].textContent, '1 / 1 facilities stocked out (100%)');
});

test('SMBG ignores the open month and future-dated columns', () => {
  const {run} = setup(NOV_2026);
  const smbg = run(`RAW={smbgGrid:[
    ['Claude ID','Enrolled for >3 months','May 2026','Jun 2026','Jul 2026','Aug 2026','Sep 2026','Oct 2026','Nov 2026','Jul 2027','Oct 2027'],
    ['P1','Yes','0','1','3','4','2','3','0','0','.'],
    ['P2','No','5','.','.','.','.','.','2','.','1'],
    ['P9','Yes','1','1','1','1','1','1','1','1','1']
  ]}; computeSmbg({p1:true,p2:true});`);
  assert.deepEqual(Array.from(smbg.mom, r => String(r.m)), ['Oct 26', 'Sep 26', 'Aug 26', 'Jul 26', 'Jun 26', 'May 26']);
  assert.equal(smbg.last.m, 'Oct 26');
  assert.equal(smbg.last.n, 1);
  assert.equal(smbg.last.count34, 1);
  assert.equal(smbg.last.v[2], 100);
  assert.ok(!smbg.mom.some(r => r.m === 'Nov 26' || r.m === 'Jul 27' || r.m === 'Oct 27'));
});

function heatMonths(html){
  return Array.from(html.matchAll(/class="stk-heat-m"><span>([^<]*)<\/span>/g), m => m[1]);
}

test('stock heatmap ends on the last completed month, with the open month and later months left off', () => {
  const {run, elements} = setup(NOV_2026);
  run(`document.getElementById('stk-heat-com').value='Glucometer';
    const names=['January','February','March','April','May','June','July','August','September','October','November','December'];
    const stock=[];
    for(let k=2025*12+9;k<=2026*12+11;k++){
      stock.push({fac:'A',commodity:'Glucometer',month:names[k%12],year:Math.floor(k/12),coverage:k===2026*12+9?40:15,stockout:k===2026*12+9?1:0});
    }
    stock.push({fac:'Goa Clinic',commodity:'Glucometer',month:'October',year:2026,coverage:100,stockout:0});
    stock.push({fac:'Goa Clinic',commodity:'Glucostrips',month:'November',year:2026,coverage:5,stockout:1});
    RAW={facAttr:{'goa clinic':{state:'GA'}},stock};
    renderStockHeatmap();`);
  const html = elements['stk-heat'].innerHTML;
  const months = heatMonths(html);
  assert.deepEqual(months, ['Nov 25','Dec 25','Jan 26','Feb 26','Mar 26','Apr 26','May 26','Jun 26','Jul 26','Aug 26','Sep 26','Oct 26']);
  assert.match(html, /A · Oct 26 · 40% coverage · STOCKOUT/);
  assert.match(html, /Goa Clinic · Oct 26 · 100% coverage/);
  assert.match(html, />GA <span/);
});

test('stock heatmap advances when the month closes and still drops the open month', () => {
  const {run, elements} = setup(new Date(2026, 11, 1, 12, 0, 0));
  run(`document.getElementById('stk-heat-com').value='Glucometer';
    RAW={facAttr:{},stock:[
      {fac:'A',commodity:'Glucometer',month:'October',year:2025,coverage:11,stockout:0},
      {fac:'A',commodity:'Glucometer',month:'November',year:2026,coverage:10,stockout:1},
      {fac:'A',commodity:'Glucometer',month:'December',year:2026,coverage:99,stockout:0}
    ]}; renderStockHeatmap();`);
  const months = heatMonths(elements['stk-heat'].innerHTML);
  assert.equal(months.at(-1), 'Nov 26');
  assert.equal(months.includes('Dec 26'), false);
  assert.match(elements['stk-heat'].innerHTML, /A · Nov 26 · 10% coverage · STOCKOUT/);
});

test('a partial current month does not appear when it is the only reported stock month', () => {
  const {run, elements} = setup(NOV_2026);
  run(`document.getElementById('stk-heat-com').value='Glucometer';
    RAW={facAttr:{},stock:[
      {fac:'A',commodity:'Glucometer',month:'October',year:2026,coverage:null,stockout:null},
      {fac:'A',commodity:'Glucometer',month:'November',year:2026,coverage:10,stockout:1}
    ]}; renderStockHeatmap();`);
  const months = heatMonths(elements['stk-heat'].innerHTML);
  assert.deepEqual(months, ['Oct 26']);
  assert.match(elements['stk-heat'].innerHTML, /title="A · Oct 26"/);
  assert.equal(elements['stk-heat'].innerHTML.includes('Nov 26'), false);
});

test('logframe 3.3 is assessed from the completed SMBG month', () => {
  const {run} = setup(NOV_2026);
  run(`RAW={smbgGrid:[
    ['Claude ID','Enrolled for >3 months','Oct 2026','Nov 2026','Oct 2027'],
    ['P1','Yes','3','0','0'],
    ['P2','Yes','0','3','3'],
    ['P3','Yes','1','1','1'],
    ['P4','No','4','4','4']
  ]};`);
  const last = run('computeSmbg({p1:true,p2:true,p3:true,p4:true}).last');
  assert.equal(last.m, 'Oct 26');
  assert.equal(last.n, 3);
  assert.equal(last.count34, 1);
  const rate = last.count34 / last.n * 100;
  assert.ok(Math.abs(rate - 33.333) < 0.01);
  assert.equal(run(`dnMet(${rate},75,'gte')`), false);
});
