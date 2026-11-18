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
  function Clock(...args){
    return args.length ? new RealDate(...args) : new RealDate(now.getTime());
  }
  Clock.now = () => now.getTime();
  Clock.parse = RealDate.parse;
  Clock.UTC = RealDate.UTC;
  const context = vm.createContext({
    console, Date: Clock,
    window: {devicePixelRatio: 1, addEventListener(){}},
    Chart: {defaults: {font: {}}, register(){}},
    document: {
      getElementById(id){
        return elements[id] ??= {value: 'all', textContent: '', innerHTML: '', style: {}, hidden: false, classList: {toggle(){}, add(){}, remove(){}}};
      },
      createElement(){return {style: {}, textContent: '', innerHTML: '', appendChild(){}};},
      addEventListener(){},
      querySelector(){return null;},
      querySelectorAll(){return [];},
      body: {classList: {toggle(){}, add(){}, remove(){}}}
    }
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  run(`function filters(extra){
    return Object.assign({state:'all',division:'all',district:'all',facility:'all',dpc:'all',status:'all',sex:'all',age:'all',support:'all',period:'all',from:'',to:''}, extra||{});
  }
  function loadRaw(){
    RAW={
      enrolled:[
        {State:'RJ',Sex:'M',Age:'20','Facility Name':'CS Jaipur','Date of enrolment':'2026-01-15','Survival Status':'Yes','Case Status (Active/Inactive)':'Active',Claude_ID:'p1'},
        {State:'RJ',Sex:'F',Age:'10','Facility Name':'CS Jaipur','Date of enrolment':'2026-10-02','Survival Status':'Yes','Case Status (Active/Inactive)':'Active',Claude_ID:'p2'},
        {State:'UK',Sex:'M',Age:'30','Facility Name':'CS Dehradun','Date of enrolment':'','Survival Status':'Yes','Case Status (Active/Inactive)':'Active',Claude_ID:'p3'},
        {State:'GA',Sex:'F',Age:'40','Facility Name':'DH Mapusa','Date of enrolment':'2026-05-01','Survival Status':'No','Case Status (Active/Inactive)':'Active',Claude_ID:'p4'}
      ],
      csFac:[
        {State:'RJ',Division:'A',District:'Jaipur','Facility name':'CS Jaipur',DPC:'D1','T1D Clinic Operational?':'Yes','Date of Operationalisation':'2026-01-01'},
        {State:'GA',Division:'',District:'North Goa','Facility name':'DH Mapusa',DPC:'','T1D Clinic Operational?':'No'}
      ],
      ltGrid:[
        ['State','District','Facility name','T1D Clinic Operational?','Total enrolments (autocalculated)','Aug 26','Sep 26','Oct 26','Nov 26'],
        ['RJ','Jaipur','LT Jaipur','Yes','15','5','4','6','0'],
        ['UK','Nainital','LT Nainital','Yes','3','0','0','1','2'],
        ['GA','North Goa','LT Goa','Yes','0','0','0','0','0']
      ],
      cap:[],
      orient:[
        {State:'RJ',District:'Jaipur','Type of Service Provider':'ASHA','# of Service Providers':'10','Session #':'1','Pilot District? (Yes/No)':'Yes','Month of Orientation':'October','Year of Orientation':'2026'},
        {State:'RJ',District:'Jaipur','Type of Service Provider':'ASHA','# of Service Providers':'4','Session #':'2','Pilot District? (Yes/No)':'Yes','Month of Orientation':'January','Year of Orientation':'2026'}
      ],
      fupGrid:[], smbgGrid:[], hhGrid:[], hba:[], opsGrid:[], offsGrid:[], facAttr:{}, stock:null
    };
    buildGeo();
  }
  function use(extra){getF=()=>filters(extra); recompute();}`);
  return {run, elements};
}

const NOV = new Date(2026, 10, 18, 12, 0, 0);

test('support and period controls sit in the filter bar and keep the default copy', () => {
  assert.match(html, /id="f-support"/);
  assert.match(html, /id="f-period"/);
  assert.match(html, /<option value="cs">Complete support<\/option>/);
  assert.match(html, /<option value="lt">Light support<\/option>/);
  assert.match(html, /<option value="all">All time<\/option>/);
  assert.match(html, /<option value="3">Last 3 months<\/option>/);
  assert.match(html, /<option value="6">Last 6 months<\/option>/);
  assert.match(html, /<option value="12">Last 12 months<\/option>/);
  assert.match(html, /<option value="fy">This financial year<\/option>/);
  assert.match(html, /<option value="custom">Custom range<\/option>/);
  assert.match(html, /id="f-from"/);
  assert.match(html, /id="f-to"/);
  assert.match(html, />PLT1D enrolled</);
  assert.match(html, /Complete support only/);
  assert.equal(html.includes('Too small to label'), false);
  assert.equal(html.includes('Rounded shares total 100%'), false);
});

test('period presets use the Indian financial year and inclusive month bounds', () => {
  const {run} = setup(NOV);
  const bounds = run(`(() => {
    const now = new Date(2026, 10, 18);
    const feb = new Date(2026, 1, 15);
    const pack = range => range && {from: formatYm(range.from), to: formatYm(range.to), label: periodLabel(range)};
    return {
      all: resolvePeriod('all', '', '', now),
      m3: pack(resolvePeriod('3', '', '', now)),
      m6: pack(resolvePeriod('6', '', '', now)),
      m12: pack(resolvePeriod('12', '', '', now)),
      fy: pack(resolvePeriod('fy', '', '', now)),
      fyFeb: pack(resolvePeriod('fy', '', '', feb)),
      swapped: pack(resolvePeriod('custom', '2026-10', '2026-09', now)),
      incomplete: resolvePeriod('custom', '', '2026-09', now),
      unknown: resolvePeriod('nope', '', '', now)
    };
  })()`);
  assert.equal(bounds.all, null);
  assert.equal(bounds.incomplete, null);
  assert.equal(bounds.unknown, null);
  assert.equal(bounds.m3.from, 'Sep 2026');
  assert.equal(bounds.m3.to, 'Nov 2026');
  assert.match(bounds.m3.label, /^Sep 2026 . Nov 2026$/);
  assert.equal(bounds.m6.from, 'Jun 2026');
  assert.equal(bounds.m6.to, 'Nov 2026');
  assert.equal(bounds.m12.from, 'Dec 2025');
  assert.equal(bounds.m12.to, 'Nov 2026');
  assert.equal(bounds.fy.from, 'Apr 2026');
  assert.equal(bounds.fy.to, 'Mar 2027');
  assert.match(bounds.fy.label, /FY 2026–27/);
  assert.match(bounds.fy.label, /Apr–Mar/);
  assert.equal(bounds.fyFeb.from, 'Apr 2025');
  assert.equal(bounds.fyFeb.to, 'Mar 2026');
  assert.equal(bounds.swapped.from, 'Sep 2026');
  assert.equal(bounds.swapped.to, 'Oct 2026');
  assert.equal(run('lastCompletedKey(null, new Date(2026,10,18))'), run('ymKey(2026,9)'));
  assert.equal(run("lastCompletedKey(resolvePeriod('custom','2026-11','2026-11', new Date(2026,10,18)), new Date(2026,10,18))"), null);
});

test('blank custom months do not count as a programme filter', () => {
  const {run} = setup();
  assert.equal(run("dashboardFiltered({state:'all',division:'all',district:'all',facility:'all',dpc:'all',status:'all',sex:'all',age:'all',support:'all',from:'',to:''}, null)"), false);
  assert.equal(run("dashboardFiltered({state:'RJ',from:'',to:''}, null)"), true);
  assert.equal(run("dashboardFiltered({support:'lt',from:'',to:''}, null)"), true);
  assert.equal(run("dashboardFiltered({from:'',to:''}, resolvePeriod('3','','', new Date(2026,10,18)))"), true);
});

test('all support and all time keep complete-support, light-touch and Goa facility counts', () => {
  const {run} = setup();
  run('loadRaw(); use();');
  assert.equal(run('PERIOD'), null);
  assert.equal(run('CURD.csEnr'), 3);
  assert.equal(run('CURD.ltEnr'), 18);
  assert.equal(run('CURD.enr'), 21);
  assert.equal(run('CURD.csShown'), 3);
  assert.equal(run('CURD.ltShown'), 18);
  assert.equal(run('CURD.plan'), 5, 'two complete-support sites plus three light-touch sites, including Goa at zero');
  assert.equal(run('CURD.csOp'), 1);
  assert.equal(run('CURD.ltOp'), 3);
  assert.equal(run('CURD.newLast'), 8);
  assert.equal(run('CURD.newPrev'), 4);
  assert.equal(run('CURD.flwHr'), 14);
  assert.equal(run('CURD.stateList'), null);
  assert.equal(run('DONOR.filtered'), false);
  assert.equal(run('DONOR.enrolled'), 21);
  assert.equal(run('DONOR.byState.reduce((n,r)=>n+r.enrolled,0)'), 21);
  assert.equal(run("DONOR.byState.find(r=>r.st==='GA').enrolled"), 0);
  assert.equal(run("ltData(filters()).facCount"), 3);
  run("getF=()=>({state:'all',division:'all',district:'all',facility:'all',dpc:'all',status:'all',sex:'all',age:'all'}); recompute();");
  assert.equal(run('CURD.enr'), 21, 'a filter object without the new keys stays on the all-time total');
});

test('support slices enrolment and keeps a zero-enrolment Goa facility on its own roster', () => {
  const {run, elements} = setup();
  run("loadRaw(); use({support:'cs'});");
  assert.equal(run('CURD.enr'), 3);
  assert.equal(run('CURD.ltShown'), 0);
  assert.equal(run('CURD.plan'), 2);
  assert.equal(run('DONOR.enrolled'), 3);
  assert.equal(run("DONOR.byState.find(r=>r.st==='GA').enrolled"), 0);
  assert.equal(run("ltData(filters({support:'cs'})).facCount"), 0);
  run('populateFilters();');
  assert.match(elements['f-facility'].innerHTML, /DH Mapusa/);
  assert.match(elements['f-facility'].innerHTML, /CS Jaipur/);
  assert.doesNotMatch(elements['f-facility'].innerHTML, /LT Goa/);

  run("use({support:'lt'}); populateFilters();");
  assert.equal(run('CURD.enr'), 18);
  assert.equal(run('CURD.csShown'), 0);
  assert.equal(run('CURD.csEnr'), 0);
  assert.equal(run('CURD.plan'), 3);
  assert.equal(run('DONOR.enrolled'), 18);
  assert.equal(run('DONOR.hba'), null);
  assert.equal(run('DONOR.bb'), null);
  assert.equal(run('CURD.flwHr'), 14, 'orientation is not split by support type');
  assert.equal(run('CURD.stateList'), 'RJ · UK · GA');
  assert.equal(run("DONOR.byState.find(r=>r.st==='GA').enrolled"), 0);
  assert.equal(run("DONOR.byState.find(r=>r.st==='GA').clinics"), 1);
  assert.match(elements['f-facility'].innerHTML, /LT Goa/);
  assert.doesNotMatch(elements['f-facility'].innerHTML, /DH Mapusa/);
  assert.equal(run('DONOR.byState.reduce((n,r)=>n+r.enrolled,0)'), run('DONOR.enrolled'));
});

test('a time period counts enrolments inside it and leaves the all-time total for undated rows', () => {
  const {run, elements} = setup();
  run('loadRaw(); use(); renderKPIs(CURD, filters());');
  assert.equal(elements['k-enr-title'].textContent, 'PLT1D enrolled');
  assert.equal(elements['k-tot-sub'].textContent, 'Complete support + light touch');
  assert.equal(elements['n-tag'].textContent, 'n = 21 PLT1D');
  assert.equal(elements['k-new-title'].textContent, 'New enrolments — last month');

  run("use({period:'3'}); renderKPIs(CURD, filters({period:'3'}));");
  assert.equal(run('CURD.csShown'), 1, 'only the October complete-support enrolment');
  assert.equal(run('CURD.ltShown'), 13, 'August light-touch column stays outside the last three months');
  assert.equal(run('CURD.enr'), 14);
  assert.equal(run('CURD.csEnr'), 3, 'clinical cohort stays everyone enrolled to date');
  assert.equal(elements['k-enr-title'].textContent, 'Enrolled in period');
  assert.match(elements['k-enr-sub'].textContent, /Sep 2026 – Nov 2026/);
  assert.match(elements['k-target'].textContent, /Enrolments in Sep 2026/);
  assert.match(elements['n-tag'].textContent, /enrolled in period/);
  assert.equal(run('DONOR.enrolled'), 14);
  assert.equal(run('DONOR.byState.reduce((n,r)=>n+r.enrolled,0)'), 14);
  assert.equal(run('CURD.flwHr'), 10);
  assert.equal(run('CS_CUM.at(-1)+LT_CUM.at(-1)'), 14);

  run("use({period:'fy'});");
  assert.equal(run('CURD.csShown'), 1);
  assert.equal(run('CURD.ltShown'), 18);
  assert.equal(run('CURD.enr'), 19);

  run("use({period:'custom', from:'2026-01', to:'2026-01'});");
  assert.equal(run('CURD.enr'), 1);
  assert.equal(run('CURD.newLast'), 1);
  assert.match(run('CURD.newMonthLabel'), /Jan 26/);

  run("use({period:'custom', from:'2026-10', to:'2026-09'});");
  assert.equal(run('CURD.csShown'), 1);
  assert.equal(run('CURD.ltShown'), 11);
  assert.equal(run('CURD.enr'), 12);

  run("use({period:'custom', from:'', to:''});");
  assert.equal(run('PERIOD'), null);
  assert.equal(run('CURD.enr'), 21);
});

test('support and period filters combine with geography and sex', () => {
  const {run} = setup();
  run("loadRaw(); use({sex:'M'});");
  assert.equal(run('CURD.csEnr'), 2);
  assert.equal(run('CURD.ltEnr'), 18);
  assert.equal(run('CURD.enr'), 20);
  run("use({sex:'M', period:'3'});");
  assert.equal(run('CURD.csShown'), 0);
  assert.equal(run('CURD.ltShown'), 13);
  assert.equal(run('CURD.enr'), 13);
  run("use({state:'RJ', support:'lt', period:'3'});");
  assert.equal(run('CURD.enr'), 10);
  assert.equal(run('CURD.csShown'), 0);
  assert.equal(run('DONOR.byState.every(r=>r.st==="RJ")'), true);
  run("use({support:'cs', period:'3'});");
  assert.equal(run('CURD.enr'), 1);
  assert.equal(run('CURD.ltShown'), 0);
});

test('stock and SMBG stay on the last completed month, including inside a period', () => {
  const {run, elements} = setup();
  run(`RAW={facAttr:{}, stock:[
    {fac:'A', commodity:'Glucometer', month:'August', year:2026, coverage:40, stockout:0},
    {fac:'A', commodity:'Glucometer', month:'October', year:2026, coverage:80, stockout:0},
    {fac:'A', commodity:'Glucometer', month:'November', year:2026, coverage:10, stockout:1}
  ]}; PERIOD=null; renderStockKPIs();`);
  assert.equal(elements['stk-period-tag'].textContent, 'Oct 26');
  assert.equal(elements['stk-glm-cov'].textContent, '80%');
  run(`PERIOD=resolvePeriod('3','','', new Date(2026,10,18)); renderStockKPIs();`);
  assert.equal(elements['stk-period-tag'].textContent, 'Oct 26');
  run(`PERIOD=resolvePeriod('custom','2026-08','2026-08', new Date(2026,10,18)); renderStockKPIs();`);
  assert.equal(elements['stk-period-tag'].textContent, 'Aug 26');
  assert.equal(elements['stk-glm-cov'].textContent, '40%');
  run(`PERIOD=null; getF=()=>filters({support:'lt'}); renderStockKPIs();`);
  assert.equal(elements['stk-glm-cov'].textContent, '—');

  run(`RAW.smbgGrid=[
    ['Claude ID','Enrolled for >3 months','Aug 2026','Sep 2026','Oct 2026','Nov 2026'],
    ['P1','Yes','1','2','3','4']
  ]; PERIOD=null;`);
  assert.equal(run('computeSmbg({p1:1}).last.m'), 'Oct 26');
  assert.equal(run('computeSmbg({p1:1}).last.count34'), 1);
  assert.equal(run('computeSmbg({p1:1}).mom.some(r=>r.m==="Nov 26")'), false);
  run(`PERIOD=resolvePeriod('custom','2026-09','2026-09', new Date(2026,10,18));`);
  assert.equal(run('computeSmbg({p1:1}).last.m'), 'Sep 26');
  assert.equal(run('computeSmbg({p1:1}).mom.length'), 1);
});

test('follow-up, clinic months and hyper windows follow the period and ignore it when unset', () => {
  const {run} = setup();
  run(`RAW={fupGrid:[
    ['Claude_ID','State','Aug 26','Sep 26','Oct 26'],
    ['p1','RJ','Y','N','Y']
  ]}; PERIOD=null;`);
  assert.equal(run('computeFollowup({p1:1}).mom[0].m'), 'Oct 26');
  assert.equal(run('computeFollowup({p1:1}).mom.length'), 3);
  run(`PERIOD=resolvePeriod('custom','2026-08','2026-08', new Date(2026,10,18));`);
  assert.equal(run('computeFollowup({p1:1}).mom.map(r=>r.m).join("|")'), 'Aug 26');

  run(`RAW.opsGrid=[['Month/Year','Fac'],['Aug 26','100%'],['Oct 26','50%']];
    RAW.offsGrid=[['Month/Year','Fac'],['Aug 26','0'],['Oct 26','1']];
    PERIOD=null; computeClinicOps();`);
  assert.equal(run('CLINOPS_M.join("|")'), 'Aug 26|Oct 26');
  run(`PERIOD=resolvePeriod('custom','2026-10','2026-10', new Date(2026,10,18)); computeClinicOps();`);
  assert.equal(run('CLINOPS_M.join("|")'), 'Oct 26');

  run(`RAW.hhGrid=[
    ['Claude ID','Facility Name','Date of visit','% Hypo readings','% Hyper readings'],
    ['p1','CS Jaipur','2026-08-04','10','30'],
    ['p1','CS Jaipur','2026-10-04','10','30']
  ]; PERIOD=null;`);
  assert.equal(run('computeHyperHypo({p1:1}).months.length'), 3);
  assert.equal(run('computeHyperHypo({p1:1}).months[2].m'), 'Aug 26');
  run(`PERIOD=resolvePeriod('custom','2026-08','2026-08', new Date(2026,10,18));`);
  assert.equal(run('computeHyperHypo({p1:1}).months.map(r=>r.m).join("|")'), 'Aug 26');
});
