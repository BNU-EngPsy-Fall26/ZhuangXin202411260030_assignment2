/* Self-hosted WebGazer in a disposable, same-origin iframe. Calibration and live
 * samples use the same full viewport. No video, face image or mouse trace leaves it. */
(function () {
  'use strict';
  const script = typeof document !== 'undefined' ? document.currentScript : null;
  const base = script ? new URL('../', script.src).href : '';
  const LAYOUT_VERSION = 'gaze-spread-20261108';
  const REGIONS = [
    { id: 'top_left', name: '左上', x0: .05, x1: .47, y0: .10, y1: .45 },
    { id: 'top_right', name: '右上', x0: .53, x1: .95, y0: .10, y1: .45 },
    { id: 'bottom_left', name: '左下', x0: .05, x1: .47, y0: .55, y1: .90 },
    { id: 'bottom_right', name: '右下', x0: .53, x1: .95, y0: .55, y1: .90 }
  ];
  const QUALITY = Object.freeze({ minAreaAccuracy: .6, minCoverage: .6, faceFreshMs: 600, faceLostMs: 2000, predictionLostMs: 2500 });
  function validateRegions(regions = REGIONS) {
    if (!Array.isArray(regions) || regions.length !== 4) throw new Error('眼动检查需要四个观察区域。');
    const ids = new Set();
    const clean = regions.map(r => {
      if (!r || typeof r.id !== 'string' || !r.id || ids.has(r.id) || ![r.x0,r.x1,r.y0,r.y1].every(Number.isFinite) || r.x0 < 0 || r.y0 < 0 || r.x1 > 1 || r.y1 > 1 || r.x0 >= r.x1 || r.y0 >= r.y1) throw new Error('观察区域必须有不同编号，并使用 0–1 之间的有效坐标。');
      ids.add(r.id); return { id: r.id, name: typeof r.name === 'string' ? r.name : r.id, x0:r.x0, x1:r.x1, y0:r.y0, y1:r.y1 };
    });
    for (let i = 0; i < clean.length; i++) for (let j = i + 1; j < clean.length; j++) {
      const a=clean[i], b=clean[j];
      if (Math.max(a.x0,b.x0) < Math.min(a.x1,b.x1) && Math.max(a.y0,b.y0) < Math.min(a.y1,b.y1)) throw new Error('眼动观察区域不能互相重叠。');
    }
    return clean;
  }
  function classify(x, y, regions = REGIONS) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const a = regions.find(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
    return a ? a.id : null;
  }
  function validPrediction(s) { return s.valid !== false && s.faceFresh !== false && Number.isFinite(s.x) && Number.isFinite(s.y) && s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1; }
  function summarize(samples, target, startMs, endMs, binMs = 200, regions = REGIONS) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || !Number.isFinite(binMs) || binMs <= 0) throw new Error('眼动统计时间窗无效。');
    const rows = samples.filter(s => Number.isFinite(s.t) && s.t >= startMs && s.t < endMs);
    const valid = rows.filter(validPrediction);
    const bins = new Set(valid.map(s => Math.floor((s.t - startMs) / binMs)));
    const hits = valid.filter(s => classify(s.x, s.y, regions) === target).length;
    const region = regions.find(r => r.id === target);
    // Diagnostic only: predicted gaze minus the independent target centre, in
    // viewport fractions. Never feed validation samples back into training.
    const meanOffset = valid.length && region ? {
      x:valid.reduce((sum,s)=>sum+s.x,0)/valid.length-(region.x0+region.x1)/2,
      y:valid.reduce((sum,s)=>sum+s.y,0)/valid.length-(region.y0+region.y1)/2,
      unit:'viewport_fraction', sampleCount:valid.length
    } : null;
    return { target, startMs, endMs, callbacks: rows.length, validSamples: valid.length, correctSamples: hits,
      areaAccuracy: valid.length ? hits / valid.length : null, coverage: bins.size / Math.ceil((endMs - startMs) / binMs),
      validSampleRate: valid.length / ((endMs - startMs) / 1000), coverageBinMs: binMs, meanOffset };
  }
  function assessQuality(rows, regions = REGIONS) {
    const failures = [];
    for (const region of regions) {
      const row = rows.find(r => r.target === region.id);
      if (!row || !Number.isFinite(row.areaAccuracy) || row.areaAccuracy < QUALITY.minAreaAccuracy) failures.push({ region: region.id, measure: 'areaAccuracy', value: row?.areaAccuracy ?? null });
      if (!row || !Number.isFinite(row.coverage) || row.coverage < QUALITY.minCoverage) failures.push({ region: region.id, measure: 'coverage', value: row?.coverage ?? null });
    }
    return { passed: failures.length === 0, minAreaAccuracy: QUALITY.minAreaAccuracy, minCoverage: QUALITY.minCoverage,
      basis: 'engineering_pilot_only', scientificPassThreshold: null, failures };
  }
  function describeValidation(report) {
    const thresholds = {areaAccuracy:QUALITY.minAreaAccuracy,coverage:QUALITY.minCoverage};
    const currentLayout = report?.version === 'phase2-3' && report?.layoutVersion === LAYOUT_VERSION;
    const incomplete = {passed:false,canAssess:false,currentLayout,thresholds,rows:[],summary:'这份检查记录不完整，无法判断各区域的眼动估计质量。请重新校准并完成四个区域的检查。'};
    if (!Array.isArray(report?.regions) || !Array.isArray(report?.validation?.rows)) return incomplete;
    let regions;
    try { regions = validateRegions(report.regions); } catch (_) { return incomplete; }
    const proportion = value => Number.isFinite(value) && value >= 0 && value <= 1;
    const pct = (value,threshold) => {
      if (!proportion(value)) return '无法计算';
      const rounded = Math.round(value*1000)/10;
      return value < threshold && rounded >= threshold*100 ? '<'+threshold*100+'%' : rounded+'%';
    };
    const rows = regions.map(region => {
      const matches = report.validation.rows.filter(row=>row?.target===region.id);
      const raw = matches.length === 1 ? matches[0] : null;
      const areaAccuracy = proportion(raw?.areaAccuracy) ? raw.areaAccuracy : null;
      const coverage = proportion(raw?.coverage) ? raw.coverage : null;
      const noSamples = raw?.validSamples === 0 && raw?.areaAccuracy === null && coverage === 0;
      const missing = !raw || coverage === null || (areaAccuracy === null && !noSamples);
      const position = areaAccuracy !== null && areaAccuracy < thresholds.areaAccuracy;
      const sampling = coverage !== null && coverage < thresholds.coverage;
      const failureType = missing ? 'incomplete' : position && sampling ? 'both' : position ? 'position' : sampling ? 'sampling' : 'none';
      const failureLabel = {none:'达到检查门槛',position:'位置估计不准',sampling:'采样不足',both:'位置估计不准、采样不足',incomplete:'记录不完整'}[failureType];
      const details = [];
      if (position) details.push('有效视线估计落在这个区域内的比例不足60%');
      if (sampling) details.push('有有效视线采样的时段不足60%');
      if (noSamples) details.push('没有有效采样，无法判断位置是否估计准确');
      if (missing) details.push('缺少可用的检查指标，不能判定通过');
      if (failureType === 'none') details.push('命中率和采样覆盖率均达到60%');
      return {id:region.id,name:region.name,areaAccuracy,coverage,
        areaAccuracyText:pct(areaAccuracy,thresholds.areaAccuracy),coverageText:pct(coverage,thresholds.coverage),
        failureType,failureLabel,detail:details.join('；')+'。'};
    });
    const canAssess = rows.every(row=>row.failureType!=='incomplete');
    const failed = rows.filter(row=>row.failureType!=='none');
    const passed = canAssess && failed.length === 0;
    const hasPosition = failed.some(row=>row.failureType==='position'||row.failureType==='both');
    const hasSampling = failed.some(row=>row.failureType==='sampling'||row.failureType==='both');
    const resultText = !canAssess ? '部分区域的检查记录不完整，暂时无法判断整体眼动估计质量。' :
      hasPosition && hasSampling ? '这次检查同时发现了位置估计不准和有效采样不足的问题，具体区域见下表。' :
      hasSampling ? '部分区域没有获得足够的有效采样，暂时不能稳定记录眼动。' :
      '这次采样覆盖达到了要求，但部分区域的位置估计还不够准确。';
    const summary = passed ? '四个区域的命中率和采样覆盖率均达到60%。这只是本次设备检查的试行门槛。' :
      resultText+'这反映的是本次设备的视线估计质量，不代表你的注意力水平。';
    // Display diagnostics, not authorization to resume a previous session. The
    // caller must still check the report against the current regions/viewport.
    return {passed,canAssess,currentLayout,thresholds,rows,summary};
  }
  // A valid prediction coordinate must have the same CSS-pixel meaning in the
  // child and its parent. innerWidth alone cannot reveal a transformed iframe.
  function geometryProblem(g, baseline = null) {
    const near = (a,b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= 1;
    if (!g?.parent || !g?.child || !g?.frame) return 'unavailable';
    for (const key of ['parent','child']) {
      const view = g[key], vv = view.visualViewport;
      if (!(view.width > 0 && view.height > 0 && view.devicePixelRatio > 0)) return 'viewport_invalid';
      if (!vv || !Number.isFinite(vv.scale) || Math.abs(vv.scale-1) > .001 || !near(vv.offsetLeft,0) || !near(vv.offsetTop,0) || !near(vv.width,view.width) || !near(vv.height,view.height)) return 'visual_viewport_changed';
      if (baseline && (!near(view.width,baseline[key].width) || !near(view.height,baseline[key].height) || view.devicePixelRatio !== baseline[key].devicePixelRatio)) return 'viewport_changed';
    }
    if (g.frame.transformed || !near(g.frame.left,0) || !near(g.frame.top,0) ||
      !near(g.frame.width,g.parent.width) || !near(g.frame.height,g.parent.height) ||
      !near(g.child.width,g.parent.width) || !near(g.child.height,g.parent.height)) return 'frame_changed';
    return null;
  }

  function mount(container, options = {}) {
    if (!container || !container.appendChild) throw new Error('请提供眼动检查的显示区域。');
    if (options.keepTracking === true && !Array.isArray(options.regions)) throw new Error('游戏眼动需要明确提供四个观察区域，不能使用默认区域。');
    const regions = validateRegions(options.regions);
    const config = { kind: 'attention-gaze-config', regions, keepTracking: options.keepTracking === true };
    let state = { status: 'ready', report: null, cameraActive: false };
    let frame = null, destroyed = false, savedOverflow = null, normalFrameStyle = '', readySent = false, finishSent = false, lastStatus = '', lastError = '';
    function stopFrame() { try { frame?.contentWindow?.AttentionGaze?.stop?.(); } catch (_) {} }
    function restoreScroll() {
      if (savedOverflow !== null) {
        document.documentElement.style.overflow = savedOverflow.html;
        document.body.style.overflow = savedOverflow.body;
        savedOverflow = null;
      }
    }
    function fullFrame(transparent) {
      if (!frame) return;
      if (savedOverflow === null) {
        savedOverflow = { html: document.documentElement.style.overflow, body: document.body.style.overflow };
        document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
      }
      // Identical geometry for calibration, validation and tracking. Do not restore
      // the embedded frame size between validation and the first live sample.
      frame.style.cssText = 'position:fixed;inset:0;width:100vw;height:100dvh;min-height:0;max-width:none;max-height:none;border:0;display:block;border-radius:0;z-index:10000;' + (transparent ? 'opacity:0;pointer-events:none;background:transparent' : 'opacity:1;pointer-events:auto;background:#fffbed');
      frame.setAttribute('aria-hidden', transparent ? 'true' : 'false');
      if (transparent) { frame.tabIndex = -1; frame.contentWindow?.blur?.(); } else frame.removeAttribute('tabindex');
    }
    function restoreFrame() { restoreScroll(); if (frame) { frame.style.cssText = normalFrameStyle; frame.removeAttribute('aria-hidden'); frame.removeAttribute('tabindex'); } }
    function sendConfig() { if (!destroyed && frame) frame.contentWindow?.postMessage(config, location.origin === 'null' ? '*' : location.origin); }
    function receive(event) {
      if (destroyed || !frame || event.source !== frame.contentWindow || (location.origin !== 'null' && event.origin !== location.origin) || event.data?.kind !== 'attention-gaze') return;
      const msg = event.data;
      if (msg.configRequest) sendConfig();
      if (msg.state) {
        state = msg.state;
        if (['loading','positioning','calibrating','validation_ready','validating','tracking'].includes(state.status)) fullFrame(state.status === 'tracking');
        else if (['ready','complete','cancelled','error','skipped'].includes(state.status)) restoreFrame();
        const stamp = state.status + ':' + (state.error || '');
        if (stamp !== lastStatus) { lastStatus = stamp; options.onStatus?.(structuredClone(state)); }
        if (state.status === 'error' && state.error !== lastError) { lastError = state.error; options.onError?.({ code: state.errorCode || 'gaze_error', message: state.error }, structuredClone(state)); }
      }
      if (destroyed) return;
      if (msg.sample && state.status === 'tracking') {
        // WebGazer runs in a different performance time origin. Translate to the
        // parent's monotonic performance.now() domain before synchronizing trials.
        const sample = { ...msg.sample, t: msg.sample.t + msg.timeOrigin - performance.timeOrigin };
        if (Number.isFinite(sample.t)) options.onSample?.(sample);
      }
      if (msg.trackingReady && !readySent) { readySent = true; options.onReady?.(structuredClone(state.report)); }
      if (msg.finished && !finishSent) { finishSent = true; options.onFinish?.(state.status === 'complete' ? structuredClone(state.report) : null); }
      if (msg.restart && !destroyed) createFrame();
    }
    function createFrame() {
      if (frame) { stopFrame(); restoreFrame(); frame.remove(); }
      readySent = false; finishSent = false; lastStatus = ''; lastError = '';
      state = { status: 'ready', report: null, cameraActive: false };
      frame = document.createElement('iframe'); frame.title = '摄像头与眼动检查'; frame.allow = 'camera';
      frame.style.cssText = 'width:100%;height:min(760px,calc(100vh - 120px));min-height:620px;border:0;display:block;border-radius:12px';
      normalFrameStyle = frame.style.cssText;
      frame.addEventListener('load', sendConfig, { once: true });
      const frameUrl = new URL('vendor/webgazer/probe.html', base); frameUrl.searchParams.set('v', LAYOUT_VERSION);
      frame.src = frameUrl.href;
      container.replaceChildren(frame);
    }
    function destroy() {
      if (destroyed) return; destroyed = true;
      window.removeEventListener('message', receive); window.removeEventListener('pagehide', destroy);
      stopFrame(); restoreScroll(); frame?.remove(); frame = null;
      state = { ...state, status: 'closed', cameraActive: false };
    }
    window.addEventListener('message', receive); window.addEventListener('pagehide', destroy);
    createFrame(); return { getState: () => structuredClone(state), destroy };
  }

  function startChild() {
    const root = document.getElementById('gaze-root');
    let state = { status: 'ready', report: null, cameraActive: false };
    let wg = null, active = true, starting = false, configured = false, keepTracking = false, regions = REGIONS;
    let watchdog = null, calibrationIndex = 0, clicks = 0, lastClick = -Infinity, lastFrame = 0, lastFaceAt = 0;
    let validationStart = 0, currentTarget = null, samples = [], validationRows = [], viewport = null, lastStreamSample = 0, trackingStart = 0;
    let geometryTimer = null, initialGeometry = null, latestGeometry = null;
    const waits = new Map(), streams = new Set(), removers = [];
    let originalMedia = null, guardedMedia = null, pendingScript = null;
    const publish = extra => parent.postMessage({ kind: 'attention-gaze', ...(extra?.sample ? {} : { state }), timeOrigin: performance.timeOrigin, ...extra }, location.origin === 'null' ? '*' : location.origin);
    const update = patch => { state = { ...state, ...patch }; publish(); };
    const button = (label, action, secondary) => { const el = document.createElement('button'); el.textContent = label; if (secondary) el.className = 'secondary'; el.addEventListener('click', action); return el; };
    const delay = ms => new Promise(resolve => { const id = setTimeout(() => { waits.delete(id); resolve(active); }, ms); waits.set(id, resolve); });
    function listen(target, name, handler) { target.addEventListener(name, handler); removers.push(() => target.removeEventListener(name, handler)); }
    function abortError() { const e = new Error('检查已结束'); e.name = 'AbortError'; return e; }
    function stopStream(stream) { try { stream.getTracks().forEach(track => track.stop()); } catch (_) {} }
    function restoreMedia() { if (originalMedia && navigator.mediaDevices.getUserMedia === guardedMedia) navigator.mediaDevices.getUserMedia = originalMedia; }
    function guardMedia() {
      originalMedia = navigator.mediaDevices.getUserMedia;
      guardedMedia = async function (...args) {
        if (!active) throw abortError();
        const stream = await originalMedia.apply(navigator.mediaDevices, args);
        // Browser permission prompts cannot be programmatically dismissed. This
        // closure still runs if approval arrives after cancel/destroy.
        if (!active) { stopStream(stream); throw abortError(); }
        streams.add(stream);
        stream.getTracks().forEach(track => listen(track, 'ended', () => { if (active) error('摄像头连接中断了。请检查设备后重新校准。', 'camera_ended'); }));
        return stream;
      };
      navigator.mediaDevices.getUserMedia = guardedMedia;
    }
    function stop() {
      if (!active) { streams.forEach(stopStream); return; }
      active = false; clearInterval(watchdog); clearInterval(geometryTimer);
      for (const [id, resolve] of waits) { clearTimeout(id); resolve(false); } waits.clear();
      removers.splice(0).forEach(remove => remove());
      if (pendingScript) { pendingScript.onload = null; pendingScript.onerror = null; pendingScript.remove(); pendingScript = null; }
      streams.forEach(stopStream); restoreMedia();
      document.querySelectorAll('video').forEach(video => { if (video.srcObject) stopStream(video.srcObject); });
      if (wg) {
        try { wg.removeMouseEventListeners(); wg.clearGazeListener(); wg.pause(); } catch (_) {}
        try { wg.end(); } catch (_) {}
        try { Promise.resolve(wg.clearData()).catch(() => {}); } catch (_) {}
        try { wg.getTracker()?.detector?.dispose(); } catch (_) {}
      }
      state.cameraActive = false;
    }
    const style = document.createElement('style');
    style.textContent = `*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#fffbed;color:#242019;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}body{font-size:16px;line-height:1.65}main{padding:28px;max-width:1000px;margin:auto}h2{font-size:30px;line-height:1.3;margin:0 0 16px}h3{margin:0 0 8px}p{margin:10px 0 16px}.lead{font-size:18px;max-width:750px}.tag{font-size:13px;letter-spacing:.05em;font-weight:750;color:#80651a;margin-bottom:10px}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:22px 0}.step{border:2px solid #242019;padding:16px;background:#fffef7;border-radius:14px}.step b{display:block;margin-bottom:8px}.step span{font-size:14px;color:#5d5545}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}button{font:inherit;font-weight:750;cursor:pointer;padding:12px 22px;border:2px solid #242019;border-radius:8px;background:#ffdf39;box-shadow:3px 3px 0 #242019;color:#242019}button:hover{transform:translate(-1px,-1px)}button:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #242019}button:focus-visible{outline:3px solid #e94b30;outline-offset:4px}button:disabled{opacity:.55;cursor:default}button.secondary{background:#fffef7}.note{padding:14px 18px;border-left:4px solid #e3b92a;background:#fff3bf;font-size:14px}.error{border-color:#c53d29;background:#fff0e9}.stage{position:fixed;inset:0;background:#fffbed;overflow:hidden}.stagebar{position:absolute;left:20px;right:20px;top:12px;text-align:center;pointer-events:none;font-size:15px;z-index:2}.stop{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);z-index:2;padding:6px 18px;font-size:13px}.stop:hover,.stop:active{transform:translateX(-50%)}.target{position:absolute;transform:translate(-50%,-50%);width:64px;height:64px;padding:0;border-radius:50%;background:#ffdf39;box-shadow:3px 3px 0 #242019;font-size:20px}.target:hover,.target:active{transform:translate(-50%,-50%)}.target:disabled{opacity:1}.target:after{content:"";position:absolute;left:27px;top:27px;width:6px;height:6px;background:#242019;border-radius:100%}.target>span{position:absolute;top:65px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:13px;font-weight:600}.region{position:absolute;border:2px dashed #dfc981;border-radius:20px;background:#fff7d8}.region.active{border:3px solid #242019;background:#ffe66e}.star{position:absolute;transform:translate(-50%,-50%);font-size:64px;line-height:1;color:#f0b522;text-shadow:2px 2px #242019;-webkit-text-stroke:2px #242019}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:15px;margin:20px 0}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #dbd2b8}th{background:#ffe879}a{color:#9b3828}.face-help{margin-top:200px;max-width:700px}.camera-slot{min-height:195px}.muted{color:#615b4d;font-size:14px}@media(max-width:700px){main{padding:20px}.steps{grid-template-columns:1fr;gap:8px}.step{padding:10px}.lead{font-size:16px}h2{font-size:26px}}`;
    document.head.appendChild(style);
    function screen(title, body) { root.innerHTML = '<div class="tag">摄像头检查 · 通常约 1–2 分钟</div><h2>' + title + '</h2>' + body; }
    function actions(...buttons) { const row = document.createElement('div'); row.className = 'actions'; row.append(...buttons); root.appendChild(row); }
    function cancel() {
      stop(); update({ status: 'cancelled', cameraActive: false });
      screen('检查已结束', '<p class="lead">摄像头已关闭。本次检查已结束。</p>');
      actions(button('重新检查', () => publish({ restart: true })));
      publish({ finished: true });
    }
    function error(message, code = 'gaze_error') {
      if (!active) return;
      stop(); update({ status: 'error', cameraActive: false, error: message, errorCode: code });
      screen('这一步还没完成', '<p class="lead"></p><p class="note">摄像头已经关闭。需要重新校准，才能继续记录眼动。</p>');
      root.querySelector('.lead').textContent = message;
      actions(button('重新检查', () => publish({ restart: true })), button('结束检查', () => publish({ finished: true }), true));
    }
    function readGeometry() {
      try {
        const view = win => ({ width:win.innerWidth, height:win.innerHeight, devicePixelRatio:win.devicePixelRatio,
          visualViewport:win.visualViewport ? { width:win.visualViewport.width, height:win.visualViewport.height,
            scale:win.visualViewport.scale, offsetLeft:win.visualViewport.offsetLeft, offsetTop:win.visualViewport.offsetTop } :
            { width:win.innerWidth, height:win.innerHeight, scale:1, offsetLeft:0, offsetTop:0 } });
        const parentView = view(parent), childView = view(window), element = window.frameElement;
        const rect = element ? element.getBoundingClientRect() : { left:0,top:0,width:innerWidth,height:innerHeight };
        let transformed = false;
        for (let el = element; el; el = el.parentElement) {
          const css = parent.getComputedStyle(el);
          if (css.transform !== 'none' || (css.zoom && Number(css.zoom) !== 1)) transformed = true;
        }
        return { parent:parentView, child:childView, frame:{left:rect.left,top:rect.top,width:rect.width,height:rect.height,transformed} };
      } catch (_) { return null; }
    }
    function failGeometry(problem, geometry) {
      // This is a display failure, not a failed gaze-quality measurement.
      state = { ...state, report:null, geometryFailure:{reason:problem,layoutVersion:LAYOUT_VERSION,geometry} };
      error('显示位置改变了，眼动记录已停止。请保持窗口和显示比例不变，再重新校准。', 'display_geometry_changed');
      return false;
    }
    function ensureGeometry() {
      if (!active || !initialGeometry) return false;
      const geometry = readGeometry(), problem = geometryProblem(geometry, initialGeometry);
      if (problem) return failGeometry(problem, geometry);
      latestGeometry = geometry; return true;
    }
    async function waitForStableGeometry() {
      // Parent postMessage layout is asynchronous. Require three stable readings
      // rather than assuming the full-frame style applied within a fixed delay.
      const deadline = performance.now() + 2000;
      let previous = null, stable = 0, geometry = null, problem = 'unavailable';
      while (active && performance.now() <= deadline) {
        geometry = readGeometry(); problem = geometryProblem(geometry);
        if (!problem) {
          stable = previous && !geometryProblem(geometry, previous) ? stable + 1 : 1;
          previous = geometry;
          if (stable >= 3) {
            initialGeometry = latestGeometry = geometry;
            geometryTimer = setInterval(ensureGeometry, 200);
            return true;
          }
        } else { stable = 0; previous = null; }
        if (!await delay(40)) return false;
      }
      return active ? failGeometry(problem || 'unstable', geometry) : false;
    }
    function contextProblem(checkSize = false) {
      if (base.startsWith('file:')) return '当前是直接打开的本地文件。眼动模型需要通过网页服务加载，请先双击项目里的“启动预览.command”，再用它打开的 localhost 页面检查。';
      if (!window.isSecureContext) return '摄像头需要安全连接。请使用 HTTPS 网页，或在这台电脑上打开 localhost 预览。';
      if (!navigator.mediaDevices?.getUserMedia) return '这个浏览器暂时无法使用摄像头，请换用电脑上的新版 Chrome 或 Edge。';
      if (checkSize && (innerWidth < 800 || innerHeight < 550)) return '请在电脑上放大浏览器窗口后再检查。四个观察区域需要至少 800 × 550 的显示空间。';
      return null;
    }
    function loadScript() {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script'); pendingScript = s;
        s.src = new URL('vendor/webgazer/webgazer.js', base).href;
        const cleanup = () => { s.onload = null; s.onerror = null; pendingScript = null; };
        s.onload = () => { cleanup(); if (!active) reject(abortError()); else if (window.webgazer) resolve(window.webgazer); else reject(new Error('LIBRARY')); };
        s.onerror = () => { cleanup(); reject(new Error('LIBRARY')); };
        removers.push(() => { if (pendingScript === s) { cleanup(); s.remove(); reject(abortError()); } });
        document.head.appendChild(s);
      });
    }
    function sampleFrom(data, t) {
      const x = Number.isFinite(data?.x) ? data.x / viewport.width : null;
      const y = Number.isFinite(data?.y) ? data.y / viewport.height : null;
      const faceFresh = lastFaceAt > 0 && t - lastFaceAt <= QUALITY.faceFreshMs;
      const valid = faceFresh && Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;
      return { t, x, y, faceFresh, valid, region: valid ? classify(x, y, regions) : null, faceAgeMs: lastFaceAt ? Math.max(0, t - lastFaceAt) : null };
    }
    function liveSample(data, t) {
      if (t - lastStreamSample < 45) return;
      lastStreamSample = t; publish({ sample: sampleFrom(data, t) });
    }
    async function begin() {
      if (!active || starting || !configured) return;
      starting = true; update({ status: 'loading' });
      screen('先准备好摄像头', '<p class="lead">浏览器会询问是否允许使用摄像头。请允许后稍等片刻，保持脸部明亮、完整地出现在画面里。</p><p class="muted">正在加载本地眼动模型……</p>');
      actions(button('取消检查', cancel, true));
      if (!await waitForStableGeometry()) return;
      const problem = contextProblem(true); if (problem) { error(problem, 'unsupported_context'); return; }
      try {
        wg = await loadScript(); if (!ensureGeometry()) return;
        wg.params.faceMeshSolutionPath = new URL('vendor/webgazer/mediapipe/face_mesh', base).href;
        wg.saveDataAcrossSessions(false); await wg.clearData(); if (!active) return;
        const tracker = wg.getTracker(); const getEyePatches = tracker.getEyePatches.bind(tracker);
        tracker.getEyePatches = async function (...args) {
          const eyes = await getEyePatches(...args);
          if (active && eyes?.left && eyes?.right) lastFaceAt = performance.now();
          return eyes;
        };
        wg.showPredictionPoints(false).showFaceOverlay(false).showFaceFeedbackBox(true);
        wg.params.videoViewerWidth = 240; wg.params.videoViewerHeight = 180;
        wg.setGazeListener(data => {
          if (!active) return;
          const t = performance.now(); lastFrame = t;
          if (state.status === 'validating' && currentTarget) samples.push({ ...sampleFrom(data, t), target: currentTarget.id });
          if (state.status === 'tracking') liveSample(data, t);
        });
        // Preload local model before any camera request. The timer is cleared on
        // success; cancellation resolves pending delays and cannot reopen camera.
        let modelTimeout;
        await Promise.race([Promise.resolve(tracker.init()).then(() => { if (!active) { try { tracker.detector?.dispose(); } catch (_) {} throw abortError(); } }), new Promise((_, reject) => { modelTimeout = setTimeout(() => reject(new Error('MODEL_TIMEOUT')), 45000); removers.push(() => { clearTimeout(modelTimeout); reject(abortError()); }); })]).finally(() => clearTimeout(modelTimeout));
        if (!ensureGeometry()) return;
        guardMedia(); await wg.begin(); restoreMedia();
        if (!active) { streams.forEach(stopStream); try { wg.end(); } catch (_) {} return; }
        wg.removeMouseEventListeners();
        update({ status: 'positioning', cameraActive: true });
        const preview = document.getElementById('webgazerVideoContainer');
        if (preview) { preview.style.left = (Math.max(0,(innerWidth - 1000) / 2) + 28) + 'px'; preview.style.top = '162px'; preview.style.border = '2px solid #242019'; preview.style.borderRadius = '10px'; preview.style.overflow = 'hidden'; }
        screen('坐好，我们先对一下位置', '<p class="lead">请看着屏幕，坐在离电脑约一臂的位置。让脸部留在画面中间，尽量保持头部不动。</p><div class="camera-slot"></div><p>接下来会出现 9 个圆点。看着每个圆点的中心，慢慢点击 5 次。</p>');
        actions(button('开始校准', () => { wg.showVideoPreview(false); startCalibration(); }), button('结束检查', cancel, true));
        watchdog = setInterval(() => {
          if (!active) return;
          const t = performance.now();
          if (state.status === 'tracking') {
            // Missing callbacks still produce explicit invalid samples, so a
            // camera outage cannot silently look like perfectly covered data.
            if (t - lastFrame > 200) liveSample(null, t);
            if (t - Math.max(lastFaceAt, trackingStart) > QUALITY.faceLostMs) { error('暂时没有持续识别到脸部，眼动记录已停止。请检查摄像头画面后重新校准。', 'face_lost'); return; }
            if (t - Math.max(lastFrame, trackingStart) > QUALITY.predictionLostMs) { error('视线数据中断了，眼动记录已停止。请检查摄像头后重新校准。', 'prediction_lost'); return; }
          } else if (['calibrating','validating'].includes(state.status) && t - lastFrame > 8000) error('暂时没有收到摄像头画面。请检查摄像头是否被其他软件占用，再重新检查。', 'camera_stalled');
        }, 200);
      } catch (e) {
        if (!active) { streams.forEach(stopStream); restoreMedia(); return; }
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') error('没有获得摄像头权限。请点击浏览器地址栏左侧的网站设置，允许摄像头后重试。', 'permission_denied');
        else if (e.name === 'NotFoundError') error('没有找到可用的摄像头。请连接或启用电脑摄像头后重试。', 'camera_missing');
        else if (e.name === 'NotReadableError') error('摄像头暂时无法打开。请关闭正在使用摄像头的会议或录制软件后重试。', 'camera_busy');
        else error('眼动模型没有成功加载。请确认项目文件完整，并通过“启动预览.command”或 HTTPS 网页打开后重试。', 'model_error');
      }
    }
    function makeStage(message) {
      root.innerHTML = '<div class="stage"><div class="stagebar"></div></div>'; root.querySelector('.stagebar').textContent = message;
      const s = root.querySelector('.stage'); const stopButton = button('结束检查', cancel, true); stopButton.classList.add('stop'); s.appendChild(stopButton); return s;
    }
    function ensureValidationStage(stage) {
      const near = (a,b) => Math.abs(a-b) <= 1;
      const r = stage.getBoundingClientRect(), box = stage.querySelector('.region.active')?.getBoundingClientRect(), star = stage.querySelector('.star')?.getBoundingClientRect();
      const target = currentTarget;
      if (!near(r.left,0) || !near(r.top,0) || !near(r.width,innerWidth) || !near(r.height,innerHeight) || !box || !star ||
        !near(box.left,target.x0*innerWidth) || !near(box.top,target.y0*innerHeight) ||
        !near(box.width,(target.x1-target.x0)*innerWidth) || !near(box.height,(target.y1-target.y0)*innerHeight) ||
        !near(star.left+star.width/2,(target.x0+target.x1)/2*innerWidth) || !near(star.top+star.height/2,(target.y0+target.y1)/2*innerHeight)) {
        return failGeometry('validation_stage_changed', readGeometry());
      }
      return true;
    }
    const calibrationPoints = [[.1,.15],[.5,.15],[.9,.15],[.9,.5],[.5,.5],[.1,.5],[.1,.85],[.5,.85],[.9,.85]];
    async function startCalibration() {
      if (!ensureGeometry()) return;
      wg.removeMouseEventListeners(); await wg.clearData(); if (!ensureGeometry()) return;
      viewport = { width: innerWidth, height: innerHeight, devicePixelRatio: window.devicePixelRatio };
      update({ status: 'calibrating' }); calibrationIndex = 0; clicks = 0; lastClick = -Infinity; showCalibrationPoint();
    }
    function showCalibrationPoint() {
      if (!ensureGeometry()) return;
      const stage = makeStage('看着圆点的中心，慢慢点击 5 次。尽量保持头部不动。'); const p = calibrationPoints[calibrationIndex];
      const target = button('', async () => {
        if (!active || target.disabled || performance.now() - lastClick < 400 || !ensureGeometry()) return;
        if (!lastFaceAt || performance.now() - lastFaceAt > QUALITY.faceFreshMs) { root.querySelector('.stagebar').textContent = '暂时没看到你的脸。请面向屏幕，让脸部保持明亮。'; return; }
        root.querySelector('.stagebar').textContent = '看着圆点的中心，慢慢点击 5 次。尽量保持头部不动。'; lastClick = performance.now();
        const r = target.getBoundingClientRect(); wg.recordScreenPosition(r.left + r.width / 2, r.top + r.height / 2, 'click');
        clicks += 1; target.querySelector('span').textContent = '第 ' + (calibrationIndex + 1) + ' / 9 个点 · ' + clicks + ' / 5';
        if (clicks >= 5) { target.disabled = true; if (!await delay(450)) return; calibrationIndex++; clicks = 0; if (calibrationIndex < calibrationPoints.length) showCalibrationPoint(); else readyValidation(); }
      });
      target.className = 'target'; target.setAttribute('aria-label', '校准点 ' + (calibrationIndex + 1)); target.style.left = p[0] * 100 + '%'; target.style.top = p[1] * 100 + '%';
      target.innerHTML = '<span>第 ' + (calibrationIndex + 1) + ' / 9 个点 · 0 / 5</span>'; if (p[1] > .7) target.querySelector('span').style.top = '-34px'; stage.appendChild(target);
    }
    function readyValidation() {
      if (!ensureGeometry()) return;
      wg.removeMouseEventListeners(); update({ status: 'validation_ready' });
      screen('现在检查一下，看得准不准', '<p class="lead">星星会依次出现在四个观察区域。' + (keepTracking ? '这些位置与接下来游戏中的烤箱相同。' : '') + '</p><div class="note">请只用眼睛看着星星，直到它换到下一个位置。不用移动鼠标，也不用点击。</div><p>这一步只检查校准效果，不会继续训练电脑。</p>');
      actions(button('准备好了', runValidation), button('重新校准', startCalibration, true));
    }
    async function runValidation() {
      if (!active || state.status !== 'validation_ready' || !ensureGeometry()) return;
      wg.removeMouseEventListeners(); wg.showPredictionPoints(false); wg.showVideoPreview(false);
      samples = []; validationRows = []; update({ status: 'validating' });
      for (const regionIndex of [0,3,1,2]) {
        if (!ensureGeometry()) return; currentTarget = regions[regionIndex];
        const stage = makeStage(keepTracking ? '看着星星，不用点击。四个框对应接下来四台烤箱的位置。' : '只看着星星，不用点击。');
        regions.forEach(r => { const box = document.createElement('div'); box.className = 'region' + (r === currentTarget ? ' active' : ''); box.style.cssText = `left:${r.x0*100}%;top:${r.y0*100}%;width:${(r.x1-r.x0)*100}%;height:${(r.y1-r.y0)*100}%`; stage.appendChild(box); });
        const star = document.createElement('div'); star.className = 'star'; star.textContent = '★'; star.style.left = ((currentTarget.x0 + currentTarget.x1) / 2 * 100) + '%'; star.style.top = ((currentTarget.y0 + currentTarget.y1) / 2 * 100) + '%'; stage.appendChild(star);
        if (!ensureValidationStage(stage)) return;
        validationStart = performance.now(); if (!await delay(4000) || !ensureGeometry()) return;
        validationRows.push(summarize(samples, currentTarget.id, validationStart + 1000, validationStart + 4000, 200, regions));
      }
      currentTarget = null; finish();
    }
    function finish() {
      if (!ensureGeometry()) return;
      const quality = assessQuality(validationRows, regions);
      const report = { type: 'four_area_feasibility', version: 'phase2-3', layoutVersion:LAYOUT_VERSION,
        geometry:{initial:initialGeometry,validated:latestGeometry}, createdAt: new Date().toISOString(), webgazerVersion: '3.5.3', viewport, regions,
        calibration: { points: 9, clicksPerPoint: 5 }, validation: { targetDurationMs: 4000, settlingExcludedMs: 1000, mouseTraining: false, rows: validationRows },
        outcome: quality.passed ? 'pilot_threshold_met' : 'pilot_threshold_not_met', quality, scientificPassThreshold: null };
      report.diagnostics = describeValidation(report);
      if (keepTracking) {
        wg.removeMouseEventListeners(); wg.showPredictionPoints(false); wg.showVideoPreview(false); trackingStart = performance.now();
        document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'; root.replaceChildren();
        update({ status: 'tracking', cameraActive: true, report }); publish({ trackingReady: true }); return;
      }
      stop(); update({ status: 'complete', cameraActive: false, report });
      screen('检查完成，摄像头已关闭', '<p class="lead">命中率是有效视线估计落在对应框内的比例；采样覆盖率是有有效数据的时段比例。</p><div class="table-wrap"><table><thead><tr><th>看向哪里</th><th>命中率</th><th>采样覆盖率</th><th>检查结果</th></tr></thead><tbody></tbody></table></div><p class="note">每个区域的两项指标暂定都达到 60%，才可进入眼动试运行。这是工程试行门槛，不是通用科学标准，也不代表你的注意力水平。</p><p class="muted">结果只保留在本页，未上传到老师的收数页面。</p>');
      const body = root.querySelector('tbody'); report.diagnostics.rows.forEach(row => { const tr = document.createElement('tr'); [row.name, row.areaAccuracyText, row.coverageText, row.failureLabel].forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); }); body.appendChild(tr); });
      const conclusion = document.createElement('p'); conclusion.textContent = report.diagnostics.summary; root.appendChild(conclusion);
      actions(button('完成检查', () => publish({ finished: true })), button('再检查一次', () => publish({ restart: true }), true));
    }
    function geometryChanged() {
      if (active && initialGeometry) ensureGeometry();
    }
    function fullscreenChanged() { if (active && viewport) error('全屏状态变了，眼动记录已停止。请重新校准。', 'fullscreen_changed'); }
    listen(window, 'pagehide', stop); listen(window, 'resize', geometryChanged);
    if (window.visualViewport) { listen(window.visualViewport, 'resize', geometryChanged); listen(window.visualViewport, 'scroll', geometryChanged); }
    listen(document, 'fullscreenchange', fullscreenChanged);
    try { if (parent !== window) {
      listen(parent.document, 'fullscreenchange', fullscreenChanged); listen(parent, 'resize', geometryChanged);
      if (parent.visualViewport) { listen(parent.visualViewport, 'resize', geometryChanged); listen(parent.visualViewport, 'scroll', geometryChanged); }
    } } catch (_) {}
    listen(document, 'visibilitychange', () => { if (document.hidden && starting) error('你离开了检查页面，摄像头已关闭。回来后请重新校准。', 'page_hidden'); });
    window.AttentionGaze.stop = stop;
    function renderReady() {
      screen('让电脑知道你在看哪里', '<p class="lead">我们会用摄像头估计你的视线位置。画面只在这台电脑上处理，不会录制或上传视频。</p><div class="steps"><div class="step"><b>① 调整位置</b><span>光线充足，脸部正对屏幕。</span></div><div class="step"><b>② 点击圆点</b><span>看着圆点，慢慢点击。</span></div><div class="step"><b>③ 看向星星</b><span>不用点击，跟着星星看。</span></div></div><p class="note">' + (keepTracking ? '检查完成后，摄像头会在游戏期间继续估计视线。你随时可以结束。' : '当前为设备检查，不计入正式实验数据。') + '</p>');
      const problem = contextProblem(); if (problem) { const p = document.createElement('p'); p.className = 'note error'; p.textContent = problem; root.appendChild(p); }
      const start = button(configured ? '开启摄像头，开始检查' : '正在准备检查…', begin); start.disabled = Boolean(problem) || !configured;
      actions(start, button('暂时跳过', () => { stop(); update({ status: 'skipped' }); publish({ finished: true }); }, true));
    }
    function receiveConfig(event) {
      if (!active || starting || event.source !== parent || (location.origin !== 'null' && event.origin !== location.origin) || event.data?.kind !== 'attention-gaze-config') return;
      try {
        if (event.data.keepTracking === true && !Array.isArray(event.data.regions)) throw new Error('Missing game regions');
        regions = validateRegions(event.data.regions); keepTracking = event.data.keepTracking === true; configured = true; renderReady(); publish();
      }
      catch (_) { error('游戏里的观察区域还没有准备好。请返回游戏页面后重试。', 'invalid_regions'); }
    }
    listen(window, 'message', receiveConfig); configured = parent === window; renderReady(); publish({ configRequest: true });
  }
  const api = { mount, classify, summarize, assessQuality, describeValidation, validateRegions, validPrediction, geometryProblem, regions: REGIONS, qualityThresholds: QUALITY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.AttentionGaze = api; if (script?.hasAttribute('data-gaze-frame')) startChild(); }
})();
