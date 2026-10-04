const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].split('// ── Passcode gate')[0];
function setup({reduced=false,intersection=false}={}){
  const elements={},frames=new Map(),observed=new Set(),classes=new Set(),listeners={};let nextFrame=0,observer;
  const preference={matches:reduced,addEventListener(type,fn){listeners.motion=fn;}};
  const canvas=(id='canvas',top=0)=>elements[id]??={id,textContent:'',style:{},top,shown:true,
    closest(){return {classList:{contains:()=>this.shown}};},getClientRects(){return this.shown?[{}]:[];},
    getBoundingClientRect(){return {top:this.top,bottom:this.top+200};}};
  class FakeChart{
    static defaults={font:{}};static instances={};static register(){};
    constructor(element,config){this.canvas=element;this.config=config;this.options=config.options;this.data=config.data;
      this.width=400;this.height=200;this.chartArea={left:40,right:380,top:20,bottom:180};this.operations=[];this.draws=0;this.updates=[];
      this.ctx=Object.fromEntries(['save','beginPath','rect','clip','restore','moveTo','arc','closePath'].map(name=>[name,(...args)=>this.operations.push([name,...args])]));
      this.plugins=config.plugins||[];this.id=Object.keys(FakeChart.instances).length;FakeChart.instances[this.id]=this;
      this.plugins.forEach(plugin=>plugin.beforeInit?.(this));this.draw();
    }
    getDatasetMeta(){return {data:[{x:200,y:100}]};}
    draw(){this.draws++;this.plugins.forEach(plugin=>plugin.beforeDatasetsDraw?.(this));this.plugins.forEach(plugin=>plugin.afterDatasetsDraw?.(this));}
    destroy(){delete FakeChart.instances[this.id];this.canvas=null;this.plugins.forEach(plugin=>plugin.afterDestroy?.(this));}
    stop(){this.stopped=true;}
    update(mode){this.updates.push(mode);this.draw();}
    resize(){}
  }
  const context=vm.createContext({console,Chart:FakeChart,setTimeout,clearTimeout,AbortController,
    window:{devicePixelRatio:1,innerHeight:500,matchMedia:()=>preference,addEventListener(type,fn){listeners[type]=fn;}},
    requestAnimationFrame(fn){frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame(id){frames.delete(id);},
    document:{visibilityState:'visible',querySelector(){return null;},querySelectorAll(){return [];},
      getElementById(id){return canvas(id);},addEventListener(type,fn){listeners[type]=fn;},
      documentElement:{classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}}}
  });
  if(intersection)context.IntersectionObserver=class{constructor(fn){observer=fn;}observe(el){observed.add(el);}unobserve(el){assert.ok(el);observed.delete(el);}};
  vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context);
  const create=(type='line',data=[10,20,15],id='canvas')=>{
    context.plot=canvas(id);context.values=data;return run(`createDashboardChart(plot,{type:'${type}',data:{datasets:[{data:values}]},options:{}})`);
  };
  const frame=time=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));};
  return {context,run,create,canvas,elements,frames,frame,preference,listeners,classes,observed,
    intersect(el){observer([{target:el,isIntersecting:true}]);}};
}

test('line drawing starts from scratch without changing data or axes and finishes within 1.1 seconds',()=>{
  const {create,run,frame,frames}=setup();const values=[10,null,90,20];const chart=create('line',values);
  assert.equal(chart.data.datasets[0].data,values);assert.equal(chart.options.animation,false);
  assert.deepEqual(chart.operations.find(op=>op[0]==='rect'),['rect',0,0,40,200]);
  assert.equal(frames.size,1);frame(0);frame(550);
  assert.equal(run('chartEntrances.values().next().value.progress'),.5);
  assert.deepEqual(chart.operations.filter(op=>op[0]==='rect').at(-1),['rect',0,0,210,200]);
  frame(1100);assert.equal(run('chartEntrances.size'),0);assert.equal(frames.size,0);
  assert.equal(chart.operations.filter(op=>op[0]==='save').length,chart.operations.filter(op=>op[0]==='restore').length);
});

test('bars rise and doughnuts sweep; all visible charts share one scheduler',()=>{
  const {create,frame,frames,run}=setup();const bar=create('bar',[15,30],'bar'),arc=create('doughnut',[30,70],'arc');
  assert.deepEqual(bar.operations.find(op=>op[0]==='rect'),['rect',0,180,400,200]);
  assert.equal(arc.operations.find(op=>op[0]==='arc').at(-1),-Math.PI/2);
  assert.equal(frames.size,1);frame(0);frame(700);assert.equal(run('chartEntrances.size'),0);
});

test('rapid redraws discard destroyed charts and old frames, including observer cleanup after canvas removal',()=>{
  const {create,frame,run,observed,frames}=setup({intersection:true});const old=create();frame(0);
  const oldCanvas=old.canvas;old.destroy();assert.equal(observed.has(oldCanvas),false);assert.equal(frames.size,0);
  const draws=old.draws;create('line',[99,1,80],'replacement');frame(100);frame(1200);
  assert.equal(old.draws,draws);assert.equal(run('chartEntrances.size'),0);
});

test('initial load waits for the overlay and off-screen charts wait for visibility',()=>{
  const {run,create,frames,frame,canvas,intersect}=setup({intersection:true});
  run('dashboardLoading=true');const initial=create();assert.equal(frames.size,0);
  run('dashboardLoading=false;resumeVisibleChartEntrances()');assert.equal(frames.size,1);frame(0);frame(1100);
  const below=canvas('below',900);const deferred=create('line',[10,20],'below');assert.equal(frames.size,0);
  intersect(below);assert.equal(frames.size,1);frame(1200);frame(2300);assert.equal(deferred.draws>1,true);
  initial.canvas.shown=false;create('line',[1,2],'canvas');assert.equal(frames.size,0);
});

test('reduced motion, empty values, all-zero data and export mode stay static',()=>{
  const reduced=setup({reduced:true});reduced.create();assert.equal(reduced.run('chartEntrances.size'),0);
  const normal=setup();for(const data of [[],[null,undefined,NaN,Infinity],[0,0]])normal.create('line',data);
  assert.equal(normal.run('chartEntrances.size'),0);assert.equal(normal.frames.size,0);
  normal.canvas('pdf-btn').disabled=true;normal.create();assert.equal(normal.run('chartEntrances.size'),0);
});

test('changing reduced-motion preferences or hiding the page finishes an in-flight chart',()=>{
  const {create,run,frame,preference,listeners,frames,context}=setup();create();frame(0);
  preference.matches=true;listeners.motion();assert.equal(run('chartEntrances.size'),0);assert.equal(frames.size,0);
  preference.matches=false;create('line',[1,2],'second');context.document.visibilityState='hidden';listeners.visibilitychange();
  assert.equal(run('chartEntrances.size'),0);assert.equal(frames.size,0);
});

test('actual Stock Levels renderer restarts each filtered dataset and keeps null/zero values correct',()=>{
  const {run,context,canvas,frames}=setup();
  run(`RAW={stock:[{fac:'A',commodity:'Glucometer',month:'January',year:2026,coverage:0},
    {fac:'A',commodity:'Glucometer',month:'February',year:2026,coverage:100},
    {fac:'B',commodity:'Glucometer',month:'January',year:2026,coverage:50}],facAttr:{a:{state:'MP'},b:{state:'RJ'}}};
    getF=()=>({state:document.getElementById('f-state').value,facility:'all',division:'all',district:'all',dpc:'all'});`);
  canvas('f-state').value='all';run('renderStockTrend()');
  assert.deepEqual(Array.from(run('_cstk.data.datasets[0].data')),[25,100]);
  const old=run('_cstk');canvas('f-state').value='MP';run('renderStockTrend()');
  assert.equal(old.canvas,null);assert.deepEqual(Array.from(run('_cstk.data.datasets[0].data')),[0,100]);
  assert.deepEqual(Array.from(run('_cstk.data.datasets[1].data')),[null,null]);assert.equal(frames.size,1);
  canvas('f-state').value='CG';run('renderStockTrend()');assert.equal(run('_cstk.data.labels.length'),0);
  assert.equal(run('chartEntrances.size'),0);assert.equal(frames.size,0);
});

test('PDF capture settles charts before capture instead of capturing a partially revealed line',async()=>{
  const {run,context,create,frame,classes,elements}=setup();const chart=create();let captured=0,downloaded=0;
  context.ensurePDFLibraries=async()=>{};context.activeFilterSummary=()=>'';
  context.document.querySelectorAll=selector=>selector==='.tabs-inner .tab'?[{textContent:'Stock Levels',classList:{contains:()=>true}}]:[];
  context.switchTab=()=>{};context.showPDFDownload=()=>downloaded++;
  context.window.jspdf={jsPDF:class{setFillColor(){}rect(){}setTextColor(){}setFont(){}setFontSize(){}text(){}addImage(){}}};
  context.html2canvas=async()=>{assert.equal(run('chartEntrances.size'),0);assert.ok(chart.updates.includes('none'));assert.equal(classes.has('pdf-exporting'),true);captured++;return {width:400,height:200,toDataURL:()=>''};};
  const pending=run('exportPDF()');
  for(let i=0;i<5;i++){await new Promise(resolve=>setImmediate(resolve));frame(i*16);}
  await pending;assert.equal(captured,1);assert.equal(downloaded,1);assert.equal(classes.has('pdf-exporting'),false);assert.equal(elements['pdf-btn'].disabled,false);
});
