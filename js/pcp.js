/* PCP-inspired display adaptation. These are independent kitchen tasks, not a
 * literal recreation of the aircraft/object displays in Wickens & Andre (1990).
 * Experimental-block responses have no correctness feedback; release and pilot identities are separate. */
(function(global){
  'use strict';
  const W=1200,H=640,WINDOW=3000,ITI=350,PRACTICE_ITI=1200;
  const INK='#342a20',PAPER='#fff9e7',YELLOW='#ffdf40',RED='#d94731';
  const FONT='"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  const CONDITIONS=Object.freeze([
    {id:'separated',name:'分开显示',note:'甜度和酸度各有一块仪表。'},
    {id:'integrated',name:'一起显示',note:'甜度和酸度放在同一块仪表里。'},
    {id:'task_matched',name:'按题目显示',note:'只看甜度时突出甜度；比较时把两边放在一起。'}
  ].map(Object.freeze));
  const ORDERS=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  function release(options={}){
    if(options.collectionMode===undefined)return{version:'pcp-stage3-1',experiment:'pcp_juice_stage3',testOnly:true,simulation:options.testOnly===true&&options.simulation===true};
    const protocol=global.AttentionProtocol||(typeof require==='function'?require('./protocol.js'):null);
    if(!protocol)throw new Error('实验协议未加载，请刷新页面后重试。');
    const settings=protocol.getEngineOptions(options.collectionMode,options),config=protocol.getConfig(settings.collectionMode);
    return{...config.experiments.juice,collectionMode:config.collectionMode,protocolVersion:config.protocolVersion,testOnly:config.testOnly,simulation:settings.simulation};
  }
  function modeFields(info){return info.collectionMode?{collectionMode:info.collectionMode,protocolVersion:info.protocolVersion}:{};}
  const copy=v=>JSON.parse(JSON.stringify(v));
  function hash(value){let h=2166136261;for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function rng(seed){let a=seed||1;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function shuffle(rows,random){const a=rows.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function expected(task,sweet,sour){return(task==='focused'?sweet>=6:sweet>sour)?'yes':'no';}
  function stimulusSet(){
    const rows=[],nuisance=[7,3,8,2,6];
    for(let i=0;i<5;i++)for(const sweet of [i+1,10-i])rows.push({stimulusId:`f${sweet}`,task:'focused',sweet,sour:nuisance[i],expected:expected('focused',sweet,nuisance[i])});
    [[6,5],[7,6],[6,4],[8,6],[8,5]].forEach(([a,b],i)=>{for(const [sweet,sour]of[[a,b],[b,a]])rows.push({stimulusId:`i${i+1}_${sweet>sour?'y':'n'}`,task:'integrated',sweet,sour,expected:expected('integrated',sweet,sour)});});
    return rows;
  }
  function createPlan(participantId='anonymous',options={}){
    const info=release(options);
    const seed=hash(participantId),orderIndex=seed%6,stimuli=stimulusSet();
    function trials(rows,prefix){return rows.map((r,i)=>({...r,id:`${prefix}_t${String(i+1).padStart(2,'0')}`,trialIndex:i,taskSwitched:i>0&&rows[i-1].task!==r.task,windowMs:WINDOW,itiMs:ITI}));}
    return{version:info.version,...modeFields(info),participantId,seed,orderIndex,assignment:'Seeded six-order allocation; not guaranteed balanced in a small sample.',responseWindowMs:WINDOW,itiMs:ITI,
      matching:'Identical stimulus set and answer/difficulty balance across all displays; independently shuffled within each display.',
      blocks:ORDERS[orderIndex].map((n,index)=>({blockId:`b${index+1}`,index,conditionId:CONDITIONS[n].id,durationMs:20*(WINDOW+ITI),events:trials(shuffle(stimuli,rng(hash(`${seed}:${CONDITIONS[n].id}`))),`b${index+1}`)})),
      practice:{blockId:'practice',index:-1,conditionId:'separated',durationMs:4*(WINDOW+PRACTICE_ITI),events:trials([
        {stimulusId:'p1',task:'focused',sweet:8,sour:5,expected:'yes'},
        {stimulusId:'p2',task:'focused',sweet:4,sour:7,expected:'no'},
        {stimulusId:'p3',task:'integrated',sweet:7,sour:3,expected:'yes'},
        {stimulusId:'p4',task:'integrated',sweet:2,sour:6,expected:'no'}],'p').map(e=>({...e,itiMs:PRACTICE_ITI}))}
    };
  }
  function id(){return global.crypto?.randomUUID?.()||`pcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;}
  function median(values){if(!values.length)return null;const a=values.slice().sort((a,b)=>a-b),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
  function summarize(result){
    return result.blocks.flatMap(b=>['focused','integrated'].map(task=>{
      const rows=b.events.filter(e=>e.task===task),presented=rows.filter(e=>e.actualOnsetMs!==null),correct=rows.filter(e=>e.outcome==='correct'),rts=correct.map(e=>e.rtMs);
      return{condition:b.conditionId,task,status:b.status,trials:rows.length,presented:presented.length,correct:correct.length,incorrect:rows.filter(e=>e.outcome==='incorrect').length,timeouts:rows.filter(e=>e.outcome==='timeout').length,
        accuracy:presented.length?correct.length/presented.length:null,meanRtMs:rts.length?rts.reduce((a,b)=>a+b,0)/rts.length:null,medianRtMs:median(rts)};
    }));
  }
  function createSession(options={}){
    const info=release(options),plan=createPlan(options.participantId||'anonymous',options),simulation=info.simulation;
    const realNow=options.now||(()=>performance.now());let virtualNow=0;
    const now=()=>simulation?virtualNow:realNow();
    let phase,subphase,runId,createdAt,completedAt,abortReason,blockIndex,active,practice,blocks,currentIndex,nextAt,lastFrame,lastCheckpoint,message;
    function blankBlock(spec){return{blockId:spec.blockId,index:spec.index,conditionId:spec.conditionId,durationMs:spec.durationMs,elapsedMs:0,status:'not_started',startedAt:null,startedPerfMs:null,
      events:spec.events.map(e=>({...copy(e),trialId:`${runId}:${e.id}`,actualOnsetMs:null,actualOnsetPerfMs:null,response:null,responseKey:null,responseMs:null,responsePerfMs:null,rtMs:null,outcome:'not_presented',closedAtMs:null})),
      timing:{onsetMethod:simulation?'simulation':'performance.now_before_canvas_draw',maxFrameGapMs:0}};}
    function current(){return active?.events[currentIndex]||null;}
    function state(){
      const e=current(),visible=['practice','running'].includes(phase)&&subphase==='trial'&&e?.outcome==='pending';
      return{type:'pcp_juice',version:plan.version,phase,subphase,runId,testOnly:info.testOnly,...modeFields(info),simulation,formal:phase==='running',uploads:false,
        block:['running','block_intro','break'].includes(phase)?blockIndex+1:null,totalBlocks:3,condition:phase==='practice'?'separated':plan.blocks[blockIndex]?.conditionId,
        trial:active?Math.min(currentIndex+1,active.events.length):0,totalTrials:active?.events.length||20,
        elapsedMs:active?.elapsedMs||0,durationMs:active?.durationMs||67000,
        stimulus:visible?{task:e.task,sweet:e.sweet,sour:e.sour,trialId:e.trialId,question:e.task==='focused'?'甜度达到 6 格了吗？':'甜度比酸度高吗？'}:null,
        message,abortReason,coordinates:'Canvas 1200×640; origin top left; x right, y down.',controls:'F: yes; J: no; Enter/Space to continue; Escape to stop.'};
    }
    function result(){const r={schemaVersion:2,experiment:info.experiment,testOnly:info.testOnly,...modeFields(info),simulation,version:plan.version,runId,participantId:plan.participantId,
      status:phase==='complete'?'complete':phase==='aborted'?'aborted':'in_progress',completed:phase==='complete',aborted:phase==='aborted',abortReason,createdAt,completedAt,
      plan:copy(plan),practice:practice?copy(practice):null,blocks:copy(blocks),note:info.collectionMode==='formal'?'Formal PCP-inspired protocol; no automatic upload. Matched display benefit remains a hypothesis.':'PCP-inspired pilot adaptation; no automatic upload. Matched display benefit is a hypothesis, not an established finding.'};r.summary=summarize(r);return r;}
    function emit(){options.onState?.(state());}
    function checkpoint(){lastCheckpoint=now();options.onCheckpoint?.(result());}
    function reset(){if(active&&['practice','running'].includes(phase))abort('reset');runId=id();createdAt=new Date().toISOString();completedAt=null;abortReason=null;phase='intro';subphase='waiting';blockIndex=0;active=null;practice=null;currentIndex=0;nextAt=null;lastFrame=null;lastCheckpoint=now();blocks=plan.blocks.map(blankBlock);message='先做 4 次练习，熟悉两种问题。';emit();return state();}
    function startBlock(spec,targetPhase){active=targetPhase==='practice'?blankBlock(spec):blocks[blockIndex];if(targetPhase==='practice')practice=active;active.status='in_progress';active.startedAt=new Date().toISOString();active.startedPerfMs=now();phase=targetPhase;subphase='awaiting_frame';currentIndex=0;nextAt=now();lastFrame=now();message='看清题目，再按 F 或 J。';checkpoint();emit();}
    function start(){if(phase==='intro')startBlock(plan.practice,'practice');else if(phase==='practice_complete'){phase='block_intro';subphase='waiting';message='接下来做三段任务，每段 20 杯。';emit();}else if(phase==='block_intro'||phase==='break')startBlock(plan.blocks[blockIndex],'running');else if(phase==='complete'||phase==='aborted')reset();return state();}
    function repeatPractice(){if(phase==='practice_complete'||phase==='block_intro')startBlock(plan.practice,'practice');return state();}
    function closeTrial(outcome,t,key=null){const e=current();if(!e||e.outcome!=='pending')return;
      e.outcome=outcome;e.closedAtMs=t-active.startedPerfMs;active.elapsedMs=Math.max(active.elapsedMs,t-active.startedPerfMs);
      if(key){e.responseKey=key;e.response=key==='f'?'yes':'no';e.responsePerfMs=t;e.responseMs=t-active.startedPerfMs;e.rtMs=t-e.actualOnsetPerfMs;}
      subphase='iti';nextAt=t+e.itiMs;
      if(phase==='practice'){
        const why=e.task==='focused'?`甜度 ${e.sweet} ${e.sweet>=6?'达到':'不到'} 6`:`甜度 ${e.sweet} ${e.sweet>e.sour?'比':'不比'}酸度 ${e.sour} 高`;
        message=outcome==='correct'?'答对了。':(outcome==='timeout'?'这杯超时了。':'')+`${why}，应该选「${e.expected==='yes'?'是':'不是'}」。`;
      }else message='下一杯马上来。';
      checkpoint();emit();
    }
    function finishBlock(){if(!active.events.every(e=>['correct','incorrect','timeout'].includes(e.outcome))){abort('unpresented_trials');return;}
      active.status='complete';active.elapsedMs=now()-active.startedPerfMs;
      if(phase==='practice'){phase='practice_complete';message='练习结束，准备好后进入任务。';}
      else if(blockIndex<2){blockIndex++;phase='break';message='可以休息一下，准备好再继续。';}
      else{phase='complete';completedAt=new Date().toISOString();message='三段任务都完成了，谢谢你。';}
      active=null;subphase='waiting';checkpoint();emit();if(phase==='complete')options.onComplete?.(result());
    }
    function tick(t=now()){
      if(!active||!['practice','running'].includes(phase))return state();
      if(!Number.isFinite(t)||t<lastFrame){abort('clock_invalid');return state();}
      const gap=t-lastFrame;lastFrame=t;active.timing.maxFrameGapMs=Math.max(active.timing.maxFrameGapMs,gap);active.elapsedMs=t-active.startedPerfMs;
      if(gap>500&&!simulation){abort('render_stall');return state();}
      const e=current();
      if(subphase==='trial'&&e?.outcome==='pending'&&t-e.actualOnsetPerfMs>=e.windowMs)closeTrial('timeout',t);
      if((subphase==='awaiting_frame'||subphase==='iti')&&t>=nextAt){
        if(subphase==='iti')currentIndex++;
        if(currentIndex>=active.events.length){finishBlock();return state();}
        const row=current();row.actualOnsetPerfMs=t;row.actualOnsetMs=t-active.startedPerfMs;row.outcome='pending';subphase='trial';message=row.task==='focused'?'只看甜度，判断有没有达到 6 格。':'比较两边，判断甜度是不是更高。';emit();
      }
      if(active&&t-lastCheckpoint>=5000)checkpoint();return state();
    }
    function respond(key){key=String(key).toLowerCase();if(!['f','j'].includes(key)||!active||!['practice','running'].includes(phase)||subphase!=='trial')return null;
      const t=now(),e=current();if(!e||e.outcome!=='pending')return null;
      if(!Number.isFinite(t)||t<e.actualOnsetPerfMs){abort('clock_invalid');return null;}
      if(t-lastFrame>500&&!simulation){abort('render_stall');return null;}
      if(t-e.actualOnsetPerfMs>=e.windowMs){closeTrial('timeout',t);return copy(e);}
      closeTrial((key==='f'?'yes':'no')===e.expected?'correct':'incorrect',t,key);return copy(e);
    }
    function abort(reason='participant_stopped'){if(phase==='complete'||phase==='aborted'||phase==='intro')return result();if(active){active.elapsedMs=Math.max(0,now()-active.startedPerfMs);active.status='aborted';const e=current();if(e?.outcome==='pending'){e.outcome='aborted';e.closedAtMs=active.elapsedMs;}}
      phase='aborted';subphase='waiting';abortReason=reason;message='这一轮已结束，已保留做到这里的记录。';checkpoint();emit();return result();}
    function advanceTime(ms){if(!simulation)return state();const end=virtualNow+Math.max(0,Math.min(Number(ms)||0,1000000));while(virtualNow<end){virtualNow=Math.min(end,virtualNow+10);tick(virtualNow);}emit();return state();}
    reset();return{start,reset,repeatPractice,respond,abort,tick,advanceTime,getState:state,getResult:result,plan:copy(plan),now};
  }
  function mount(canvas,options={}){
    if(typeof HTMLCanvasElement==='undefined'||!(canvas instanceof HTMLCanvasElement))throw new TypeError('A canvas is required.');
    const ctx=canvas.getContext('2d');canvas.width=W;canvas.height=H;canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label','果汁调配师。先读题目，F 表示是，J 表示不是。Escape 停止。');
    let destroyed=false,raf=0,imageReady=false,imageFailed=false,initialRect=null,lastNotify=0;
    const image=new Image(),session=createSession(options);
    function panel(x,y,w,h,r=12,fill=PAPER,stroke='#795432',width=2.5){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
    function text(value,x,y,size=20,color=INK,weight=700,align='left'){ctx.font=`${weight} ${size}px ${FONT}`;ctx.fillStyle=color;ctx.textBaseline='middle';ctx.textAlign=align;ctx.fillText(String(value),x,y);}
    function line(x,y,x2,y2,color='#b79d70',width=1.5){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
    function pill(label,x,y,w,fill=YELLOW,size=16){panel(x,y,w,30,15,fill);text(label,x+w/2,y+15,size,INK,800,'center');}
    function answer(label,key,x,fill){panel(x,540,271,58,10,fill,INK,2.8);text(key,x+35,570,20,fill===RED?'#fff':INK,850,'center');text(label,x+152,570,23,fill===RED?'#fff':INK,850,'center');}
    function gauge(x,value,label,color){
      const top=211,bottom=331,height=120;
      text(label,x,186,21,INK,850,'center');
      panel(x-24,top,48,height,8,'#fff3cf','#80623e',2);
      ctx.save();ctx.beginPath();ctx.roundRect(x-20,top+4,40,height-8,5);ctx.clip();ctx.fillStyle=color;ctx.fillRect(x-20,bottom-value/10*height,40,value/10*height);ctx.restore();
      for(let v=0;v<=10;v++){const yy=bottom-v/10*height;line(x+28,yy,x+(v%5===0?38:34),yy,'#816944',v%5===0?2:1);if(v%5===0)text(v,x+43,yy,12,'#5b4b35',650);}
      panel(x-66,348,132,34,8,'#fffaf0','#9a7746',1.8);text(`${value} 格`,x,365,23,INK,850,'center');
    }
    function drawMeters(stimulus,condition){
      const together=condition==='integrated'||condition==='task_matched'&&stimulus.task==='integrated';
      const emphasize=condition==='task_matched'&&stimulus.task==='focused';
      if(together){
        panel(400,157,400,239,16,'#e8bb64','#78532c',3);panel(410,167,380,219,12,'#fff3d3','#ac854b',1.8);
        for(const y of[211,271,331])line(450,y,745,y,'#ddcba5',1);
        gauge(505,stimulus.sweet,'甜度','#ca6849');gauge(685,stimulus.sour,'酸度','#d7a13e');
      }else{
        for(const x of[310,680]){panel(x,157,210,239,16,'#e8bb64','#78532c',3);panel(x+10,167,190,219,12,'#fff3d3','#ac854b',1.8);}
        if(emphasize)panel(314,161,202,231,13,null,'#9d462c',5);
        gauge(415,stimulus.sweet,'甜度','#ca6849');gauge(785,stimulus.sour,'酸度','#d7a13e');
      }
    }
    function draw(){
      if(destroyed)return;const s=session.getState();ctx.clearRect(0,0,W,H);ctx.lineJoin='round';
      if(imageReady)ctx.drawImage(image,0,-55,1200,800);else{ctx.fillStyle='#ffdfa1';ctx.fillRect(0,0,W,H);}
      pill(s.phase==='practice'?'练习':'实验二',27,24,90);
      panel(1014,20,163,39,10,'#fff8df');text(s.phase==='practice'?`第 ${s.trial||1} / 4 杯`:s.phase==='running'?`第 ${s.trial} / 20 杯`:'果汁调配师',1096,40,18,INK,800,'center');
      const active=['practice','running'].includes(s.phase),stim=s.stimulus;
      if(stim)drawMeters(stim,s.phase==='practice'?'separated':s.condition);
      else if(!active)drawMeters({task:'focused',sweet:7,sour:4},s.condition||'separated');
      else{
        // Cover the illustrated nonexperimental dials during the interval. No
        // task values, countdown or correctness colour appears in formal ITI.
        panel(310,157,580,239,16,'#f5d99b','#78532c',3);
        const feedback=s.phase==='practice'?s.message.replace(/。/g,'。\n').replace(/，/g,'，\n').split('\n').filter(Boolean):['下一杯'];
        feedback.forEach((line,i)=>text(line,600,278+(i-(feedback.length-1)/2)*36,23,INK,750,'center'));
      }
      panel(222,420,758,85,12,PAPER);
      const task=stim?.task;
      pill(task==='focused'?'只看甜度':task==='integrated'?'比较两边':'先看题目',242,447,125,task==='integrated'?'#e4ebbd':'#ffe39b',17);
      text(stim?.question||(active?'稍等一下，下一杯马上来。':'每一杯的问题可能不同。'),390,463,25,INK,850);
      answer('是','F',298,RED);answer('不是','J',629,PAPER);
      if(!['intro','practice_complete','block_intro','break','complete','aborted'].includes(s.phase))return;
      ctx.fillStyle='#39271578';ctx.fillRect(0,0,W,H);
      panel(283,149,650,354,22,INK,INK,3);panel(275,140,650,354,22,PAPER,INK,3);
      let title='先看题目，再看仪表',body=['只看甜度：判断有没有达到 6 格。','比较两边：判断甜度是不是比酸度高。'],action='先练习 4 次',label='先练习';
      if(s.phase==='practice_complete'){title='练习结束了';body=['接下来有三种显示方式，每种 20 杯。','每杯最多 3 秒；正式任务不提示答对还是答错。'];action='看看第一段';label='准备开始';}
      if(s.phase==='block_intro'||s.phase==='break'){const condition=CONDITIONS.find(c=>c.id===s.condition);title=condition.name;body=[condition.note,'F 表示“是”，J 表示“不是”。'];action='准备好了，开始';label=`第 ${s.block} / 3 段`;}
      if(s.phase==='complete'){title='谢谢你帮忙调配果汁';body=['三段任务的记录已保存在本机。',s.collectionMode==='formal'?'请按页面提示查看两项任务的结果。':'这次是测试，不计入正式样本。'];action='重新准备';label=s.collectionMode==='formal'?'任务完成':'测试完成';}
      if(s.phase==='aborted'){title='这一轮已经结束';body=['页面或窗口发生了变化，任务已停止。','做到这里的记录会保留。'];action='重新准备';label='已停止';}
      if(!imageReady){action=imageFailed?'画面加载失败，请返回重试':'画面正在加载…';}
      pill(label,520,122,160);text(title,600,204,29,INK,900,'center');
      body.forEach((v,i)=>text(v,600,260+i*37,20,'#6c583c',600,'center'));
      panel(465,383,270,62,11,RED,INK,3);text(action,600,414,imageReady?21:17,'#fff',850,'center');
    }
    function start(){if(!imageReady){options.onState?.({...session.getState(),message:imageFailed?'画面加载失败，请返回后重试。':'画面还在加载，请稍等片刻。'});return session.getState();}
      const s=session.start();if(['practice','running'].includes(s.phase)){initialRect=canvas.getBoundingClientRect().toJSON();session.tick(session.now());}draw();canvas.focus({preventScroll:true});return session.getState();}
    function respond(key){const row=session.respond(key);draw();return row;}
    function abort(reason){const r=session.abort(reason);draw();return r;}
    function point(event){const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left)/r.width*W,y:(event.clientY-r.top)/r.height*H};}
    function within(p,x,y,w,h){return p.x>=x&&p.x<=x+w&&p.y>=y&&p.y<=y+h;}
    function click(event){canvas.focus({preventScroll:true});const p=point(event),s=session.getState();if(['practice','running'].includes(s.phase)){if(within(p,298,540,271,58))respond('f');else if(within(p,629,540,271,58))respond('j');}else if(within(p,465,383,270,62))start();}
    function key(event){if(event.repeat)return;if(event.key==='Escape'){event.preventDefault();abort('participant_stopped');return;}if(['f','j'].includes(event.key.toLowerCase())){event.preventDefault();respond(event.key);return;}if(['Enter','Space'].includes(event.code)&&!['practice','running'].includes(session.getState().phase)){event.preventDefault();start();}}
    function hidden(){if(document.hidden)abort('page_hidden');}
    function resize(){if(['practice','running'].includes(session.getState().phase))abort('viewport_resized');}
    function frame(){if(destroyed)return;const s=session.getState();if(['practice','running'].includes(s.phase)){
      const r=canvas.getBoundingClientRect();if(initialRect&&['left','top','width','height'].some(k=>Math.abs(r[k]-initialRect[k])>2))abort('canvas_geometry_changed');else{session.tick(session.now());draw();}
      if(session.now()-lastNotify>=150){lastNotify=session.now();options.onState?.(session.getState());}
    }raf=requestAnimationFrame(frame);}
    image.onload=()=>{if(destroyed)return;imageReady=true;draw();};image.onerror=()=>{imageFailed=true;draw();};image.src='assets/juice.png';
    canvas.addEventListener('click',click);canvas.addEventListener('keydown',key);document.addEventListener('visibilitychange',hidden);global.addEventListener('resize',resize);draw();raf=requestAnimationFrame(frame);
    return{start,respond,abort,getState:session.getState,getResult:session.getResult,getReadiness:()=>({ready:imageReady,status:imageFailed?'error':imageReady?'ready':'loading'}),
      repeatPractice(){const s=session.repeatPractice();if(s.phase==='practice'){initialRect=canvas.getBoundingClientRect().toJSON();session.tick(session.now());}draw();return session.getState();},
      reset(){const s=session.reset();draw();return s;},advanceTime(ms){const s=session.advanceTime(ms);draw();return s;},
      destroy(){if(destroyed)return;session.abort('left_experiment');destroyed=true;cancelAnimationFrame(raf);canvas.removeEventListener('click',click);canvas.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',hidden);global.removeEventListener('resize',resize);image.onload=null;image.onerror=null;}
    };
  }
  const api={mount,createSession,createPlan,summarize,conditions:CONDITIONS,canvasSize:Object.freeze({width:W,height:H})};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global)global.AttentionPCP=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
