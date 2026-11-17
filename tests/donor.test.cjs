const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function setup(){
  const elements={};
  const element=()=>({innerHTML:'',textContent:'',style:{},value:'all',children:[],hidden:false,dataset:{},
    classList:{add(){},remove(){},toggle(){}},appendChild(c){this.children.push(c);return c;},
    addEventListener(){},removeEventListener(){},setAttribute(){},getAttribute(){return null;},
    getBoundingClientRect(){return {width:470,height:490,top:0,left:0,right:470,bottom:490};},
    hasPointerCapture(){return false;},setPointerCapture(){},releasePointerCapture(){},focus(){}});
  const context=vm.createContext({console,window:{devicePixelRatio:1,addEventListener(){}},Chart:{defaults:{font:{}},register(){}},
    document:{getElementById(id){return elements[id]??=element();},createElement:element,
      querySelector(){return null;},querySelectorAll(){return [];}}});
  // Exercise public calculation/rendering code only; authentication is not part of these unit tests.
  vm.runInContext(source.split('// ── Passcode gate')[0],context);
  const run=code=>vm.runInContext(code,context);
  run(`CURD={csEnr:0,fupDen:0,plan:0};
    RAW={ltGrid:[['State','District','Facility name','T1D Clinic Operational?','Total enrolments (autocalculated)','Jan 26'],['RJ','Jaipur','LT Jaipur','Yes','100','100']]};
    function fixture(state='all'){
      const f={state,division:'all',district:'all',facility:'all',dpc:'all',status:'all',sex:'all',age:'all'};
      const PGEO=[{State:'MP','Date of enrolment':'2026-01-01'},{State:'RJ','Date of enrolment':'2026-01-01'}].filter(p=>state==='all'||p.State===state);
      const csF=[{State:'MP',District:'Shared name','T1D Clinic Operational?':'Yes'},{State:'RJ',District:'Shared name','T1D Clinic Operational?':'Yes'}].filter(p=>state==='all'||p.State===state);
      return {f,PGEO,csF,lt:ltData(f),months:[{y:2026,m:0,label:'Jan 26'}],clin:[csF.length+ltData(f).opCount],hba:hbaEmpty(),smbg:{last:{n:0,v:[0,0,0,0]}},fmom:[],drs:[],nrs:[],oriF:[],csOp:csF.length,insBase:null,insLast:null,dka:null,hypo:null};
    }`);
  return {run,elements};
}
test('state filter excludes other-state light touch; reach and growth reconcile',()=>{
  const {run}=setup();
  for(const state of ['all','MP','RJ','CG','GA']){
    run(`computeDonor(fixture('${state}'))`);
    assert.equal(run('DONOR.byState.reduce((n,r)=>n+r.enrolled,0)'),run('DONOR.enrolled'));
    assert.equal(run('DONOR.byState.reduce((n,r)=>n+r.clinics,0)'),run('DONOR.clinics'));
    assert.equal(run('DONOR.growth.series.reduce((n,r)=>n+r.data[0],0)'),run('DONOR.enrolled'));
    if(state!=='all')assert.equal(run(`DONOR.byState.every(r=>r.st==='${state}')`),true);
  }
  run("computeDonor(fixture('all'))");
  assert.equal(run('DONOR.dist'),3,'same-named districts in different states are distinct');
});
test('all geography and patient filters suppress target scoring and headline comparison',()=>{
  const {run,elements}=setup();
  for(const filter of ['state','division','district','facility','dpc','sex','age','status']){
    run(`{const x=fixture();x.f.${filter}='selected';computeDonor(x);renderLogframe();renderDonorKPIs();}`);
    assert.match(elements['dn-logframe'].innerHTML,/Not assessed/);
    assert.doesNotMatch(elements['dn-logframe'].innerHTML,/✓ met|Outside target|dn-meter-fill/);
    assert.doesNotMatch(elements['dn-enr-n'].textContent,/×/);
    assert.doesNotMatch(elements['dn-logframe-note'].textContent,/measurable logframe targets met/);
  }
});
test('empty regimen and SMBG remain no-data, but measured zero is valid',()=>{
  const {run,elements}=setup();
  run('computeDonor(fixture());renderDonorRegimen();renderLogframe();');
  assert.equal(run('DONOR.smbg34'),null);
  assert.equal(elements['dn-regimen'].children[0].textContent,'At enrolment: No data');
  assert.equal(elements['dn-regimen'].children[1].textContent,'Current: No data');
  assert.match(elements['dn-logframe'].innerHTML,/no data/i);
  run('{const x=fixture();x.smbg.last={n:10,count34:0};x.insLast=0;computeDonor(x);}');
  assert.equal(run('DONOR.smbg34'),0);assert.equal(run('DONOR.bb'),0);
});
test('threshold decisions use unrounded rates and means',()=>{
  const {run}=setup();
  run(`{const x=fixture();x.insLast=899/1000*100;x.dka=101/1000*100;x.hba.rawAvgLatest=8.54;x.smbg.last={n:1000,count34:749};x.fmom=[{n:1000,attended:749,v:75,partial:false}];computeDonor(x);}`);
  for(const [key,target,cmp] of [['bb',90,'gte'],['dka',10,'lte'],['hba',8.5,'lte'],['smbg34',75,'gte'],['fup',75,'gte']]){
    assert.equal(run(`dnMet(DONOR.${key},${target},'${cmp}')`),false,key);
    assert.equal(run(`dnMet(${target},${target},'${cmp}')`),true);
  }
});
test('follow-up pools attendance counts and excludes partial months',()=>{
  const {run}=setup();
  run(`{const x=fixture();x.fmom=[{n:100,attended:1,v:1,partial:true},{n:3,attended:2,v:67,partial:false},{n:8,attended:7,v:88,partial:false}];computeDonor(x);}`);
  assert.equal(run('DONOR.fup'),9/11*100);assert.equal(run('DONOR.fupN'),11);
});
test('enrolment share uses the total, not largest-state normalization',()=>{
  const {run}=setup();
  run(`RAW.ltGrid=[['State','Facility name','Total enrolments (autocalculated)'],['','','']];
    const x=fixture();
    x.PGEO=[...Array.from({length:75},()=>({State:'MP','Date of enrolment':'2026-01-01'})),
      ...Array.from({length:25},()=>({State:'RJ','Date of enrolment':'2026-01-01'}))];
    computeDonor(x);`);
  assert.equal(run("DONOR.byState.find(r=>r.st==='MP').share"),75);
  assert.equal(run("DONOR.byState.find(r=>r.st==='RJ').share"),25);
  assert.equal(run('DONOR.byState.reduce((n,r)=>n+r.share,0)'),100);
});
test('donor labels describe enrolment and attendances without claiming regular care or unique FLWs',()=>{
  assert.match(html,/PLT1D enrolled<\/div>/);
  assert.doesNotMatch(html,/PLT1D enrolled and receiving regular care/);
  assert.match(html,/FLW orientation attendances/);
  assert.match(html,/includes repeat attendance/);
  assert.match(html,/repeat participation may be included/);
  assert.match(html,/<option value="GA">Goa<\/option>/);
});
test('Goa with planned facilities and no patients stays in the roll-up at zero',()=>{
  const {run,elements}=setup();
  elements['f-state']={value:'all',innerHTML:'',textContent:'',style:{}};
  run(`{const f={state:'all',division:'all',district:'all',facility:'all',dpc:'all',status:'all',sex:'all',age:'all'};
    const csF=[
      {State:'GA',District:'North Goa','Facility name':'DH Mapusa','T1D Clinic Operational?':'No'},
      {State:'GA',District:'North Goa','Facility name':'SDH Ponda','T1D Clinic Operational?':'No'},
      {State:'GA',District:'South Goa','Facility name':'DH Margao','T1D Clinic Operational?':'No'},
      {State:'GA',District:'South Goa','Facility name':'SDH Chicalim','T1D Clinic Operational?':'No'}];
    RAW.csFac=csF;RAW.enrolled=[];
    computeDonor({f,PGEO:[],csF,lt:{facCount:0,opCount:0,totalEnr:0,monthly:{},opStarts:[]},months:[],clin:[],hba:hbaEmpty(),smbg:{last:{n:0,v:[0,0,0,0]}},fmom:[],drs:[],nrs:[],oriF:[],csOp:0,insBase:null,insLast:null,dka:null,hypo:null});
    renderDonorStates();}`);
  assert.equal(run("DONOR.byState.find(r=>r.st==='GA').enrolled"),0);
  assert.equal(run("DONOR.byState.find(r=>r.st==='GA').clinics"),0);
  assert.equal(run("DONOR.byState.find(r=>r.st==='GA').districts"),0);
  assert.equal(run('DONOR.enrolled'),0);
  assert.match(elements['dn-states-tbl'].innerHTML,/Goa/);
  assert.match(elements['dn-states-tbl'].innerHTML,/#0a6b7d/);
  assert.equal(run("DN_DISTRICT_MAP.GA.map(d=>d.name).join('|')"),'North Goa|South Goa');
  elements['f-state'].value='GA';
  run('renderDonorStates();');
  assert.match(elements['dn-states-tbl'].innerHTML,/North Goa/);
  assert.match(elements['dn-states-tbl'].innerHTML,/South Goa/);
  assert.match(elements['dn-states-tbl'].innerHTML,/0 \/ 4 operational \/ planned sites/);
  assert.doesNotMatch(elements['dn-states-tbl'].innerHTML,/District boundaries are not drawn/);
  elements['f-district']={value:'North Goa',innerHTML:'',textContent:'',style:{}};
  run('renderDonorStates();');
  assert.match(elements['dn-states-tbl'].innerHTML,/DH Mapusa/);
  assert.match(elements['dn-states-tbl'].innerHTML,/SDH Ponda/);
});
test('full recompute preserves missing clinical data for an empty patient cohort',()=>{
  const {run}=setup();
  run(`RAW={enrolled:[],csFac:[],cap:[],orient:[],ltGrid:[],fupGrid:[],smbgGrid:[],hhGrid:[],hba:[],opsGrid:[],offsGrid:[],facAttr:{}};
    getF=()=>({state:'all',division:'all',district:'all',facility:'all',dpc:'all',status:'all',sex:'all',age:'all'});recompute();`);
  for(const key of ['bb','bbBase','smbg34','hba','dka','hypo','fup'])assert.equal(run(`DONOR.${key}`),null,key);
});
test('sheet aggregators retain exact attendance, SMBG counts and HbA1c means',()=>{
  const {run}=setup();
  run(`RAW.fupGrid=[['Claude_ID','State','Jan 26'],['p1','MP','Y'],['p2','MP','Y'],['p3','MP','N']];
    RAW.smbgGrid=[['Claude_ID','Enrolled for >3 months','Jan 26'],['p1','Yes','3'],['p2','Yes','4'],['p3','Yes','2']];
    RAW.hba=[{Claude_ID:'p1','Baseline HbA1c':10,'Latest HbA1c value':8.54,'Latest HbA1c time bucket':'3-6 months'}];`);
  assert.equal(run("computeFollowup({p1:1,p2:1,p3:1}).mom[0].attended"),2);
  assert.equal(run("computeSmbg({p1:1,p2:1,p3:1}).last.count34"),2);
  assert.equal(run("computeHba1c({p1:1}).rawAvgLatest"),8.54);
});
