const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1].split('// ── Passcode gate')[0];
// Aggregate-only fixture matching the verified public Targets CSV export.
const targetCSV='State,Follow-up adherence,Enrolment target\nCG,75%,700\nMP,75%,"1,082"\nUK,75%,602\nRJ,75%,"4,000"\nTotal,75%,"6,384"';
const emptyTargets={RJ:null,MP:null,UK:null,CG:null,all:null};
function setup(){
  const elements={},storage=new Map(),requests=[],errors=[];
  const context=vm.createContext({AbortController,setTimeout,clearTimeout,
    console:{warn(){},error(...args){errors.push(args);}},
    window:{devicePixelRatio:1},Chart:{defaults:{font:{}},register(){}},
    document:{querySelector(){return null;},querySelectorAll(){return [];},
      getElementById(id){return elements[id]??={textContent:'',style:{},value:'all'};}},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    fetch:async(url,options)=>{requests.push({url,options});return {ok:true,text:async()=>context.targetCSV};},
    targetCSV
  });
  vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context);
  const plain=code=>JSON.parse(JSON.stringify(run(code)));
  run(`function rawFixture(){return {enrolled:[],csFac:[],cap:[],orient:[],ltGrid:[],fupGrid:[],smbgGrid:[],hhGrid:[],hba:[],opsGrid:[],offsGrid:[],facAttr:{}};}
    RAW=rawFixture();`);
  return {run,plain,context,elements,storage,requests,errors};
}

test('actual target header reads counts rather than the adjacent adherence percentage',()=>{
  const {plain}=setup();
  assert.deepEqual(plain('parseTargets(parseCSV(targetCSV))'),{RJ:4000,MP:1082,UK:602,CG:700,all:6384});
});

test('legacy headers, title rows, reordered columns, casing and whitespace are supported',()=>{
  const {plain}=setup();
  assert.deepEqual(plain(`parseTargets([['Programme targets'],[' State–level   targets ',' STATE '],
    ['4,000',' rj '],['1,082','mp'],['602','UK'],['700','CG'],['999999','Total'],['75%','Follow-up adherence']])`),
    {RJ:4000,MP:1082,UK:602,CG:700,all:6384});
});

test('the current header takes precedence if both target columns exist',()=>{
  const {run}=setup();
  assert.equal(run(`parseTargets([['State','State-level targets','Enrolment target'],['CG','270','700']]).CG`),700);
  assert.equal(run(`parseTargets([['State','State-level targets','Enrolment target'],['CG','270','']]).CG`),null);
});

test('target counts retain zero and formatted integers while rejecting unsafe or malformed values',()=>{
  const {run,context}=setup();
  for(const [value,expected] of [[0,0],['0',0],[' 700 ',700],['1,082',1082],['4,000.0',4000],['1,00,000',100000]]){
    context.value=value;assert.equal(run('targetCount(value)'),expected,String(value));
  }
  for(const value of ['',null,undefined,'#REF!','75%','700 patients','-1','1.5','1,2','1e3',Infinity,NaN,'9007199254740992',true]){
    context.value=value;assert.equal(run('targetCount(value)'),null,String(value));
  }
});

test('missing columns or rows never infer numeric positions or reuse defaults',()=>{
  const {run,plain}=setup();
  assert.deepEqual(plain('TARGETS'),emptyTargets);
  for(const grid of ['null','[]',`[['State','',''],['CG','75%','700']]`,
    `[['State','Follow-up adherence'],['CG','75%']]`,
    `[['State'],['Enrolment target'],['CG','700']]`]){
    assert.deepEqual(plain(`parseTargets(${grid})`),emptyTargets);
  }
  assert.equal(run(`parseTargets([['State','Enrolment target'],['RJ','4000'],['MP','1082'],['UK','602'],['Total','6384']]).all`),null);
});

test('invalid and duplicate state rows invalidate that state and the overall sum',()=>{
  const {run}=setup();
  for(const extra of [`['CG','75%','']`,`['CG','75%','700']`,`['CG','75%','0']`]){
    run(`{const grid=parseCSV(targetCSV);grid.push(${extra});TARGETS=parseTargets(grid);}`);
    assert.equal(run('TARGETS.CG'),null);assert.equal(run('TARGETS.all'),null);
    assert.equal(run('TARGETS.RJ'),4000);
  }
  assert.equal(run(`parseTargets([['State','Enrolment target'],['RJ','9007199254740991'],['MP','1'],['UK','0'],['CG','0']]).all`),null);
});

test('all-state and each state recompute use the sheet target and render the correct percentages',()=>{
  const {run,elements}=setup();
  run(`TARGETS=parseTargets(parseCSV(targetCSV));
    for(const [State,n] of [['RJ',3000],['MP',800],['UK',352]])
      for(let i=0;i<n;i++)RAW.enrolled.push({State,Claude_ID:State+i,'Sex':'Male','Date of enrolment':'2026-01-01'});`);
  for(const [state,target,count,percent] of [['all',6384,4152,'65%'],['RJ',4000,3000,'75%'],
    ['MP',1082,800,'74%'],['UK',602,352,'58%'],['CG',700,0,'0%']]){
    elements['f-state']={value:state};
    run('recompute();renderKPIs(CURD,getF());');
    assert.equal(run('CURD.target'),target,state);assert.equal(run('CURD.enr'),count,state);
    assert.equal(elements['k-gaugeN'].textContent,percent,state);
    assert.equal(elements['k-target'].textContent,'of target '+target.toLocaleString(),state);
    assert.equal(elements['k-gauge'].style.width,percent,state);
  }
});

test('zero targets stay distinct from unavailable targets; gauge never divides by zero',()=>{
  const {run,elements}=setup();
  run(`TARGETS=parseTargets([['State','Enrolment target'],['RJ','0'],['MP','0'],['UK','0'],['CG','0']]);
    recompute();renderKPIs(CURD,getF());`);
  assert.equal(run('CURD.target'),0);assert.equal(elements['k-target'].textContent,'of target 0');
  assert.equal(elements['k-gaugeN'].textContent,'—');assert.equal(elements['k-gauge'].style.width,'0%');
  run(`TARGETS=parseTargets([]);recompute();renderKPIs(CURD,getF());`);
  assert.equal(run('CURD.target'),null);
  assert.equal(elements['k-target'].textContent,'Target unavailable · check Targets sheet');
  assert.equal(elements['k-gaugeN'].textContent,'—');assert.equal(elements['k-gauge'].style.width,'0%');
  run('CURD.target=700;CURD.enr=800;renderKPIs(CURD,getF());');
  assert.equal(elements['k-gaugeN'].textContent,'114%');assert.equal(elements['k-gauge'].style.width,'100%');
});

test('a missing state target remains unavailable under that state filter while valid states still render',()=>{
  const {run,elements}=setup();
  run(`{const grid=parseCSV(targetCSV);grid[1][2]='';TARGETS=parseTargets(grid);}`);
  for(const [state,target,label] of [['all',null,'Target unavailable · check Targets sheet'],
    ['CG',null,'Target unavailable · check Targets sheet'],['RJ',4000,'of target 4,000']]){
    elements['f-state']={value:state};run('recompute();renderKPIs(CURD,getF());');
    assert.equal(run('CURD.target'),target,state);assert.equal(elements['k-target'].textContent,label,state);
    assert.equal(elements['k-gaugeN'].textContent,target==null?'—':'0%',state);
  }
});

test('Targets export ignores old headerless cache, reuses current cache, refreshes and expires',async()=>{
  const {run,context,storage,requests}=setup();
  storage.set('t1d_sheet_v1:wb:Targets',JSON.stringify({savedAt:Date.now(),text:'State,,\nCG,75%,270'}));
  run("writeSheetCache('t1d_sheet_v1:wb:Other','id,value\\np1,1')");
  assert.equal((await run("fetchTab('wb','Other')"))[1][1],'1');
  assert.equal(requests.length,0,'other sheet caches remain valid');
  assert.equal((await run("fetchTab('wb','Targets')"))[0][2],'Enrolment target');
  assert.match(requests[0].url,/\/export\?format=csv&gid=1785757412$/);
  context.targetCSV=targetCSV.replace('CG,75%,700','CG,75%,900');
  assert.equal((await run("fetchTab('wb','Targets')"))[1][2],'700');
  assert.equal(requests.length,1);
  assert.equal((await run("fetchTab('wb','Targets',{forceFresh:true})"))[1][2],'900');
  assert.equal(requests.length,2);
  run("sheetCacheMemory.get('t1d_sheet_v1:wb:Targets:headers_v2').savedAt-=300001");
  await run("fetchTab('wb','Targets')");
  assert.equal(requests.length,3);assert.equal(requests[2].options.cache,'no-store');
});

test('Targets script fallback reconstructs labels and preserves formatted numeric cells',async()=>{
  const {run,context,storage}=setup();let removed=false,usedUrl;
  context.document.createElement=()=>({remove(){removed=true;}});
  context.document.head={appendChild(script){
    usedUrl=script.src;
    const callback=new URL(script.src).searchParams.get('tqx').split('responseHandler:')[1];
    context.window[callback]({status:'ok',table:{cols:[{label:'State'},{label:'Follow-up adherence'},{label:'Enrolment target'}],
      rows:[{c:[{v:'CG'},{v:0.75,f:'75%'},{v:700,f:'700'}]},{c:[{v:'MP'},{v:0.75,f:'75%'},{v:1082,f:'1,082'}]}]}});
  }};
  run("fetch=async()=>{throw new TypeError('Load failed');}");
  const grid=await run("fetchTab('wb','Targets')");
  assert.match(usedUrl,/headers=1&gid=1785757412/);
  assert.deepEqual(Array.from(grid[0]),['State','Follow-up adherence','Enrolment target']);
  context.grid=grid;assert.equal(run('parseTargets(grid).CG'),700);assert.equal(run('parseTargets(grid).MP'),1082);
  assert.equal(removed,true);assert.equal(storage.size,1);
  assert.equal((await run("fetchTab('wb','Targets')"))[0][2],'Enrolment target');
});

test('Refresh Data passes forceFresh to every source and replaces missing targets after a successful load',async()=>{
  const {run,context,elements,errors}=setup();const calls=[];
  context.fetchTab=async(id,name,{forceFresh,onSource})=>{
    calls.push({name,forceFresh});onSource(Date.now(),!forceFresh);
    if(name==='Targets')return context.targetGrid;
    if(name==='Enrolled List')return [['Claude_ID','State','Age','Sex'],...Array.from({length:50},(_,i)=>['synthetic-'+i,'RJ','10','Male'])];
    return [['State']];
  };
  context.targetGrid=run('parseCSV(targetCSV)');
  run('buildGeo=populateFilters=buildInfoTable=addSumNotes=()=>{};applyFilters=()=>{recompute();renderKPIs(CURD,getF());};');
  await run('boot()');
  assert.equal(errors.length,0,errors.map(args=>String(args[1])).join('\n'));
  assert.equal(run('TARGETS.all'),6384);assert.equal(calls.length,12);
  assert.ok(calls.every(c=>c.forceFresh===false));assert.match(elements['hdr-badge'].textContent,/^Cached/);
  calls.length=0;context.targetGrid=[['State','Enrolment target'],['RJ','']];
  await run('refreshData()');
  assert.equal(calls.length,12);assert.ok(calls.every(c=>c.forceFresh===true));
  assert.equal(run('TARGETS.all'),null);assert.equal(run('CURD.target'),null);
  assert.equal(elements['k-target'].textContent,'Target unavailable · check Targets sheet');
  assert.equal(elements['k-gaugeN'].textContent,'—');assert.match(elements['hdr-badge'].textContent,/^Updated/);
  assert.equal(elements['overlay'].style.display,'none');assert.equal(errors.length,0);
});

test('failed forced target fetch reports failure instead of silently returning cached targets',async()=>{
  const {run,context}=setup();
  await run("fetchTab('wb','Targets')");
  context.fetch=async()=>({ok:false,status:403});
  await assert.rejects(run("fetchTab('wb','Targets',{forceFresh:true})"),/HTTP 403 for "Targets"/);
});

test('full boot reuses cached targets and Refresh Data fetches target edits into the displayed KPI',async()=>{
  const {run,context,elements,requests,errors}=setup();
  const enrolments='Claude_ID,State,Age,Sex\n'+Array.from({length:50},(_,i)=>'synthetic-'+i+',RJ,10,Male').join('\n');
  context.fetch=async(url,options)=>{
    requests.push({url,options});
    const gid=new URL(url).searchParams.get('gid');
    const text=gid==='1785757412'?context.targetCSV:gid==='0'?enrolments:'State';
    return {ok:true,text:async()=>text};
  };
  run('buildGeo=populateFilters=buildInfoTable=addSumNotes=()=>{};applyFilters=()=>{recompute();renderKPIs(CURD,getF());};');
  await run('boot()');assert.equal(errors.length,0);assert.equal(requests.length,12);
  assert.equal(elements['k-target'].textContent,'of target 6,384');
  context.targetCSV=targetCSV.replace('CG,75%,700','CG,75%,900');
  await run('boot()');assert.equal(requests.length,12);
  assert.equal(elements['k-target'].textContent,'of target 6,384');
  await run('refreshData()');assert.equal(errors.length,0);assert.equal(requests.length,24);
  assert.equal(elements['k-target'].textContent,'of target 6,584');
  elements['f-state']={value:'CG'};run('recompute();renderKPIs(CURD,getF());');
  assert.equal(elements['k-target'].textContent,'of target 900');
  assert.equal(elements['k-gaugeN'].textContent,'0%');
});
