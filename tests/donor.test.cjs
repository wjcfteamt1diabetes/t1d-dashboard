const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function setup(){
  const elements={};
  const element=()=>({innerHTML:'',textContent:'',style:{},children:[],appendChild(c){this.children.push(c);}});
  const context=vm.createContext({console,window:{devicePixelRatio:1},Chart:{defaults:{font:{}},register(){}},
    document:{getElementById(id){return elements[id]??=element();},createElement:element}});
  // Exercise public calculation/rendering code only; authentication is not part of these unit tests.
  vm.runInContext(source.split('// ── Passcode gate')[0],context);
  const run=code=>vm.runInContext(code,context);
  run(`RAW={ltGrid:[['State','District','Facility name','T1D Clinic Operational?','Total enrolments (autocalculated)','Jan 26'],['RJ','Jaipur','LT Jaipur','Yes','100','100']]};
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
  for(const state of ['all','MP','RJ','CG']){
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
test('enrolment share bars use total, not largest-state normalization',()=>{
  const {run,elements}=setup();
  run(`computeDonor(fixture());DONOR.byState=[{st:'MP',name:'MP',districts:1,clinics:1,enrolled:75,share:75},{st:'RJ',name:'RJ',districts:1,clinics:1,enrolled:25,share:25}];renderDonorStates();`);
  assert.match(elements['dn-states-tbl'].innerHTML,/width:75%/);
  assert.match(elements['dn-states-tbl'].innerHTML,/width:25%/);
});
test('donor labels describe enrolment and attendances without claiming regular care or unique FLWs',()=>{
  assert.match(html,/PLT1D enrolled<\/div>/);
  assert.doesNotMatch(html,/PLT1D enrolled and receiving regular care/);
  assert.match(html,/Frontline workers: orientation attendances; repeat attendance may be counted/);
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
