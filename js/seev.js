/*
 * SEEV-inspired monitoring with separate release and pilot identities, implemented independently.
 * Scheduling/logging is separated from drawing. The manipulation adds a
 * static outline around costly ovens, compared with no outline; no outcome feedback is
 * shown during formal blocks. This is a mechanism adaptation, not a literal
 * replication of the driving experiment or a fitted SEEV model.
 */
(function (global) {
  'use strict';
  const W = 1200, H = 640, BIN_MS = 100, BLOCK_MS = 85000, EVENTS_PER_BLOCK = 50;
  const INK = '#29251f', PAPER = '#fff9e7', YELLOW = '#ffdc3f', RED = '#d94a35';
  const FONT = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  const OVENS = Object.freeze([
    { x: 50, y: 24, w: 460, h: 276 }, { x: 690, y: 24, w: 460, h: 276 },
    { x: 50, y: 340, w: 460, h: 276 }, { x: 690, y: 340, w: 460, h: 276 }
  ].map(Object.freeze));
  const LAYOUT = Object.freeze({ id: 'bakery-spread-v2', canvas: Object.freeze({ width: W, height: H }), ovens: OVENS });
  // Source rectangles describe the existing illustration in its old 960×640
  // display space. Only the four illustrated ovens are drawn, never the old grid.
  const OVEN_CROPS = Object.freeze([
    { x: 201, y: 57, w: 296, h: 222 }, { x: 501, y: 57, w: 296, h: 222 },
    { x: 201, y: 283, w: 296, h: 222 }, { x: 501, y: 283, w: 296, h: 222 }
  ].map(Object.freeze));
  function ovenAt(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
    return OVENS.findIndex(box => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
  }
  // Shared by gameplay and the v2 heatmap so image, visible labels and AOIs cannot
  // drift apart. It deliberately renders no task score or response feedback.
  function drawScene(ctx, image, view = {}) {
    const box = (x,y,w,h,fill,stroke=INK,lineWidth=2,radius=12) => {
      ctx.beginPath();ctx.roundRect(x,y,w,h,radius);
      if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
    };
    const text = (value,x,y,size=18,color=INK,weight=700) => {
      ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(value),x,y);
    };
    ctx.clearRect(0,0,W,H);ctx.fillStyle='#fff4cd';ctx.fillRect(0,0,W,H);
    // Quiet paper background keeps the four illustrated ovens as the main targets.
    ctx.strokeStyle='#e5cc8a';ctx.lineWidth=1;
    for(let y=0;y<=H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    OVENS.forEach((oven,index)=>{
      const crop=OVEN_CROPS[index],factor=view.mapping?.find(row=>row.oven===index);
      ctx.save();ctx.shadowColor='#5d3d2633';ctx.shadowBlur=12;ctx.shadowOffsetY=6;
      box(oven.x,oven.y,oven.w,oven.h,'#f9ca58',null,0,23);ctx.restore();
      if(image){
        const sx=(image.naturalWidth||image.width)/960,sy=(image.naturalHeight||image.height)/640;
        ctx.save();ctx.beginPath();ctx.roundRect(oven.x,oven.y,oven.w,oven.h,23);ctx.clip();
        ctx.drawImage(image,crop.x*sx,crop.y*sy,crop.w*sx,crop.h*sy,oven.x,oven.y,oven.w,oven.h);ctx.restore();
      }
      const emphasis=view.condition==='value_cue'&&factor?.value==='high';
      if(emphasis){box(oven.x+3,oven.y+3,oven.w-6,oven.h-6,null,PAPER,10,24);box(oven.x+3,oven.y+3,oven.w-6,oven.h-6,null,'#276d6a',6,24);}
      const labelX=oven.x+(oven.w-328)/2,labelY=oven.y+68;
      box(labelX,labelY,44,34,'#fff7df','#684226',2,7);text(index+1,labelX+22,labelY+17,21,INK,900);
      if(factor){
        box(labelX+54,labelY,126,34,'#fff7df','#684226',2,16);text(factor.frequency==='high'?'常出炉':'较少出炉',labelX+117,labelY+17,16,'#725e42');
        box(labelX+190,labelY,138,34,'#fff7df','#684226',2,16);text(factor.value==='high'?'漏掉 −5':'漏掉 −1',labelX+259,labelY+17,16,'#725e42');
      }
      if(view.activeOvens?.includes(index+1)){
        box(oven.x+oven.w/2-110,oven.y+151,220,48,'#fff1a7','#6a3f26',3,12);
        text(`出炉了！按 ${index+1}`,oven.x+oven.w/2,oven.y+175,23,'#7c351f',900);
      }
    });
  }
  const CONDITIONS = Object.freeze([
    { id: 'baseline', name: '普通界面', note: '四台烤箱都不加边框。' },
    { id: 'value_cue', name: '价值提示', note: '漏掉损失大的两台加边框。' }
  ].map(Object.freeze));
  const FACTORS = [
    { frequency: 'high', value: 'high', penalty: 5 },
    { frequency: 'high', value: 'low', penalty: 1 },
    { frequency: 'low', value: 'high', penalty: 5 },
    { frequency: 'low', value: 'low', penalty: 1 }
  ];
  const ORDERS = [['baseline', 'value_cue'], ['value_cue', 'baseline']];
  function release(options = {}) {
    if (options.collectionMode === undefined) return { version: 'seev-stage3-1', experiment: 'seev_bakery_stage3', testOnly: true,
      simulation: options.testOnly === true && options.simulation === true };
    const protocol = global.AttentionProtocol || (typeof require === 'function' ? require('./protocol.js') : null);
    if (!protocol) throw new Error('实验协议未加载，请刷新页面后重试。');
    const settings = protocol.getEngineOptions(options.collectionMode, options), config = protocol.getConfig(settings.collectionMode);
    return { ...config.experiments.bakery, collectionMode: config.collectionMode, protocolVersion: config.protocolVersion,
      testOnly: config.testOnly, simulation: settings.simulation };
  }
  function modeFields(info) { return info.collectionMode ? { collectionMode: info.collectionMode, protocolVersion: info.protocolVersion } : {}; }
  const copy = value => JSON.parse(JSON.stringify(value));
  function hash(value) {
    const text = String(value); let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let value = seed || 1;
    return function () {
      value |= 0; value = value + 0x6D2B79F5 | 0;
      let t = Math.imul(value ^ value >>> 15, 1 | value);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(items, random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  function hasOverlap(events) {
    return events.some((a, i) => events.slice(i + 1).some(b => a.oven !== b.oven && a.onsetMs < b.onsetMs + b.windowMs && b.onsetMs < a.onsetMs + a.windowMs));
  }
  function schedule(mapping, seed, prefix) {
    const random = rng(seed), events = [];
    // Independent stratified jitter for each oven: 15/10 events over 78 seconds.
    // The 50 events / 85 s density is below the earlier 60 / 100 s design.
    // Minimum same-oven separation is >2.7 s, exceeding the 1.8 s response window.
    for (const factor of mapping) {
      const count = factor.frequency === 'high' ? 15 : 10;
      const width = 78000 / count;
      for (let i = 0; i < count; i++) events.push({
        id: `${prefix}_o${factor.oven + 1}_e${String(i + 1).padStart(2, '0')}`,
        oven: factor.oven, onsetMs: Math.round(2000 + (i + 0.5 + (random() - 0.5) * 0.48) * width),
        windowMs: 1800, frequency: factor.frequency, value: factor.value, penalty: factor.penalty
      });
    }
    events.sort((a, b) => a.onsetMs - b.onsetMs || a.oven - b.oven);
    // The dense, independent schedules ordinarily overlap. Assert this design
    // property instead of silently accepting a sequential attention task.
    if (!hasOverlap(events)) throw new Error('Schedule lacks concurrent oven events.');
    return events;
  }
  function createPlan(participantId = 'anonymous', options = {}) {
    const info = release(options);
    const seed = hash(participantId), random = rng(seed);
    const mapping = shuffle(FACTORS, random).map((factor, oven) => ({ oven, ...factor }));
    const orderIndex = seed % ORDERS.length;
    return {
      version: info.version, layoutId: LAYOUT.id, ...modeFields(info), seed, participantId, orderIndex,
      assignment: 'Seeded two-order allocation; not guaranteed balanced in a small sample.',
      mapping, responseWindowMs: 1800, gazeBinMs: BIN_MS,
      formalDurationMs: BLOCK_MS * ORDERS[orderIndex].length, totalScheduledEvents: EVENTS_PER_BLOCK * ORDERS[orderIndex].length,
      blocks: ORDERS[orderIndex].map((conditionId, index) => ({
        index, blockId: `b${index + 1}`, conditionId, durationMs: BLOCK_MS,
        scheduleSeed: hash(`${seed}:${conditionId}:events`),
        events: schedule(mapping, hash(`${seed}:${conditionId}:events`), `b${index + 1}`)
      })),
      practice: {
        index: -1, blockId: 'practice', conditionId: 'practice', durationMs: 18000,
        events: [0, 2, 1, 3, 0, 3].map((oven, i) => ({
          id: `p${i + 1}`, oven, onsetMs: 1700 + i * 2500, windowMs: 1800,
          frequency: mapping[oven].frequency, value: mapping[oven].value, penalty: mapping[oven].penalty
        }))
      }
    };
  }
  function newRunId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `seev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
  function validated(report) {
    if (report?.quality?.passed === false) return false;
    return report?.quality?.passed === true || report?.quality?.usable === true || report?.usableForInference === true;
  }
  function gazeQuality(block, report) {
    const rows = block.gazeBins || [];
    const valid = rows.filter(row => row.quality === true);
    const inside = valid.filter(row => Number.isInteger(row.oven));
    const expected = Math.max(0, block.status === 'in_progress' ? Math.floor(block.elapsedMs / BIN_MS) + 1 : Math.ceil(block.elapsedMs / BIN_MS));
    const gazeValidated = validated(report);
    return {
      gazeValidated, expectedBins: expected, sampledBins: rows.length,
      validBins: valid.length, inOvenBins: inside.length,
      sampleCoverage: expected ? valid.length / expected : null,
      inOvenShareOfValid: valid.length ? inside.length / valid.length : null,
      // Calibration and task-time coverage must both pass this declared pilot
      // engineering screen. This threshold is not a validated accuracy claim.
      usableForInference: gazeValidated && expected > 0 && valid.length / expected >= 0.6 && block.status === 'complete',
      taskCoverageRule: { minimumCoverage: 0.6, label: 'Task-specific engineering screening rule; not a universal scientific threshold.' },
      validation: report?.quality || null,
      ovens: OVENS.map((_, oven) => {
        const samples = inside.filter(row => row.oven === oven).length;
        return { oven, samples, shareOfInOven: inside.length ? samples / inside.length : null, shareOfValid: valid.length ? samples / valid.length : null };
      })
    };
  }
  function summarize(result) {
    return result.blocks.map(block => {
      const presented = block.events.filter(e => e.actualOnsetMs !== null);
      const hits = block.events.filter(e => e.outcome === 'hit');
      const quality = gazeQuality(block, result.gazeValidation);
      return {
        condition: block.conditionId, status: block.status, trials: block.events.length,
        presented: presented.length, hits: hits.length, misses: block.events.filter(e => e.outcome === 'miss').length,
        falseAlarms: block.falseAlarms.length,
        weightedMissLoss: block.events.filter(e => e.outcome === 'miss').reduce((sum, e) => sum + e.penalty, 0),
        meanRtMs: hits.length ? hits.reduce((sum, e) => sum + e.rtMs, 0) / hits.length : null,
        sampleCoverage: quality.sampleCoverage, inOvenShareOfValid: quality.inOvenShareOfValid,
        usableGaze: quality.usableForInference,
        ovens: result.plan.mapping.map(factor => {
          const rows = block.events.filter(e => e.oven === factor.oven), correct = rows.filter(e => e.outcome === 'hit');
          return {
            oven: factor.oven + 1, frequency: factor.frequency, value: factor.value,
            events: rows.length, hits: correct.length, misses: rows.filter(e => e.outcome === 'miss').length,
            meanRtMs: correct.length ? correct.reduce((sum, e) => sum + e.rtMs, 0) / correct.length : null,
            observedShare: quality.usableForInference ? quality.ovens[factor.oven].shareOfInOven : null
          };
        })
      };
    });
  }

  // Pure state machine; the real renderer supplies performance.now() once per
  // frame. Simulation uses a separate explicit testOnly clock, never production RT.
  function createSession(options = {}) {
    const info = release(options), plan = createPlan(options.participantId || 'anonymous', options);
    const simulation = info.simulation;
    const realNow = options.now || (() => performance.now());
    let virtualNow = 0, runId, createdAt, completedAt = null, abortReason = null;
    let phase, blockIndex, active = null, practice = null, blocks = [], lastFrame = null, lastCheckpoint = 0;
    let feedback = '', generation = 0;
    const now = () => simulation ? virtualNow : realNow();
    function blankBlock(spec) {
      return {
        blockId: spec.blockId, conditionId: spec.conditionId, index: spec.index,
        status: 'not_started', startedAt: null, startedPerfMs: null, elapsedMs: 0, durationMs: spec.durationMs,
        events: spec.events.map(event => ({ ...copy(event), trialId: `${runId}:${event.id}`, actualOnsetMs: null,
          actualOnsetPerfMs: null, delayMs: null, responseMs: null, responsePerfMs: null, rtMs: null,
          outcome: 'not_presented', closed: false })),
        responses: [], falseAlarms: [], gazeBins: [], expectedGazeBins: 0,
        timing: { onsetMethod: simulation ? 'simulation' : 'performance.now_before_canvas_draw', maxFrameGapMs: 0 },
        geometry: null
      };
    }
    function state() {
      const running = ['practice', 'running'].includes(phase);
      const activeEvents = active ? active.events.filter(e => e.outcome === 'pending') : [];
      const all = blocks.flatMap(b => b.events);
      return {
        type: 'seev_bakery', version: plan.version, layoutId: LAYOUT.id, phase, testOnly: info.testOnly, ...modeFields(info), simulation, formal: phase === 'running', uploads: false,
        runId, block: ['running', 'block_intro', 'break'].includes(phase) ? blockIndex + 1 : null,
        totalBlocks: plan.blocks.length, condition: ['running', 'block_intro', 'break'].includes(phase) ? plan.blocks[blockIndex].conditionId : null,
        elapsedMs: active?.elapsedMs || 0, durationMs: active?.durationMs || BLOCK_MS,
        event: active?.events.filter(e => e.actualOnsetMs !== null).length || 0,
        totalEvents: active?.events.length || (phase === 'practice' ? 6 : EVENTS_PER_BLOCK),
        activeOvens: running ? activeEvents.map(e => e.oven + 1) : [],
        activeTrialIds: running ? activeEvents.map(e => e.trialId) : [],
        // Statistics are for local result/accessibility hooks, never drawn during formal blocks.
        hits: all.filter(e => e.outcome === 'hit').length, misses: all.filter(e => e.outcome === 'miss').length,
        falseAlarms: blocks.reduce((sum, b) => sum + b.falseAlarms.length, 0),
        message: feedback, abortReason,
        mapping: plan.mapping.map(row => ({ oven: row.oven + 1, frequency: row.frequency, value: row.value })),
        coordinates: 'Canvas 1200×640; origin top left; x right, y down.',
        controls: 'Space/Enter to continue; 1–4 or click an oven to collect; Escape to stop.'
      };
    }
    function snapshot(block) {
      const result = copy(block); result.gazeBins.sort((a, b) => a.bin - b.bin); result.expectedGazeBins = Math.ceil(result.elapsedMs / BIN_MS);
      result.quality = gazeQuality(result, options.gazeReport); return result;
    }
    function result() {
      const r = {
        schemaVersion: 2, experiment: info.experiment, testOnly: info.testOnly, ...modeFields(info), simulation,
        runId, version: plan.version, status: phase === 'complete' ? 'complete' : phase === 'aborted' ? 'aborted' : 'in_progress',
        completed: phase === 'complete', aborted: phase === 'aborted', abortReason,
        createdAt, completedAt, participantId: plan.participantId, plan: copy(plan), layout: copy(LAYOUT),
        practice: practice ? snapshot(practice) : null, blocks: blocks.map(snapshot),
        gazeValidation: options.gazeReport ? copy(options.gazeReport) : null,
        gazeCoordinates: { space: 'canvas', units: 'logical_pixels', width: W, height: H, origin: 'top_left',
          xDirection: 'right', yDirection: 'down', binMs: BIN_MS,
          source: 'WebGazer estimated viewport gaze transformed into canvas coordinates; no generated samples',
          binPolicy: 'Latest valid point per 100 ms bin, or latest invalid point when no valid point exists; missing bins remain absent' },
        note: info.collectionMode === 'formal' ? 'Formal release protocol; no automatic upload; a mechanism adaptation rather than a literal driving replication.' : 'Pilot only; no automatic upload, and not a literal replication of the original driving experiment.'
      };
      r.summary = summarize(r);
      r.totals = { hits: r.summary.reduce((sum, b) => sum + b.hits, 0), misses: r.summary.reduce((sum, b) => sum + b.misses, 0),
        weightedMissLoss: r.summary.reduce((sum, b) => sum + b.weightedMissLoss, 0), falseAlarms: r.summary.reduce((sum, b) => sum + b.falseAlarms, 0) };
      return r;
    }
    function emit() { if (options.onState) options.onState(state()); }
    function checkpoint() { lastCheckpoint = now(); if (options.onCheckpoint) options.onCheckpoint(result()); }
    function reset() {
      if (active && ['practice', 'running'].includes(phase)) abort('reset');
      generation++; runId = newRunId(); createdAt = new Date().toISOString(); completedAt = null; abortReason = null;
      phase = 'intro'; blockIndex = 0; active = null; practice = null; lastFrame = null; lastCheckpoint = now();
      blocks = plan.blocks.map(blankBlock); feedback = '先做 6 次练习。'; emit(); return state();
    }
    function startBlock(spec, targetPhase) {
      active = targetPhase === 'practice' ? blankBlock(spec) : blocks[blockIndex];
      if (targetPhase === 'practice') practice = active;
      active.status = 'in_progress'; active.startedAt = new Date().toISOString(); active.startedPerfMs = now();
      phase = targetPhase; feedback = targetPhase === 'practice' ? '看到“出炉了”，按对应数字。' : '请同时留意四台烤箱。';
      lastFrame = now(); lastCheckpoint = now(); checkpoint(); emit();
    }
    function start() {
      if (phase === 'intro') startBlock(plan.practice, 'practice');
      else if (phase === 'practice_complete') { phase = 'block_intro'; feedback = '先看清每台烤箱的规则。'; emit(); }
      else if (phase === 'block_intro' || phase === 'break') startBlock(plan.blocks[blockIndex], 'running');
      else if (phase === 'complete' || phase === 'aborted') reset();
      return state();
    }
    function closeMisses(t) {
      if (!active) return;
      for (const event of active.events) if (event.outcome === 'pending' && t - event.actualOnsetPerfMs >= event.windowMs) {
        event.outcome = 'miss'; event.closed = true;
        event.closedAtMs = t - active.startedPerfMs;
        if (phase === 'practice') feedback = '这盘没赶上，再看看其他烤箱。';
      }
    }
    function finish() {
      active.elapsedMs = active.durationMs; active.status = 'complete';
      if (active.events.some(e => !['hit', 'miss'].includes(e.outcome))) { abort('unpresented_events'); return; }
      if (phase === 'practice') { phase = 'practice_complete'; feedback = '练习结束，接下来做两段任务。'; active = null; }
      else if (blockIndex < plan.blocks.length - 1) { blockIndex++; phase = 'break'; feedback = '可以休息一下，准备好再继续。'; active = null; }
      else { phase = 'complete'; completedAt = new Date().toISOString(); feedback = '两段任务都完成了。'; active = null; }
      checkpoint(); emit();
      if (phase === 'complete' && options.onComplete) options.onComplete(result());
    }
    function tick(t = now()) {
      if (!active || !['practice', 'running'].includes(phase)) return state();
      if (!Number.isFinite(t) || t < lastFrame) { abort('clock_invalid'); return state(); }
      const gap = t - lastFrame; lastFrame = t;
      active.timing.maxFrameGapMs = Math.max(active.timing.maxFrameGapMs, gap);
      active.elapsedMs = Math.max(0, t - active.startedPerfMs);
      if (gap > 500 && !simulation) { abort('render_stall'); return state(); }
      closeMisses(t);
      for (const event of active.events) if (event.outcome === 'not_presented' && active.elapsedMs >= event.onsetMs) {
        if (active.events.some(other => other !== event && other.oven === event.oven && other.outcome === 'pending')) { abort('same_oven_overlap'); return state(); }
        event.outcome = 'pending'; event.actualOnsetMs = active.elapsedMs; event.actualOnsetPerfMs = t;
        event.delayMs = active.elapsedMs - event.onsetMs;
      }
      if (active.elapsedMs >= active.durationMs) finish();
      else if (t - lastCheckpoint >= 5000) checkpoint();
      return state();
    }
    function repeatPractice() {
      if (phase === 'practice_complete' || phase === 'block_intro') { startBlock(plan.practice, 'practice'); }
      return state();
    }
    function respond(number) {
      if (!active || !['practice', 'running'].includes(phase)) return null;
      const oven = Number(number) - 1;
      if (!Number.isInteger(oven) || oven < 0 || oven > 3) return null;
      const t = now();
      if (!Number.isFinite(t) || t < lastFrame || t < active.startedPerfMs) { abort('clock_invalid'); return null; }
      if (t - lastFrame > 500 && !simulation) { abort('render_stall'); return null; }
      active.elapsedMs = Math.max(0, t - active.startedPerfMs); closeMisses(t);
      const pending = active.events.filter(e => e.outcome === 'pending');
      const target = pending.find(e => e.oven === oven);
      const recentlyHit = active.events.find(e => e.oven === oven && e.outcome === 'hit' && t - e.actualOnsetPerfMs < e.windowMs);
      const kind = target ? 'hit' : recentlyHit ? 'double' : pending.length ? 'wrong' : 'early';
      const response = {
        trialId: `${runId}:${active.blockId}:r${active.responses.length + 1}`,
        atMs: t - active.startedPerfMs, atPerfMs: t, oven, kind,
        targetTrialId: target?.trialId || recentlyHit?.trialId || null, activeTrialIds: pending.map(e => e.trialId)
      };
      active.responses.push(response);
      if (target) {
        target.outcome = 'hit'; target.closed = true; target.responseMs = response.atMs;
        target.responsePerfMs = t; target.rtMs = t - target.actualOnsetPerfMs;
        target.closedAtMs = response.atMs;
        if (phase === 'practice') feedback = '取到了，继续看四台烤箱。';
      } else {
        active.falseAlarms.push(response);
        if (phase === 'practice') feedback = kind === 'double' ? '这盘已经取过了。' : '这台还没出炉，等文字出现再按。';
      }
      emit(); return copy(response);
    }
    function recordGaze(sample, geometry) {
      if (phase !== 'running' || !active) return;
      const receivedAt = now();
      // Keep the parent's performance-clock event time: a delayed message must
      // not move into the next bin (or into a newly started block). Only the
      // explicit simulation may omit a timestamp.
      const t = Number.isFinite(sample?.t) ? sample.t : simulation ? receivedAt : null;
      if (t === null || Math.abs(receivedAt - t) > 200) return;
      const elapsed = t - active.startedPerfMs;
      if (elapsed < 0 || elapsed >= active.durationMs) return;
      active.elapsedMs = Math.max(active.elapsedMs, receivedAt - active.startedPerfMs);
      const bin = Math.floor(elapsed / BIN_MS);
      const numeric = Number.isFinite(sample?.x) && Number.isFinite(sample?.y);
      const quality = numeric && sample.quality !== false && sample.valid !== false && sample.faceFresh !== false ;
      const oven = quality ? ovenAt(sample.x, sample.y) : -1;
      const row = { bin, tMs: elapsed, x: numeric ? sample.x : null, y: numeric ? sample.y : null, oven: oven >= 0 ? oven : null, quality, samples: 1, validSamples: quality ? 1 : 0 };
      const index = active.gazeBins.findIndex(item => item.bin === bin);
      if (index >= 0) {
        const old = active.gazeBins[index];
        if (quality || !old.quality) active.gazeBins[index] = { ...row, samples: old.samples + 1, validSamples: old.validSamples + (quality ? 1 : 0) };
        else { old.samples++; }
      } else active.gazeBins.push(row);
      active.geometry ||= geometry ? copy(geometry) : null;
    }
    function abort(reason = 'participant_stopped') {
      if (phase === 'complete' || phase === 'aborted' || phase === 'intro') return result();
      if (active) {
        active.elapsedMs = Math.max(0, Math.min(active.durationMs, now() - active.startedPerfMs));
        active.status = 'aborted';
        for (const event of active.events) if (event.outcome === 'pending') { event.outcome = 'aborted'; event.closed = true; }
      }
      phase = 'aborted'; abortReason = reason; feedback = '这一轮已停止，已保留做到这里的记录。';
      checkpoint(); emit(); return result();
    }
    function advanceTime(ms) {
      if (!simulation) return state();
      const end = virtualNow + Math.max(0, Math.min(Number(ms) || 0, 1000000));
      while (virtualNow < end) { virtualNow = Math.min(end, virtualNow + 10); tick(virtualNow); }
      emit(); return state();
    }
    reset();
    return { start, reset, repeatPractice, respond, abort, tick, recordGaze, advanceTime, getState: state, getResult: result, plan: copy(plan), now, generation: () => generation };
  }

  function mount(canvas, options = {}) {
    if (typeof HTMLCanvasElement === 'undefined' || !(canvas instanceof HTMLCanvasElement)) throw new TypeError('A canvas is required.');
    const ctx = canvas.getContext('2d');
    let destroyed = false, imageReady = false, imageFailed = false, raf = 0, lastNotify = 0, initialRect = null;
    const background = new Image();
    canvas.width = W; canvas.height = H; canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', '饼干别烤焦。看到出炉提示，按数字一至四，或点击对应烤箱。按 Escape 停止。');
    const session = createSession({ ...options, onState: options.onState });
    background.onload = () => { if (destroyed) return; imageReady = true; imageFailed = false; draw(); };
    background.onerror = () => { if (destroyed) return; imageFailed = true; draw(); };
    background.src = 'assets/bakery.png';
    function roundRect(x, y, w, h, radius = 12, fill = PAPER, stroke = INK, width = 2.5) {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    }
    function text(value, x, y, size = 20, color = INK, weight = 700, align = 'left') {
      ctx.fillStyle = color; ctx.font = `${weight} ${size}px ${FONT}`;
      ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(String(value), x, y);
    }
    function pill(label, x, y, w, fill, color = INK) {
      roundRect(x, y, w, 29, 14, fill, INK, 2); text(label, x + w / 2, y + 14.5, 14, color, 750, 'center');
    }
    function draw() {
      if (destroyed) return;
      const state = session.getState();
      const condition = CONDITIONS.find(row => row.id === state.condition);
      drawScene(ctx, imageReady ? background : null, { mapping: session.plan.mapping, condition: state.condition, activeOvens: state.activeOvens });
      drawOverlay(state, condition);
    }
    function drawOverlay(state, condition) {
      if (!['intro', 'practice_complete', 'block_intro', 'break', 'complete', 'aborted'].includes(state.phase)) return;
      ctx.fillStyle = '#39271580'; ctx.fillRect(0, 0, W, H);
      const x = 275, y = 140, w = 650, h = 365;
      roundRect(x + 8, y + 9, w, h, 22, INK, INK, 3); roundRect(x, y, w, h, 22, '#fff9e6', INK, 3.5);
      let label = '先练习'; let title = '四台烤箱，需要你同时照看';
      let body = ['出现“出炉了”，就按对应数字，或点击烤箱。', '几台可能同时出炉；漏掉的损失写在烤箱上。']; let action = '先练习 6 次';
      if (state.phase === 'practice_complete') { label = '练习结束'; title = '接下来做两段任务'; body = ['每段 1 分 25 秒，段与段之间可以休息。', '正式任务不显示得分，也不逐次提示对错。']; action = '看看第一段'; }
      if (state.phase === 'block_intro' || state.phase === 'break') {
        label = `第 ${state.block} / ${state.totalBlocks} 段`; title = condition.name;
        body = [condition.note, '出炉频率和漏单损失不变，只有边框提示不同。']; action = '准备好了，开始';
      }
      if (state.phase === 'complete') { label = '任务完成'; title = '谢谢你照看这些饼干'; body = ['两段任务的记录已保存在本机。', state.collectionMode === 'formal' ? '请按页面提示继续后续步骤。' : '这次是试运行，不计入正式被试数据。']; action = '回到开头'; }
      if (state.phase === 'aborted') { label = '已停止'; title = '这一轮已经结束'; body = ['窗口、页面或任务状态发生了变化。', '已保留部分记录；重新开始会建立新的一轮。']; action = '重新准备'; }
      pill(label, x + 245, y - 18, 160, YELLOW);
      text(title, x + w / 2, y + 70, 28, INK, 900, 'center');
      body.forEach((value, i) => text(value, x + w / 2, y + 128 + i * 37, 18, '#67583e', 550, 'center'));
      roundRect(465, 395, 270, 61, 11, RED, INK, 3); text(action, 600, 425.5, 20, '#fff', 850, 'center');
    }
    function start() {
      if (!imageReady) {
        options.onState?.({ ...session.getState(), message: imageFailed ? '画面加载失败，请返回后重试。' : '画面还在加载，请稍等片刻。' });
        return session.getState();
      }
      const state = session.start();
      if (['practice', 'running'].includes(state.phase)) initialRect = canvas.getBoundingClientRect().toJSON();
      draw(); canvas.focus({ preventScroll: true }); return state;
    }
    function respond(oven) { const response = session.respond(oven); draw(); return response; }
    function abort(reason) { const result = session.abort(reason); draw(); return result; }
    function pointFromEvent(event) {
      const r = canvas.getBoundingClientRect();
      return { x: (event.clientX - r.left) / r.width * W, y: (event.clientY - r.top) / r.height * H };
    }
    function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
    function onClick(event) {
      canvas.focus({ preventScroll: true }); const p = pointFromEvent(event), s = session.getState();
      if (['practice', 'running'].includes(s.phase)) { const oven = ovenAt(p.x, p.y); if (oven >= 0) respond(oven + 1); }
      else if (inRect(p, { x: 465, y: 395, w: 270, h: 61 })) start();
    }
    function onKey(event) {
      if (event.repeat) return;
      if (event.key === 'Escape') { event.preventDefault(); abort('participant_stopped'); return; }
      if (['Space', 'Enter'].includes(event.code) && !['running', 'practice'].includes(session.getState().phase)) { event.preventDefault(); start(); }
      if (/^[1-4]$/.test(event.key)) { event.preventDefault(); respond(Number(event.key)); }
    }
    function onHidden() { if (document.hidden) abort('page_hidden'); }
    function onResize() { if (['running', 'practice'].includes(session.getState().phase)) abort('viewport_resized'); }
    function recordGazeViewport(sample) {
      const r = canvas.getBoundingClientRect();
      const numeric = Number.isFinite(sample?.x) && Number.isFinite(sample?.y);
      const timely = Number.isFinite(sample?.t) && Math.abs(session.now() - sample.t) <= 200;
      const inViewport = numeric && sample.x >= 0 && sample.x <= 1 && sample.y >= 0 && sample.y <= 1;
      session.recordGaze({ x: numeric ? (sample.x * innerWidth - r.left) / r.width * W : null,
        y: numeric ? (sample.y * innerHeight - r.top) / r.height * H : null,
        t: sample?.t, quality: sample?.quality !== false && timely && inViewport, valid: sample?.valid, faceFresh: sample?.faceFresh },
        { left: r.left, top: r.top, width: r.width, height: r.height, viewportWidth: innerWidth, viewportHeight: innerHeight });
    }
    function frame(t) {
      if (destroyed) return;
      const before = session.getState();
      if (['running', 'practice'].includes(before.phase)) {
        const r = canvas.getBoundingClientRect();
        if (initialRect && ['left', 'top', 'width', 'height'].some(k => Math.abs(r[k] - initialRect[k]) > 2)) abort('canvas_geometry_changed');
        else { session.tick(session.now()); draw(); }
        if (t - lastNotify >= 150) { lastNotify = t; if (options.onState) options.onState(session.getState()); }
      }
      raf = requestAnimationFrame(frame);
    }
    function destroy() {
      if (destroyed) return;
      session.abort('left_experiment'); destroyed = true; cancelAnimationFrame(raf);
      canvas.removeEventListener('click', onClick); canvas.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHidden); global.removeEventListener('resize', onResize);
      background.onload = null; background.onerror = null;
    }
    canvas.addEventListener('click', onClick); canvas.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHidden); global.addEventListener('resize', onResize);
    draw(); raf = requestAnimationFrame(frame);
    return {
      start, repeatPractice: () => { const s = session.repeatPractice(); initialRect = canvas.getBoundingClientRect().toJSON(); draw(); return s; }, reset: () => { const s = session.reset(); draw(); return s; }, respond, abort, recordGazeViewport,
      advanceTime: ms => { const s = session.advanceTime(ms); draw(); return s; },
      getState: session.getState, getResult: session.getResult, getReadiness: () => ({ ready: imageReady, status: imageFailed ? 'error' : imageReady ? 'ready' : 'loading' }), destroy
    };
  }
  const api = { mount, createPlan, createSession, summarize, drawScene, ovenAt, layout: LAYOUT, conditions: CONDITIONS, ovens: OVENS, canvasSize: Object.freeze({ width: W, height: H }) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.AttentionSEEV = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
