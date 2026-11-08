(function () {
  'use strict';
  const main = document.getElementById('main');
  const data = window.AttentionData;
  const protocol = window.AttentionProtocol;
  const mode = protocol.getMode();
  const config = protocol.getConfig(mode);
  const isFormal = mode === 'formal';
  data.setCollectionMode(mode);
  document.querySelector('.version-label').textContent = isFormal ? '课程研究' : '先导检查';
  let controller = null;
  let gazeController = null;
  let consentDraft = false;
  let currentRoute = '';
  let completed = new Set();
  let toastTimer;
  const games = {
    bakery: { title: '饼干别烤焦', subtitle: '看好四个烤箱，饼干熟了就取出来。', asset: 'bakery.png', number: '1', control: '按 1、2、3、4，或直接点烤箱', detail: '四个烤箱会陆续烤好饼干。看到“烤好了”，就按对应数字或点击烤箱。太早取出会夹生，等太久就会烤焦。', other: 'juice' },
    juice: { title: '果汁调配师', subtitle: '看一看读数，判断这杯果汁的味道。', asset: 'juice.png', number: '2', control: '按 F 或 J，也可以点击答案', detail: '先读这一杯的问题，再看甜度和酸度。有时只需要看一个读数，有时要比较两个读数。选好答案后，会告诉你答得对不对。', other: 'bakery' }
  };
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function toast(message) {
    const el = document.getElementById('toast'); el.textContent = message; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }
  function go(route) { if (location.hash === '#' + route) render(); else location.hash = route; }
  function on(id, event, handler) { const el = document.getElementById(id); if (el) el.addEventListener(event, handler); }
  function steps(active) { return '<ol class="step-line" aria-label="参与准备">' + ['阅读说明','填写编号','开始任务'].map((label,i) => '<li class="' + (i === active ? 'active' : i < active ? 'done' : '') + '"' + (i === active ? ' aria-current="step"' : '') + '>' + (i+1) + '. ' + label + '</li>').join('') + '</ol>'; }
  function session() { return data ? data.getSession() : null; }
  function hasConsent() { return session()?.collectionMode === mode && session()?.consentVersion === config.consentVersion; }
  let lab = null;
  const FLOW_KEY = 'attention-kitchen-flow-' + config.protocolVersion;
  let flow = null;
  function loadFlow() {
    const sid=session()?.sessionId;
    if(!sid){flow=null;return null;}
    if(flow?.sessionId!==sid){
      flow=null;
      try { const saved=JSON.parse(localStorage.getItem(FLOW_KEY)); if(saved?.sessionId===sid)flow=saved; } catch (_) {}
    }
    const runs=(data.getPilotResults?.()||[]).filter(r=>r.bundleId&&r.protocolVersion===config.protocolVersion&&Object.values(config.experiments).some(experiment=>r.experiment===experiment.experiment&&r.version===experiment.version));
    if(!flow&&runs.length){
      const last=runs[runs.length-1];
      flow={id:last.bundleId,sessionId:sid,startedAt:last.flowStartedAt||last.createdAt};
    }
    // Results are authoritative if a refresh interrupted the separate flow write.
    if(flow){
      const pair=runs.filter(r=>r.bundleId===flow.id&&r.status==='complete');
      const bakery=pair.find(r=>r.experiment===config.experiments.bakery.experiment);
      const juice=pair.find(r=>r.experiment===config.experiments.juice.experiment);
      flow.bakeryRunId=bakery?.runId||null;flow.juiceRunId=juice?.runId||null;
      flow.status=bakery&&juice?'complete':'in_progress';
      flow.finishedAt=bakery&&juice?[bakery.completedAt,juice.completedAt].sort().at(-1):null;
    }
    return flow;
  }
  function persistFlow() { try { localStorage.setItem(FLOW_KEY,JSON.stringify(flow)); } catch (_) {} }
  function beginFlow(type, restart=false) {
    loadFlow();
    if(restart||!flow||flow.status==='complete'||flow[type+'RunId']) {
      flow={id:crypto.randomUUID?.()||'flow-'+Date.now(),sessionId:session().sessionId,startedAt:new Date().toISOString(),status:'in_progress',bakeryRunId:null,juiceRunId:null,firstGame:type};persistFlow();
    }
    return flow;
  }
  function saveRun(result) {
    const sameFlow=flow?.sessionId===session()?.sessionId;
    return data.savePilotResult({...result,bundleId:sameFlow?flow.id:null,flowStartedAt:sameFlow?flow.startedAt:null});
  }
  function finishFlowRun(type,result) {
    if(!flow||flow.sessionId!==session()?.sessionId)return;
    flow[type+'RunId']=result.runId;
    if(flow.bakeryRunId&&flow.juiceRunId){flow.status='complete';flow.finishedAt=new Date().toISOString();}
    persistFlow();
  }
  function isJuice(result) {return result.experiment.includes('pcp_juice');}
  function runTitle(result) {return isJuice(result)?'果汁调配师':'饼干别烤焦';}

  function downloadJSON(value, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})); const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000); }
  function downloadBackup() {
    const backup = data && data.getBackup();
    if (!backup) { toast('还没有需要备份的记录。'); return; }
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = '注意厨房_参与记录_' + (session().participantId || 'backup') + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function showPreviousProtocolBackup(host) {
    const archive=data.getPreviousProtocolBackup?.();
    if(!archive||(archive.records.length===0&&archive.sessions.length===0))return;
    const notice=document.createElement('aside');notice.className='notice previous-records';
    notice.innerHTML='<p>这台浏览器保留着旧版参与记录。它们不会计入这次新版任务，也不会改成新版数据。</p><button class="text-button" type="button">下载旧版记录</button>';
    notice.querySelector('button').onclick=()=>downloadJSON(data.getPreviousProtocolBackup(),'注意厨房_旧版记录_'+Date.now()+'.json');
    host.append(notice);
  }
  function gameCard(type) { const g = games[type]; return '<a class="game-card" href="#' + type + '"><div class="game-cover"><img src="assets/' + g.asset + '" alt="' + (type === 'bakery' ? '小鸡点心师和四个黄色烤箱，里面放着巧克力饼干' : '小鸡店员站在黄色果汁机旁，台上摆着橙子和柠檬') + '"><span class="cover-action">看看怎么玩</span></div><span class="game-caption"><span class="game-number">' + g.number + '</span>' + g.title + '</span><span class="game-caption-sub">' + (type === 'bakery' ? '哪里需要你多看一眼？' : '分开看，还是一起看？') + '</span></a>'; }
  function home() {
    const existing = hasConsent() ? session() : null;
    main.innerHTML = '<section class="ticket-wrap" aria-labelledby="welcome"><div class="ticket"><div class="ticket-inside"><div class="ticket-main"><div class="ticket-top"><span>一张入场券，两个小游戏</span><span class="ticket-serial">No. 001</span></div><h1 id="welcome">欢迎你来到<span class="welcome-name">注意厨房！</span></h1><p class="ticket-description">来玩两个小游戏，看看你会把注意力放在哪里。<br>先看好烤箱里的饼干，再调一杯酸甜刚好的果汁。</p><div class="ticket-games">' + gameCard('bakery') + gameCard('juice') + '</div></div><aside class="ticket-stub"><div><p class="stub-title">两个小游戏，一次参与</p><p class="stub-time">约9<span>分钟</span></p><p class="stub-sub">包含一次摄像头校准、练习和两个游戏。</p><ul class="stub-list"><li>两个游戏请用电脑和键盘</li><li>匿名参加，不用填写姓名</li><li>随时可以退出</li></ul></div><div><a class="button primary wide" href="#' + (existing ? 'ready' : 'consent') + '"><span class="triangle" aria-hidden="true"></span>' + (existing ? '继续参与' : '开始参与') + '</a><p class="stub-foot">先阅读说明，再领取你的匿名编号。</p></div></aside></div></div></section><div class="home-bottom"><section class="how-strip"><span class="round-icon" aria-hidden="true">✓</span><div><h2>先看好烤箱，再来调果汁</h2><p>每个游戏都有短练习。烤箱两段、果汁三段，完成后一起看结果。</p></div></section><section class="how-strip"><span class="round-icon" aria-hidden="true">◎</span><div><h2>摄像头估计四个大区域</h2><p>完成校准后才开始任务。画面只在本机处理，不会上传视频。</p></div></section></div><p class="stage-note">'+(isFormal?'每项任务完成后会自动保存到课程项目。视频不上传，视线热图留在本机。':'当前为真人先导检查，记录标为测试，不计入正式样本。')+'重新校准或自行休息会延长用时。</p>';
  }
  function recruitmentNotice() {
    main.innerHTML='<section class="paper-panel prose"><h1>暂未开放报名</h1><p>这份课程研究还在做最后的设备检查。项目负责人确认后，会邀请你正式参加。</p><div class="form-actions"><a class="button yellow" href="#home">返回首页</a><a href="?mode=pilot#home">我是受邀进行先导检查的参加者</a></div></section>';
  }
  function consent() {
    main.innerHTML = steps(0) + '<div class="page-head"><div><h1>开始前，请先读这几条</h1><p>这是一项工程心理学课程研究，用两个小游戏比较不同界面怎样影响操作和注意分配。</p></div></div><div class="form-layout"><form id="consent-form" class="paper-panel"><h2>关于这次参与</h2>'+(isFormal?'':'<p class="notice">本次是正式收数前的真人先导检查。数据会带有测试标记，不计入正式样本；结束后由你决定是否上传。</p>')+'<ul class="consent-list"><li><strong>你需要做什么：</strong>先校准摄像头，再照看四个烤箱、判断果汁的甜度和酸度。两个任务都有练习。一次校准顺利时合计约 9 分钟；重新校准、等待设备或休息可能超过 10 分钟。</li><li><strong>摄像头怎么用：</strong>只在校准和烤箱任务中估计视线位置。视频在浏览器本机处理，不录制、不上传；烤箱结束或离开任务页面就关闭。果汁任务不使用摄像头。你可以拒绝开启摄像头，继续完成操作部分；此时没有眼动结果。</li><li><strong>会上传什么：</strong>'+(isFormal?'每项完整任务结束后，会自动上传并检查服务器是否收到。':'你选择上传后，页面会检查服务器是否收到。')+'上传到课程注意实验室的数据包括匿名编号、同意版本与时间、任务版本和条件、逐次按键与反应时间、正确或错误结果、设备校准质量及四个烤箱的视线区域汇总。原始视线坐标只保存在这台浏览器，用于热图和下载备份，不上传视频、照片或坐标。</li><li><strong>你可以随时停止：</strong>点击“退出本次参与”或关闭页面即可，不会受到处罚。未完成任务不会自动上传。已完成并上传的任务会保留；如希望撤回，请在收数结束前将匿名编号告知邀请你的项目负责人，由其从课程项目中删除。请保留编号，否则可能无法定位你的记录。</li><li><strong>不用提供个人身份信息：</strong>页面会生成匿名编号，也可以填写邀请者给你的编号。不要填写姓名、学号或联系方式。结果只用于课程作业，不用于诊断或评价个人能力。</li><li><strong>数据由谁使用：</strong>项目负责人及课程教师用于作业核查和汇总分析。公开结果只展示匿名汇总。你下载的完整备份含视线坐标，请只交给项目负责人，不要公开发布。</li></ul><label class="consent-check"><input id="consent-check" type="checkbox" required><span>我已阅读以上说明，理解数据用途，自愿参加。</span></label><div class="form-actions"><button class="button primary" type="submit">同意并继续</button><a href="#home">暂不参加，返回首页</a></div></form><aside class="help-aside"><img src="assets/logo.svg" alt=""><h3>先了解，再决定</h3><p>请用电脑和键盘，在安静、光线均匀的地方参加。</p><p>有疑问时，可以先联系邀请你的人。未勾选同意前，不会开启摄像头或发送任务记录。</p></aside></div>';
    on('consent-form','submit', e => { e.preventDefault(); if (!document.getElementById('consent-check').checked) return; consentDraft = true; go('entry'); });
  }
  function entry() {
    if (!consentDraft) { go('consent'); return; }
    main.innerHTML = steps(1) + '<div class="page-head"><div><h1>给这次参与一个编号</h1><p>如果邀请你的人已经给了编号，直接填在下面。没有的话，点“生成一个编号”就好。</p></div></div><div class="form-layout"><form id="entry-form" class="paper-panel"><div class="form-field"><label for="participant-id">你的匿名编号</label><div class="field-row"><input id="participant-id" type="text" placeholder="例如 P001" minlength="3" maxlength="24" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="id-hint id-error" required><button id="generate-id" type="button" class="button small">生成一个编号</button></div><p class="field-hint" id="id-hint">可以用英文字母、数字、短横线和下划线，共 3–24 位。请不要填写姓名或学号。</p><p class="field-error" id="id-error" role="alert" hidden></p></div><div class="notice">编号和同意记录先保存在本机，和完成的任务记录一起保存。请记下编号，两个任务使用同一个编号。</div><div class="form-actions"><button class="button primary" type="submit">保存编号，继续</button><a href="#consent">返回说明</a></div></form><aside class="help-aside"><img src="assets/logo.svg" alt=""><h3>记住这个编号就够了</h3><p>同一位参加者在两个游戏里使用同一个编号。请不要和其他人共用。</p><p>换人参加时，回到准备页面，选择“换一个人参加”。</p></aside></div>';
    on('generate-id','click', () => { document.getElementById('participant-id').value = data.generateParticipantId(mode); document.getElementById('participant-id').focus(); });
    on('entry-form','submit', async e => {
      e.preventDefault(); const input = document.getElementById('participant-id'); const checked = data.validateParticipantId(input.value,mode);
      const error = document.getElementById('id-error');
      if (!checked.valid) { input.setAttribute('aria-invalid','true'); error.textContent = checked.message; error.hidden = false; return; }
      const create=()=>{try { data.createSession({participantId:checked.value,consentAccepted:consentDraft,collectionMode:mode}); consentDraft=false; completed.clear(); go('ready'); } catch (err) { error.textContent=err.message; error.hidden=false; }};
      if(session()&&session().consentVersion!==config.consentVersion){
        showModal('按新的参与说明继续','这台浏览器还留着上一版本的参与记录。你可以先下载旧备份；继续后会创建新会话，已经上传的旧记录不受影响。',[
          {label:'先下载旧备份',action:downloadBackup,keep:true},{label:'取消',action:()=>{}},
          {label:'创建新会话',primary:true,action:()=>{try{data.clearSession();create();}catch(err){toast(err.message);}}}
        ]);return;
      }
      create();
    });
  }
  function ready() {
    const s=session();if(!hasConsent()){go('consent');return;}loadFlow();
    const bakeryDone=flow?.bakeryRunId;const juiceDone=flow?.juiceRunId;
    const cards=Object.keys(games).map(type=>{
      const locked=type==='juice'&&isFormal&&!bakeryDone;
      const label=type==='bakery'?(bakeryDone?'已完成 · 查看结果':'开始烤箱实验'):(juiceDone?'已完成 · 查看结果':bakeryDone?'继续果汁实验':locked?'完成烤箱后开始':'看看果汁怎么玩');
      const action=locked?'<button class="button yellow" type="button" disabled>'+label+'</button>':'<a class="button yellow" href="#'+type+'">'+label+'</a>';
      return '<article class="ready-game"><img src="assets/'+games[type].asset+'" alt="'+games[type].title+'场景"><div class="ready-game-content"><h2>'+games[type].title+'</h2><p>'+(type==='bakery'?'先校准，再照看烤箱。练习和任务约 3 分钟。':'判断甜度，或比较甜度和酸度。练习和任务不超过 4 分钟。')+'</p>'+action+'</div></article>';
    }).join('');
    main.innerHTML=steps(2)+'<div class="page-head"><div><h1>准备好了，来玩吧</h1><p>先照看烤箱，再调一杯果汁。校准、练习和两个游戏合计约 9 分钟。</p></div></div><span class="id-badge">'+escape(s.participantId)+'</span><button class="text-button" id="new-person" style="margin-left:20px">换一个人参加</button><div class="ready-games">'+cards+'</div>'+(bakeryDone||juiceDone?'<div class="form-actions"><a class="button yellow" href="#results">查看本次结果与热图</a></div>':'')+'<section class="receipt" id="receipt" aria-live="polite"></section>';
    updateReceipt();on('new-person','click',newPerson);showSavedRuns();
  }
  function updateReceipt() {
    const el=document.getElementById('receipt');if(!el)return;
    const stored=data.getStorageStatus();
    el.innerHTML='<h2>编号已保存在本机</h2><p>'+(isFormal?'每项完整任务结束后，页面会自动上传并核对记录；如果没有成功，会提示重试或下载备份。':'先导记录与正式记录分开保存。完成后可以下载备份，或手动上传测试记录。')+'</p>'+(!stored.available?'<p class="field-error">'+escape(stored.message)+'</p>':'')+'<button id="backup-record" class="text-button">下载本机记录</button>';
    on('backup-record','click',downloadBackup);
    showPreviousProtocolBackup(el);
  }
  function newPerson() {
    const s=session();const uncertain=s&&!['confirmed','warning','ready'].includes(s.status);
    const runs=data.getPilotResults?.()||[];
    const message=runs.length?'这位参加者有 '+runs.length+' 份本机记录。换人后，这些记录不会显示在新编号下，请先下载完整备份。已经上传的记录会保留。':uncertain?'这份记录还没有确认上传成功。建议先下载备份，再更换编号。':'会清除这台浏览器上的当前编号。已经上传的记录会保留，下一位参加者需要重新阅读说明。';
    showModal('换一个人参加',message,[
      {label:'取消',action:()=>{}},
      ...((uncertain||runs.length)?[{label:'先下载完整备份',action:downloadBackup,keep:true}]:[]),
      {label:'换一个人',primary:true,action:()=>{try{data.clearSession();completed.clear();consentDraft=false;go('consent');}catch(err){toast(err.message);}}}
    ]);
  }
  function showModal(title, text, actions) {
    const returnFocus=document.activeElement; const backdrop=document.createElement('div'); backdrop.className='modal-backdrop';
    backdrop.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">'+escape(title)+'</h2><p>'+escape(text)+'</p><div class="form-actions">'+actions.map((a,i)=>'<button class="button '+(a.primary?'primary':'')+'" data-modal-action="'+i+'">'+escape(a.label)+'</button>').join('')+'</div></section>';
    function close(){backdrop.remove();if(returnFocus&&returnFocus.isConnected)returnFocus.focus();}
    backdrop.addEventListener('click',e=>{const b=e.target.closest('[data-modal-action]');if(b){const action=actions[Number(b.dataset.modalAction)];if(!action.keep)close();action.action();}});
    backdrop.addEventListener('keydown',e=>{if(e.key==='Escape'){close();}if(e.key==='Tab'){const bs=backdrop.querySelectorAll('button');if(e.shiftKey&&document.activeElement===bs[0]){e.preventDefault();bs[bs.length-1].focus();}else if(!e.shiftKey&&document.activeElement===bs[bs.length-1]){e.preventDefault();bs[0].focus();}}});
    document.body.append(backdrop);backdrop.querySelector('button').focus();
  }
  function showSavedRuns() {
    const runs=data.getPilotResults?.()||[];if(!runs.length)return;
    const section=document.createElement('section');section.className='paper-panel saved-runs';
    section.innerHTML='<h2>这台电脑上的参与记录</h2><p class="muted">只显示当前编号的记录。中途退出的任务也会保留，但不计入完整任务。</p><div class="saved-run-list">'+runs.slice().reverse().map(r=>'<div class="saved-run"><span>'+escape(runTitle(r))+' · '+escape(new Date(r.createdAt).toLocaleString('zh-CN'))+' · '+(r.status==='complete'?'已完成':'未完成')+'</span><button class="button small" data-run="'+escape(r.runId)+'">查看记录</button></div>').join('')+'</div>';
    main.append(section);section.querySelectorAll('[data-run]').forEach(b=>b.addEventListener('click',()=>showSavedResult(runs.find(r=>r.runId===b.dataset.run))));
  }
  function resultTable(result) {
    if(isJuice(result)) {
      const names={separated:'分开显示',integrated:'共框显示',task_matched:'按任务提示'};
      const rows=(result.summary||[]).map(row=>'<tr><td>'+escape(names[row.condition]||row.condition)+'</td><td>'+escape(row.task==='focused'?'只看甜度':'比较甜酸')+'</td><td>'+row.correct+' / '+row.trials+'</td><td>'+row.timeouts+'</td><td>'+(row.meanRtMs==null?'—':Math.round(row.meanRtMs)+' ms')+'</td></tr>').join('');
      return '<div class="table-wrap"><table class="result-table"><thead><tr><th>显示方式</th><th>问题</th><th>答对</th><th>超时</th><th>答对时的平均反应</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
    }
    const names={baseline:'普通界面',frequency_cue:'频率提示（旧版）',value_cue:'价值提示'};
    const rows=(result.summary||[]).map(row=>'<tr><td>'+escape(names[row.condition]||row.condition)+'</td><td>'+row.hits+' / '+row.trials+'</td><td>'+(row.misses??'—')+'</td><td>'+(row.meanRtMs==null?'—':Math.round(row.meanRtMs)+' ms')+'</td><td>'+row.falseAlarms+'</td><td>'+(row.weightedMissLoss??'—')+'</td></tr>').join('');
    return '<div class="table-wrap"><table class="result-table"><thead><tr><th>界面</th><th>及时取出</th><th>漏取</th><th>平均反应</th><th>误按</th><th>漏单损失</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }
  function downloadExperiment(result) {downloadJSON(result,'注意厨房_'+(isJuice(result)?'果汁':'烤箱')+'_'+result.participantId+'_'+result.runId.slice(0,8)+'.json');}
  function resultContent(result,{heatmap=true}={}) {
    const complete=result.status==='complete';
    return '<h2>'+escape(runTitle(result))+' · '+(complete?'已完成':'已中断')+'</h2>'+(result.simulation?'<p class="notice">这是自动验收生成的模拟记录，不是真人数据。</p>':'')+'<p>'+(complete?'下面是这次的操作记录。它用来比较界面设计，不评价你的注意力水平。':'任务中途结束，已完成的部分会保留。重新开始会创建一份新记录。')+'</p>'+resultTable(result)+(!isJuice(result)&&heatmap?'<div data-heatmap></div>':'')+'<div class="form-actions"><button class="button yellow small" data-download-run>下载完整备份</button>'+(complete?'<button class="button small" data-upload-run>'+ (isFormal?'重试保存':'上传这份先导记录') +'</button>':'')+'</div><p data-save-state class="field-hint" role="status"></p>';
  }
  const attemptedUploads=new Set();
  async function uploadResult(result,manual=false) {
    if(result.status!=='complete'||result.collectionMode!==mode)return;
    if(!manual&&(!isFormal||attemptedUploads.has(result.runId)))return;
    attemptedUploads.add(result.runId);
    const paint=(receipt,busy=false)=>{
      document.querySelectorAll('[data-save-run="'+result.runId+'"]').forEach(el=>{
        const storage=data.getStorageStatus();
        el.textContent=(busy?'正在上传并核对完整记录，请稍等……':receipt?.message||'记录已保存在本机。')+(!storage.available?' 浏览器无法保存本机备份，热图坐标仍只在当前页面内存中。请立即下载完整备份，不要刷新或关闭页面。':'');
        const btn=el.parentElement.querySelector('[data-upload-run]');
        if(btn){btn.disabled=busy||Boolean(receipt?.confirmed);btn.hidden=isFormal&&(busy||Boolean(receipt?.confirmed));btn.textContent=receipt?.confirmed?'已核验保存':receipt?.status==='uncertain'?'重新核对保存状态':isFormal?'重试保存':'上传这份先导记录';}
      });
    };
    paint(null,true);
    try{const receipt=await data.submitPilotResult(result.runId);paint(receipt);}
    catch(err){paint({message:'暂时无法确认保存结果。'+err.message+' 请重试，或下载完整备份交给邀请你的人。'});}
  }
  function bindResult(result,host) {
    host.querySelector('[data-download-run]').addEventListener('click',()=>downloadExperiment(result));
    const heat=host.querySelector('[data-heatmap]');if(heat&&window.AttentionHeatmap)window.AttentionHeatmap.mount(heat,result);
    const state=host.querySelector('[data-save-state]');state.dataset.saveRun=result.runId;
    const stored=data.getStorageStatus();const savedState=data.getPilotUploadState?.(result.runId);
    state.textContent=!stored.available?'浏览器暂时无法保存，请立即下载完整备份，不要刷新或关闭页面。':savedState?.message||(result.status==='complete'?(isFormal?'正在准备自动保存……':'已保存在本机。先导记录不会计入正式样本。'):'未完成的记录只保存在本机，不会自动上传。');
    const button=host.querySelector('[data-upload-run]');if(!button)return;
    if(savedState?.confirmed){button.textContent='已核验保存';button.disabled=true;button.hidden=isFormal;}
    button.addEventListener('click',()=>uploadResult(result,true));
    uploadResult(result);
  }
  function recoverUploads() {
    if(!isFormal||!hasConsent())return;
    for(const result of data.getPilotResults())if(result.status==='complete')uploadResult(result);
  }
  function showSavedResult(result) {
    if(!result)return;
    main.innerHTML='<a class="back-link" href="#ready" id="back-results">返回准备页面</a><section class="paper-panel result-section">'+resultContent(result)+'</section>';
    on('back-results','click',e=>{e.preventDefault();ready();});bindResult(result,main);main.focus();
  }
  function combinedResults() {
    if(!hasConsent()){go('consent');return;}loadFlow();
    const runs=data.getPilotResults();const selected=['bakeryRunId','juiceRunId'].map(k=>runs.find(r=>r.runId===flow?.[k]&&r.bundleId===flow?.id)).filter(Boolean);
    const elapsed=flow?.finishedAt?Math.round((Date.parse(flow.finishedAt)-Date.parse(flow.startedAt))/1000):null;
    main.innerHTML='<a class="back-link" href="#ready">返回准备页面</a><div class="page-head"><div><h1>'+(selected.length===2?'两个游戏都完成了':'本次参与记录')+'</h1><p>看看不同界面下的操作，再看看烤箱任务中的视线分布。</p>'+(elapsed!==null?'<p class="field-hint">本次从开始准备到结束共 '+Math.floor(elapsed/60)+' 分 '+elapsed%60+' 秒，包含等待、练习和休息。'+(selected.some(r=>r.simulation)?'自动验收使用模拟时钟，此用时不代表真人时长。':'')+'</p>':'')+'</div></div><div class="form-actions"><button class="button yellow" id="download-all">下载两项实验的本机备份</button></div>'+(selected.length?'':'<section class="paper-panel"><p>还没有本次完整任务的结果。可以在准备页面查看以前的记录，或开始任务。</p></section>')+selected.map((r,i)=>'<section class="paper-panel result-section" data-result-index="'+i+'">'+resultContent(r)+'</section>').join('')+(selected.length===1?'<div class="form-actions"><a class="button primary" href="#'+(isJuice(selected[0])?'bakery':'juice')+'">继续另一个游戏</a></div>':'')+'<section class="paper-panel"><h2>大家的结果</h2><p>群体结果将在收数结束后公布。</p></section><p class="stage-note">热图只显示烤箱任务；果汁使用正确率和反应时间比较。</p>';
    selected.forEach((r,i)=>bindResult(r,main.querySelector('[data-result-index="'+i+'"]')));on('download-all','click',downloadBackup);
  }
  function bakeryIntro() {
    if(!hasConsent()){go('consent');return;}loadFlow();
    if(isFormal&&flow?.bakeryRunId){combinedResults();return;}
    main.innerHTML='<a class="back-link" href="#ready">返回准备页面</a><div class="experiment-head"><div><span class="experiment-kicker">游戏 1 / 2 · 饼干别烤焦</span><h1>看好饼干，别让它烤焦</h1><p>四台烤箱会陆续出炉。看见“出炉了”，就按对应的数字键取出来。</p></div><aside><strong>任务约 3 分钟</strong><span>另加一次摄像头校准</span></aside></div><div class="form-layout"><section class="paper-panel prose"><h2>记住这三件事就好</h2><ol><li><strong>四台烤箱都要照看。</strong>有的常出炉，有的出炉少；可能同时有两盘需要取出。</li><li><strong>漏单的损失不同。</strong>每台烤箱都写着漏掉一盘扣 1 分还是 5 分。及时取出每盘得 1 分，误按扣 1 分。</li><li><strong>一共两段，每段 85 秒。</strong>一段没有提示边框，另一段会圈出漏单损失大的烤箱。位置和操作规则不变。</li></ol><p>先用 18 秒练习数字键 1–4。正式任务中不显示即时得分，完成后再一起看结果。</p><div class="notice">请保持窗口大小和坐姿不变。切换标签或改变窗口大小会结束这一轮，并保留已完成的记录。</div><div class="form-actions"><button class="button primary" id="launch-gaze">校准摄像头，开始任务</button><button class="text-button" id="launch-behavior">不开摄像头，继续操作部分</button></div><p class="field-hint">不开摄像头仍会保存操作记录，但不会生成热图，也不算眼动样本。</p></section><aside class="help-aside"><img src="assets/logo.svg" alt=""><h3>一次校准就够了</h3><p>顺利时约 1–2 分钟。看着圆点点击，再跟着星星看，不必着急。</p><p>烤箱结束会关闭摄像头，接着玩果汁。两个游戏和一次校准合计约 9 分钟。</p></aside></div>';
    on('launch-gaze','click',()=>launchLab('bakery',true));on('launch-behavior','click',()=>launchLab('bakery',false));
  }
  function juiceIntro() {
    if(!hasConsent()){go('consent');return;}loadFlow();
    if(isFormal&&flow?.juiceRunId){combinedResults();return;}
    if(isFormal&&!flow?.bakeryRunId){go('bakery');return;}
    main.innerHTML='<a class="back-link" href="#ready">返回准备页面</a><div class="experiment-head"><div><span class="experiment-kicker">游戏 2 / 2 · 果汁调配师</span><h1>这杯果汁，读数对不对？</h1><p>先看问题，再看甜度和酸度。符合问题按 F，不符合按 J。</p></div><aside><strong>不超过 4 分钟</strong><span>含练习 · 不使用摄像头</span></aside></div><div class="form-layout"><section class="paper-panel prose"><h2>只会问你两种问题</h2><ol><li><strong>“甜度达到 6 了吗？”</strong>只看甜度，6 或更高选“是”，小于 6 选“不是”。</li><li><strong>“甜度比酸度高吗？”</strong>比较两个读数，甜度更高选“是”，相同或更低选“不是”。</li></ol><p>一共三段，每段 20 杯。仪表可能分开摆、放在同一个框里，或按问题加上提示。每杯最多看 3 秒，按下答案就进入下一杯。</p><p>先练 4 杯，会告诉你哪里答错了。正式任务中不提示对错，尽量看准后快一点回答。</p>'+(!flow?.bakeryRunId?'<p class="notice">请先完成烤箱任务，再来调果汁。</p>':'<p class="notice">烤箱记录已保留，摄像头已关闭。完成果汁后即可一起看结果。</p>')+'<div class="form-actions"><button class="button primary" id="launch-juice">开始果汁练习</button>'+(!flow?.bakeryRunId?'<a href="#bakery">先完成烤箱实验</a>':'')+'</div></section><aside class="help-aside"><img src="assets/logo.svg" alt=""><h3>左手 F，右手 J</h3><p>F 是“是”，J 是“不是”。也可以直接点击画面上的答案。</p><p>如果来不及回答，留空就好，下一杯会自动出现。超时也会如实记录。</p></aside></div>';
    on('launch-juice','click',()=>launchLab('juice',false));
  }
  function closeLab(reason='user_exit') {
    if(!lab)return;const old=lab;lab=null;
    old.cleanupGeometry?.();
    if(controller){controller.abort?.(reason);controller.destroy();controller=null;}
    if(gazeController){gazeController.destroy();gazeController=null;}
    old.element.remove();document.body.style.overflow=old.overflow;if(old.htmlOverflow!==undefined)document.documentElement.style.overflow=old.htmlOverflow;
    window.removeEventListener('resize',old.onResize);window.removeEventListener('scroll',old.onScroll);
  }
  function launchLab(type,withGaze=false,retry=false) {
    if(!hasConsent()){go('consent');return;}
    if(innerWidth<1000||innerHeight<650){toast('游戏需要至少 1000 × 650 的窗口。请用电脑放大浏览器后再开始。');return;}
    if(isFormal&&!config.recruitmentOpen){recruitmentNotice();return;}
    loadFlow();if(isFormal&&type==='juice'&&!flow?.bakeryRunId){go('bakery');return;}
    if(isFormal&&flow?.[type+'RunId']){combinedResults();return;}
    closeLab();beginFlow(type);const isBakery=type==='bakery';
    const engine=isBakery?window.AttentionSEEV:window.AttentionPCP;
    if(!engine){toast('游戏文件还没有加载好，请刷新页面再试。');return;}
    const element=document.createElement('section');element.className='lab-stage';element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');element.setAttribute('aria-label',games[type].title);
    element.innerHTML='<header class="lab-top"><a class="lab-brand" href="#home"><img src="assets/logo.svg" alt="">注意厨房</a><span id="lab-status">'+(isBakery?'游戏 1 / 2 · 饼干别烤焦':'游戏 2 / 2 · 果汁调配师')+'</span><button class="text-button" id="exit-lab">退出本次参与</button></header><div class="lab-playfield"><canvas id="lab-canvas" width="1200" height="640" tabindex="0" aria-label="'+games[type].title+'。'+games[type].control+'。"></canvas><div class="lab-gate" id="lab-gate" hidden></div></div><footer class="lab-controls"><p id="lab-message" role="status">先熟悉操作，再开始任务。</p><button class="button primary small" id="lab-next" disabled>准备中</button><button class="text-button" id="practice-again" hidden>再练一次</button></footer><div id="lab-gaze-holder"></div><section class="lab-results paper-panel" id="lab-results" hidden></section>';
    // Lock both scroll containers before measuring. Otherwise opening the gaze
    // iframe can remove a classic scrollbar and move the already measured AOIs.
    const overflow=document.body.style.overflow,htmlOverflow=withGaze?document.documentElement.style.overflow:undefined;
    if(withGaze)document.documentElement.style.overflow='hidden';
    document.body.style.overflow='hidden';document.body.append(element);
    lab={element,overflow,htmlOverflow,withGaze,ready:false,type,onResize:null,onScroll:null};
    const canvas=element.querySelector('canvas');const field=element.querySelector('.lab-playfield');
    const available=field.getBoundingClientRect();
    // The bakery uses the available playfield, without the old decorative inset.
    // Keep CSS pixels and the 1200×640 task coordinates tied to this same rectangle.
    const width=Math.floor(isBakery?Math.min(available.width-8,(available.height-24)*1200/640):Math.min(available.width,available.height*1200/640)*.9);
    canvas.style.width=width+'px';canvas.style.height=(width*640/1200)+'px';
    const initialViewport={width:innerWidth,height:innerHeight};const rect=canvas.getBoundingClientRect();
    const regions=isBakery?window.AttentionSEEV.ovens.map((r,i)=>({id:'oven_'+i,name:(i+1)+' 号烤箱',x0:(rect.left+r.x/1200*rect.width)/innerWidth,x1:(rect.left+(r.x+r.w)/1200*rect.width)/innerWidth,y0:(rect.top+r.y/640*rect.height)/innerHeight,y1:(rect.top+(r.y+r.h)/640*rect.height)/innerHeight})):null;
    const geometryTolerance=1;
    function readGeometry(){
      const r=canvas.getBoundingClientRect(),v=window.visualViewport;
      return {canvas:{left:r.left,top:r.top,width:r.width,height:r.height},width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
        visual:v?{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,scale:v.scale}:null};
    }
    const calibrationGeometry=withGaze?readGeometry():null;
    let geometryObserver=null,geometryTimer=null,geometryStopped=false,gazeGeometryRequired=withGaze;
    function near(a,b,tolerance=geometryTolerance){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance;}
    function geometryMatches(){
      const current=readGeometry(),expected=calibrationGeometry;
      if(!expected||!near(current.width,expected.width)||!near(current.height,expected.height)||!near(current.dpr,expected.dpr,.001))return false;
      if(!['left','top','width','height'].every(key=>near(current.canvas[key],expected.canvas[key])))return false;
      if(Boolean(current.visual)!==Boolean(expected.visual))return false;
      return !current.visual||(['width','height','offsetLeft','offsetTop'].every(key=>near(current.visual[key],expected.visual[key]))&&near(current.visual.scale,expected.visual.scale,.001));
    }
    function cleanupGeometry(){
      geometryStopped=true;clearInterval(geometryTimer);geometryTimer=null;geometryObserver?.disconnect();geometryObserver=null;
      window.visualViewport?.removeEventListener('resize',checkGazeGeometry);window.visualViewport?.removeEventListener('scroll',checkGazeGeometry);
    }
    function checkGazeGeometry(){
      if(!gazeGeometryRequired)return true;
      if(geometryStopped||!lab||lab.element!==element)return false;
      if(geometryMatches())return true;
      stopWithReason('display_geometry_changed','显示位置改变了，这次校准已停止。请返回后重新校准，并保持窗口大小和显示比例不变。');return false;
    }
    function reportMatchesGeometry(report){
      const viewport=report?.viewport,reported=report?.regions;
      if(!viewport||!near(viewport.width,calibrationGeometry.width)||!near(viewport.height,calibrationGeometry.height)||!near(viewport.devicePixelRatio,calibrationGeometry.dpr,.001)||!Array.isArray(reported)||reported.length!==regions.length)return false;
      if(new Set(reported.map(r=>r?.id)).size!==regions.length)return false;
      return regions.every(expected=>{
        const actual=reported.find(r=>r?.id===expected.id);if(!actual)return false;
        return ['x0','x1','y0','y1'].every(key=>Number.isFinite(actual[key])&&near(actual[key]*(key[0]==='x'?calibrationGeometry.width:calibrationGeometry.height),expected[key]*(key[0]==='x'?calibrationGeometry.width:calibrationGeometry.height)));
      });
    }
    const backToIntro=()=>isBakery?bakeryIntro():juiceIntro();
    function stopWithReason(reason,message){
      if(!lab||lab.element!==element)return;
      lab.cleanupGeometry?.();
      if(controller?.getState().phase!=='aborted')controller?.abort?.(reason);
      gazeController?.destroy();gazeController=null;
      const gate=element.querySelector('#lab-gate');gate.hidden=false;
      gate.innerHTML='<div><h2>这一轮已结束</h2><p>'+escape(message)+'</p><p>已完成的部分会保留。请返回后重新开始。</p><button class="button yellow" id="return-from-abort">返回说明</button></div>';
      element.querySelector('#lab-next').disabled=true;element.querySelector('#return-from-abort').onclick=()=>{closeLab(reason);backToIntro();};
    }
    lab.onResize=()=>{if(controller?.getState().phase==='complete')return;if(gazeGeometryRequired){checkGazeGeometry();return;}if(innerWidth!==initialViewport.width||innerHeight!==initialViewport.height)stopWithReason('viewport_changed','窗口大小改变了，原来的显示位置已经不同。');};
    lab.onScroll=()=>{};window.addEventListener('resize',lab.onResize);window.addEventListener('scroll',lab.onScroll);
    if(withGaze){
      lab.cleanupGeometry=cleanupGeometry;
      if(typeof ResizeObserver==='function'){geometryObserver=new ResizeObserver(checkGazeGeometry);geometryObserver.observe(canvas);geometryObserver.observe(field);}
      // Transforms do not trigger ResizeObserver. Check them during calibration
      // as well as tracking; the initial AOIs must remain valid throughout.
      geometryTimer=setInterval(checkGazeGeometry,200);
      window.visualViewport?.addEventListener('resize',checkGazeGeometry);window.visualViewport?.addEventListener('scroll',checkGazeGeometry);
    }
    element.querySelector('#exit-lab').onclick=()=>{closeLab('user_exit');backToIntro();};
    function mountExperiment(report){
      if(!lab||lab.element!==element)return;
      if(!report?.quality?.passed){gazeGeometryRequired=false;cleanupGeometry();}
      lab.ready=true;lab.report=report;element.querySelector('#lab-gate').hidden=true;
      element.querySelector('#lab-status').textContent=(isBakery?'游戏 1 / 2 · ':'游戏 2 / 2 · ')+(report?.quality?.passed?'眼动记录已开启':isBakery?'仅记录操作':'果汁调配师');
      controller=engine.mount(canvas,protocol.getEngineOptions(mode,{
        participantId:session().participantId,gazeReport:report,
        onState:state=>{
          if(!lab||lab.element!==element)return;
          element.querySelector('#lab-message').textContent=state.message||'请看清问题后作答。';
          const next=element.querySelector('#lab-next');const labels={intro:'开始练习',practice_complete:'进入任务',block_intro:'开始这一段',break:'继续下一段',complete:'任务完成',aborted:'本轮已结束'};
          next.textContent=labels[state.phase]||'任务进行中';next.disabled=!labels[state.phase]||['complete','aborted'].includes(state.phase);
          element.querySelector('#practice-again').hidden=state.phase!=='practice_complete';
          if(state.phase==='aborted'&&element.querySelector('#lab-gate').hidden)stopWithReason('interrupted','任务被中断，不能继续计入同一轮记录。');
        },
        onCheckpoint:result=>{try{saveRun(result);}catch(err){toast('暂时无法保存本机记录，请在结束后下载备份。');}},
        onComplete:result=>{
          if(!lab||lab.element!==element)return;
          lab.cleanupGeometry?.();
          gazeController?.destroy();gazeController=null;let stored;
          try{stored=saveRun(result);}catch(err){stored={saved:false,result};toast(err.message);}
          completed.add(type);finishFlowRun(type,stored.result);controller?.destroy();canvas.tabIndex=-1;
          const bothDone=Boolean(flow?.bakeryRunId&&flow?.juiceRunId);
          element.querySelector('#lab-status').textContent='这一项完成了'+(isBakery?' · 摄像头已关闭':'');
          const panel=element.querySelector('#lab-results');panel.hidden=false;
          // The full heatmap appears with both games on the final result page.
          panel.innerHTML='<div class="finish-next"><h2>'+(bothDone?'两个游戏都完成了':isBakery?'饼干任务完成了，来调果汁吧':'果汁任务完成了')+'</h2><p>'+(bothDone?'现在可以查看两项操作结果和烤箱视线热图。':isBakery?'接下来不使用摄像头。先练 4 杯，再完成三段短任务。':'可以先查看本项结果，或继续烤箱实验。')+'</p><button class="button primary" id="continue-flow">'+(isBakery&&!bothDone?'继续果汁实验':'查看结果与热图')+'</button><p class="field-hint" role="status" data-save-run="'+stored.result.runId+'">'+(isFormal?'正在保存本项记录……':'先导记录已留在本机，可展开下载或上传。')+'</p></div><details class="current-result"><summary>查看这一项的记录与备份</summary><div id="current-result-body">'+resultContent(stored.result,{heatmap:false})+'</div></details>';
          bindResult(stored.result,panel.querySelector('#current-result-body'));
          if(!stored.saved)panel.querySelector('[data-save-state]').textContent='浏览器无法保存这份结果，请立即下载完整备份。';
          panel.querySelector('#continue-flow').onclick=()=>{closeLab();go(isBakery&&!bothDone?'juice':'results');};panel.scrollTop=0;panel.querySelector('#continue-flow').focus({preventScroll:true});
        }
      }));
      element.querySelector('#lab-next').onclick=()=>{if(withGaze&&!checkGazeGeometry())return;controller?.start();canvas.focus({preventScroll:true});};
      element.querySelector('#practice-again').onclick=()=>{if(withGaze&&!checkGazeGeometry())return;controller?.repeatPractice();canvas.focus({preventScroll:true});};
      canvas.focus({preventScroll:true});
    }
    if(!withGaze){mountExperiment({type:'behavior_only',quality:{passed:false,reason:'camera_not_enabled'},viewport:initialViewport});return;}
    gazeController=window.AttentionGaze.mount(element.querySelector('#lab-gaze-holder'),{
      keepTracking:true,regions,
      onSample:sample=>{if(lab?.ready&&checkGazeGeometry())controller?.recordGazeViewport(sample);},
      onReady:report=>{
        if(!lab||lab.element!==element)return;
        if(!checkGazeGeometry())return;
        if(!reportMatchesGeometry(report)){stopWithReason('display_geometry_changed','显示位置与这次校准记录不一致，这次校准已停止。请返回后重新校准。');return;}
        if(report.quality?.passed){mountExperiment(report);return;}
        gazeController?.destroy();gazeController=null;
        const gate=element.querySelector('#lab-gate');gate.hidden=false;
        const diagnostic=window.AttentionGaze.describeValidation(report);
        const rows=diagnostic.rows.map(row=>'<tr><th scope="row">'+escape(row.name)+'</th><td>'+escape(row.areaAccuracyText)+'</td><td>'+escape(row.coverageText)+'</td><td>'+escape(row.failureLabel)+'</td></tr>').join('');
        gate.innerHTML='<div class="gaze-check-result"><h2>这次眼动检查还没有通过</h2><p>'+escape(diagnostic.summary)+'</p><p>可以重新校准，或只完成操作部分。未通过的眼动记录不会用于热图和分析。</p><div class="form-actions"><button class="button primary" id="recalibrate">重新校准</button><button class="button" id="behavior-after-gaze">只完成操作部分</button></div><details class="gaze-check-details"><summary>查看四个区域的检查结果</summary><div class="table-wrap"><table class="result-table"><thead><tr><th scope="col">区域</th><th scope="col">命中率</th><th scope="col">采样覆盖率</th><th scope="col">检查结果</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="field-hint">命中率：看着星星时，视线估计落在对应框里的比例。采样覆盖率：检查时段里有有效记录的比例。每个区域的两项都需达到 60%。</p><button class="text-button" id="download-gaze-check">下载本次检查记录</button></details></div>';
        gate.querySelector('#download-gaze-check').onclick=()=>downloadJSON({recordKind:'calibration_diagnostic',isExperimentalResult:false,protocolVersion:config.protocolVersion,layoutId:window.AttentionSEEV.layout?.id||'bakery-spread-v2',report},'注意厨房_眼动检查_'+Date.now()+'.json');
        element.querySelector('#recalibrate').onclick=()=>launchLab('bakery',true,true);
        element.querySelector('#behavior-after-gaze').onclick=()=>mountExperiment({...report,quality:{...report.quality,passed:false},behaviorOnly:true});
      },
      onError:(err,state)=>{
        if((state?.errorCode||err?.code)==='display_geometry_changed'){stopWithReason('display_geometry_changed','显示位置改变了，这次校准已停止。请返回后重新校准，并保持窗口大小和显示比例不变。');return;}
        if(lab?.ready){stopWithReason('gaze_lost',state?.error||err?.message||'眼动记录中断了，请调整设备后重新开始。');return;}
        if(lab?.element!==element)return;
        const gate=element.querySelector('#lab-gate');gate.hidden=false;
        gate.innerHTML='<div><h2>摄像头没有开启</h2><p>'+escape(state?.error||err?.message||'请检查浏览器的摄像头权限。')+'</p><div class="form-actions"><button class="button primary" id="retry-camera">重新尝试</button><button class="button" id="camera-declined">不开摄像头，继续操作</button></div></div>';
        element.querySelector('#retry-camera').onclick=()=>launchLab('bakery',true,true);
        element.querySelector('#camera-declined').onclick=()=>{gazeController?.destroy();gazeController=null;mountExperiment({type:'behavior_only',quality:{passed:false,reason:'camera_unavailable'},viewport:initialViewport});};
      },
      onFinish:()=>{if(lab?.element===element){closeLab('calibration_cancelled');bakeryIntro();}}
    });
  }
  function gaze() {
    if(!hasConsent()){go('consent');return;}
    main.innerHTML='<a class="back-link" href="#ready">返回游戏选择</a><div class="page-head"><div><h1>检查眼动设备</h1><p>烤箱实验会在开始前检查实际烤箱位置。这里可以单独熟悉校准步骤，不进入任务。</p></div></div><section class="paper-panel"><p>请用电脑打开，保持脸部光线均匀。摄像头只在你主动开启后使用。</p><button class="button yellow" id="open-device-check">打开设备检查</button></section>';
    on('open-device-check','click',()=>{
      closeLab();const element=document.createElement('section');element.className='device-stage';element.innerHTML='<button class="text-button device-close" id="close-device-check">返回准备页面</button><div id="device-frame"></div>';document.body.append(element);
      lab={element,overflow:document.body.style.overflow,onResize:()=>{},onScroll:()=>{}};document.body.style.overflow='hidden';
      element.querySelector('#close-device-check').onclick=()=>{closeLab();go('ready');};
      gazeController=window.AttentionGaze.mount(element.querySelector('#device-frame'),{onFinish:r=>{if(r)toast('检查结束，结果只留在本机。');else{closeLab();go('ready');}}});
    });
  }
  function about(){
    main.innerHTML='<div class="page-head"><div><h1>怎么玩，记录会用在哪里？</h1><p>工程心理学课程作业 · 匿名参与</p></div></div><article class="paper-panel prose"><h2>一次校准，两个小游戏</h2><ol><li>阅读参与说明，填写或生成匿名编号。</li><li>校准摄像头，先练习，再照看两段烤箱；每段 85 秒。</li><li>摄像头关闭后，完成果汁练习与三段任务；每段 20 杯。</li><li>每项任务完成后保存记录，最后查看两项结果与烤箱眼动热图。</li></ol><p>一次校准顺利时，整套流程约 9 分钟。重新校准、重做练习或自行休息会延长时间。</p><h2>关于数据</h2><p>'+(isFormal?'每项完整任务会自动发送逐次反应、匿名编号、同意信息和眼动区域汇总，并回读核验。':'先导记录由你选择是否上传，始终带有测试标记。')+'视频不录制、不上传；原始视线坐标只留在本机，用于热图和备份。中途退出的任务不会自动上传。</p><details><summary>两个游戏对应什么实验？</summary><p>烤箱参考 Horrey、Wickens 与 Consalus（2006）的 SEEV 视觉分配研究，保留多源监控、频率和价值，比较普通与价值提示界面。厨房场景是机制层面的改编，不是原驾驶实验的逐项复刻。</p><p>果汁参考 Wickens 与 Andre（1990）及 Wickens 与 Carswell（1995）的邻近兼容研究，比较单项判断与双项比较在不同显示下的表现。分开、共框、按任务提示构成三种条件；按任务提示是本项目的待检验改进。原研究不能简化为“靠得近就一定更好”。</p></details><details><summary>热力图能说明什么？</summary><p>它显示烤箱正式任务中有效视线估计的位置分布。两个条件使用相同色标；摄像头检查或任务覆盖不足时不画图。普通摄像头不能精确测量每次注视，热图不能单独证明设计更好，也不用于评价个人能力。果汁游戏不采眼动。</p></details><details><summary>为什么中途切换页面会结束任务？</summary><p>后台页面可能暂停绘制，窗口变化会改变眼动坐标。中断时保存已完成部分，重新开始会创建新记录。</p></details><h2>参考文献</h2><p><a href="https://doi.org/10.1037/1076-898X.12.2.67" target="_blank" rel="noopener">Horrey 等（2006）：视觉注意分配</a><br><a href="https://doi.org/10.1177/001872089003200105" target="_blank" rel="noopener">Wickens 与 Andre（1990）：显示与信息整合</a><br><a href="https://doi.org/10.1518/001872095779049408" target="_blank" rel="noopener">Wickens 与 Carswell（1995）：邻近兼容原则</a></p><a class="button primary" href="#'+(hasConsent()?'ready':'consent')+'">开始参与</a></article>';
  }
  function analysis(){
    if(!window.AttentionAnalysis){
      main.innerHTML=`<section class="paper-panel"><h1>研究结果暂时无法显示</h1><p>请刷新页面后重试。</p></section>`;
      return;
    }
    main.innerHTML=window.AttentionAnalysis.render();
  }
  function render(){
    closeLab('navigation');if(controller){controller.destroy();controller=null;}if(gazeController){gazeController.destroy();gazeController=null;}
    const routes=['home','consent','entry','ready','bakery','juice','gaze','about','results','analysis'];
    const requested=location.hash.slice(1)||'home';currentRoute=routes.includes(requested)?requested:'home';
    document.body.dataset.route=currentRoute;
    document.title=currentRoute==='analysis'?'研究结果 — 注意厨房':(games[currentRoute]?games[currentRoute].title:'注意厨房')+' — 来玩两个小游戏';
    document.querySelectorAll('[data-nav]').forEach(a=>{if(a.dataset.nav===currentRoute)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(isFormal&&!config.recruitmentOpen&&!['home','about','results','analysis'].includes(currentRoute)){recruitmentNotice();main.focus();return;}
    if(currentRoute==='home')home();else if(currentRoute==='consent')consent();else if(currentRoute==='entry')entry();else if(currentRoute==='ready')ready();else if(currentRoute==='bakery')bakeryIntro();else if(currentRoute==='juice')juiceIntro();else if(currentRoute==='gaze')gaze();else if(currentRoute==='results')combinedResults();else if(currentRoute==='analysis')analysis();else about();
    if(currentRoute==='home')showPreviousProtocolBackup(main);
    recoverUploads();window.scrollTo(0,0);main.focus({preventScroll:true});
  }
  document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();main.focus();main.scrollIntoView();});
  window.addEventListener('hashchange',render);
  window.addEventListener('beforeunload',()=>{controller?.abort?.('page_unload');if(gazeController)gazeController.destroy();});
  window.render_game_to_text=()=>JSON.stringify(controller?controller.getState():{route:currentRoute,collectionMode:mode,recruitmentOpen:config.recruitmentOpen,gaze:gazeController?gazeController.getState():null,sessionStatus:session()?session().status:null});
  window.advanceTime=ms=>{if(controller)controller.advanceTime(ms);};
  render();
})();
