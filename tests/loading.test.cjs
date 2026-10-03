const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1].split('// ── Passcode gate')[0];

function setup({storageBlocked=false,config}={}){
  const storage=new Map(),requests=[];
  const context=vm.createContext({console,AbortController,setTimeout,clearTimeout,
    window:{devicePixelRatio:1,DASHBOARD_CONFIG:config},Chart:{defaults:{font:{}},register(){}},
    document:{querySelector(){return null;},querySelectorAll(){return [];},getElementById(){return null;}},
    sessionStorage:{getItem:k=>storage.get(k)||null,
      setItem(k,v){if(storageBlocked)throw new Error('Storage blocked');storage.set(k,v);},
      removeItem:k=>storage.delete(k)},
    fetch:async(url,options)=>{requests.push({url,options});return {ok:true,text:async()=> 'id,value\np1,'+requests.length};}
  });
  vm.runInContext(source,context);
  return {run:code=>vm.runInContext(code,context),requests,storage,context};
}

test('single-file previews use the configured public workbooks without config.js',()=>{
  const {context}=setup();
  const external=fs.readFileSync(path.join(__dirname,'../config.js'),'utf8');
  const expected={window:{}};vm.runInNewContext(external,expected);
  assert.equal(context.window.DASHBOARD_CONFIG.wb1,expected.window.DASHBOARD_CONFIG.wb1);
  assert.equal(context.window.DASHBOARD_CONFIG.wb2,expected.window.DASHBOARD_CONFIG.wb2);
});

test('inline defaults preserve an existing hosted configuration',()=>{
  const config={wb1:'custom-one',wb2:'custom-two'};
  assert.equal(setup({config}).context.window.DASHBOARD_CONFIG,config);
});

test('sheet cache survives a new page, expires, and explicit refresh bypasses it',async()=>{
  const {run,requests,storage}=setup();
  assert.equal((await run("fetchTab('wb','tab')"))[1][1],'1');
  assert.equal((await run("fetchTab('wb','tab')"))[1][1],'1');
  assert.equal(requests.length,1);
  run('sheetCacheMemory.clear()');
  await run("fetchTab('wb','tab')");
  assert.equal(requests.length,1,'new-page read reuses session storage');
  assert.equal((await run("fetchTab('wb','tab',{forceFresh:true})"))[1][1],'2');
  assert.equal(requests.length,2);
  for(const [k,v] of storage){const entry=JSON.parse(v);entry.savedAt-=300001;storage.set(k,JSON.stringify(entry));}
  run('sheetCacheMemory.clear()');
  await run("fetchTab('wb','tab')");
  assert.equal(requests.length,3);
  assert.equal(requests[2].options.cache,'no-store');
});

test('blocked storage falls back to memory and does not prevent loading',async()=>{
  const {run,requests}=setup({storageBlocked:true});
  await run("fetchTab('wb','tab')");await run("fetchTab('wb','tab')");
  assert.equal(requests.length,1);
});

test('failed forced refresh reports failure and does not cache the error response',async()=>{
  const {run,requests,context}=setup();
  await run("fetchTab('wb','tab')");
  context.fetch=async()=>({ok:false,status:403});
  await assert.rejects(run("fetchTab('wb','tab',{forceFresh:true})"),/HTTP 403/);
  assert.equal((await run("fetchTab('wb','tab')"))[1][1],'1');
  assert.equal(requests.length,1);
});

test('cache hits parse a fresh grid so header repair cannot mutate cached data',async()=>{
  const {run}=setup();
  await run("(async()=>{const grid=await fetchTab('wb','tab');grid[0][0]='changed';})()");
  assert.equal((await run("fetchTab('wb','tab')"))[0][0],'id');
});

test('charts render only for the selected tab and become dirty after filters change',()=>{
  const {run,context}=setup();const calls=[];
  const names=['renderKPIs','renderLtExclusionNote','populateFilters','recompute',
    'buildC1','buildC2','renderGender','buildAge','renderPTF','renderTrainedStaff','renderPeerSupport',
    'buildFupChart','renderSmbg','renderHyperHypo','computeClinicOps','buildClinOps','buildOffDays',
    'renderTDD','renderBasal','buildHbaChange','buildHbaAvg','buildHbaAll','buildHbaDist','buildHbaLatest',
    'buildStaticCharts','renderStockKPIs','renderStockTrend','renderStockHeatmap',
    'renderDonorKPIs','renderLogframe','renderDonorStates','buildDonorGrowth','renderDonorRegimen',
    'renderDonorHbaDumbbell','renderDonorCapacityTargets','buildDonorCadre'];
  for(const name of names)context[name]=()=>calls.push(name);
  run('RAW={stock:[]};CURD={};applyFilters()');
  assert.ok(calls.includes('buildC1'));
  assert.ok(!calls.includes('buildHbaAvg'));
  assert.ok(!calls.includes('renderDonorStates'));
  calls.length=0;run('switchTab(4)');
  assert.ok(calls.includes('renderDonorStates'));
  calls.length=0;run('switchTab(4)');assert.equal(calls.length,0);
  run('applyFilters()');assert.ok(calls.includes('renderDonorStates'));
  calls.length=0;run('switchTab(0)');assert.ok(calls.includes('buildC1'));
});

test('the stock tab waits for its deferred dataset before rendering',async()=>{
  const {run,context}=setup();let loads=0;
  context.ensureStockLoaded=async()=>{loads++;return true;};
  run('RAW={stock:null};');
  assert.equal(await run('switchTab(3)'),true);
  assert.equal(loads,1);
});

test('concurrent stock requests share one download and ignore an obsolete refresh',async()=>{
  const {run,context}=setup();let downloads=0,resolveResponse;
  context.window.DASHBOARD_CONFIG={wb2:'wb2'};
  context.fetch=()=>{downloads++;return new Promise(resolve=>resolveResponse=resolve);};
  run('RAW={stock:null};');
  const first=run('ensureStockLoaded()'),second=run('ensureStockLoaded()');
  assert.equal(first,second);
  assert.equal(downloads,1);
  run('RAW={stock:null};'); // A new boot has replaced the old dataset.
  resolveResponse({ok:true,text:async()=> 'Facility,Commodity,Month,Year,Month-Year\nF,Glucometer,January,2026,January-2026'});
  assert.equal(await first,false);
  assert.equal(run('RAW.stock'),null,'old response must not populate the new dataset');
});

test('Safari fetch failures use the Google script transport and cache its result',async()=>{
  const {run,context}=setup();let fallbackCalls=0,usedUrl;
  run("fetch=async()=>{throw new TypeError('Load failed');}");
  context.fetchGoogleSheetScript=async url=>{fallbackCalls++;usedUrl=url;return [['Claude_ID','value'],['p1','a,b']];};
  assert.equal((await run("fetchTab('wb','Enrolled List')"))[1][1],'a,b');
  assert.match(usedUrl,/docs\.google\.com\/spreadsheets\/d\/wb\/gviz\/tq\?headers=0&gid=0$/);
  assert.equal((await run("fetchTab('wb','Enrolled List')"))[1][1],'a,b');
  assert.equal(fallbackCalls,1);
});

test('Google script responses preserve formatted cells and clean up callbacks',async()=>{
  const {run,context}=setup();let removed=false;
  context.document.createElement=()=>({remove(){removed=true;}});
  context.document.head={appendChild(script){
    const callback=new URL(script.src).searchParams.get('tqx').split('responseHandler:')[1];
    context.window[callback]({status:'ok',table:{cols:[{},{}],rows:[{c:[{v:0.75,f:'75%'},null]}]}});
  }};
  const grid=await run("fetchGoogleSheetScript('https://docs.google.com/spreadsheets/d/wb/gviz/tq?headers=0','tab')");
  assert.equal(grid[0][0],'75%');assert.equal(grid[0][1],'');
  assert.equal(removed,true);
  assert.ok(!Object.keys(context.window).some(k=>k.startsWith('t1dSheetResponse_')));
});

test('blocked Google script requests report the affected sheet without caching data',async()=>{
  const {run,context,storage}=setup();let removed=false;
  context.document.createElement=()=>({remove(){removed=true;}});
  context.document.head={appendChild(script){script.onerror();}};
  run("fetch=async()=>{throw new TypeError('Load failed');}");
  await assert.rejects(run("fetchTab('wb','Enrolled List')"),/access was blocked for "Enrolled List"/);
  assert.equal(storage.size,0);assert.equal(removed,true);
});

test('denied session storage does not prevent the passcode screen initializing',()=>{
  const fullScript=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const gate=fullScript.slice(fullScript.indexOf('// ── Passcode gate'));
  let focused=false;
  vm.runInNewContext(gate,{
    sessionStorage:{getItem(){throw new Error('Storage access denied');}},
    document:{getElementById(){return {focus(){focused=true;}};}},
    boot(){assert.fail('The passcode must still be required');}
  });
  assert.equal(focused,true);
});
