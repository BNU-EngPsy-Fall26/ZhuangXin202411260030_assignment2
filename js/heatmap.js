/* Descriptive webcam-gaze density plots. No fixation detection or missing-data imputation. */
(function (global) {
  'use strict';
  const WIDTH = 1200, HEIGHT = 640, BIN_MS = 100, MIN_COVERAGE = 0.6;
  const CONDITIONS = [
    { id: 'baseline', title: '普通界面' },
    { id: 'value_cue', title: '价值提示' }
  ];
  const OVENS = [
    { x: 201, y: 57, w: 296, h: 222 }, { x: 501, y: 57, w: 296, h: 222 },
    { x: 201, y: 283, w: 296, h: 222 }, { x: 501, y: 283, w: 296, h: 222 }
  ];
  const PALETTE = [
    [49, 107, 170], [34, 164, 164], [117, 185, 107], [245, 218, 80], [237, 139, 61], [209, 60, 48]
  ];
  function calibrationPassed(report) {
    if (report?.quality?.passed === false) return false;
    return report?.quality?.passed === true || report?.quality?.usable === true || report?.usableForInference === true;
  }
  function resultReason(result) {
    if (!result) return '还没有烤箱实验的眼动记录。完成设备检查和烤箱任务后，再来查看。';
    if (!['seev_bakery_stage2', 'seev_bakery_stage3', 'seev_bakery_v1', 'test_seev_bakery_v1'].includes(result.experiment)) return '这里仅显示烤箱实验的眼动记录。果汁实验不采集眼动。';
    if (result.status !== 'complete' || result.completed !== true || result.aborted === true) return '这轮烤箱任务没有完整完成，因此不生成热图。部分记录仍可导出。';
    if (!calibrationPassed(result.gazeValidation)) return '这轮眼动没有通过校准检查，因此不生成热图；操作记录仍会按实际情况保留。';
    return null;
  }
  function blockReason(block) {
    if (!block) return '没有这一显示条件的记录。';
    if (block.status !== 'complete') return '这一段任务没有完整完成，因此不生成热图。';
    if (!Number.isFinite(block.elapsedMs) || block.elapsedMs <= 0) return '这一段缺少有效时长，无法计算可比较的密度。';
    if (block.quality?.gazeValidated !== true) return '这一段没有通过眼动校准检查，因此不生成热图。';
    if (!Number.isFinite(block.quality?.sampleCoverage) || block.quality.sampleCoverage < MIN_COVERAGE || block.quality.usableForInference !== true) {
      return '这一段的有效眼动覆盖不足，或未通过质量检查，因此不生成热图。有效覆盖需达到本项目采用的 60% 筛选要求。';
    }
    if (!Array.isArray(block.gazeBins) || !block.gazeBins.length) return '这一段没有实际眼动采样，不能生成热图。';
    return null;
  }
  function validPoints(block, binMs = BIN_MS) {
    const bins = new Map();
    const excluded = { invalid: 0, stale: 0, outside: 0, duplicate: 0, badTime: 0 };
    const period = Number.isFinite(binMs) && binMs > 0 ? binMs : BIN_MS;
    for (const row of block?.gazeBins || []) {
      if (row?.quality !== true || row.valid === false || row.faceFresh === false || !Number.isFinite(row.x) || !Number.isFinite(row.y)) { excluded.invalid++; continue; }
      if (row.stale === true || [row.ageMs, row.sampleAgeMs, row.latencyMs].some(value => Number.isFinite(value) && Math.abs(value) > 200)) { excluded.stale++; continue; }
      if (!Number.isInteger(row.bin) || row.bin < 0 || !Number.isFinite(row.tMs) || row.tMs < 0 || row.tMs >= block.elapsedMs ||
          (Number.isFinite(block.durationMs) && row.tMs >= block.durationMs) || Math.floor(row.tMs / period) !== row.bin) { excluded.badTime++; continue; }
      const old = bins.get(row.bin);
      if (old) { excluded.duplicate++; if (old.tMs > row.tMs) continue; }
      bins.set(row.bin, { bin: row.bin, tMs: row.tMs, x: row.x, y: row.y });
    }
    const trackedValidBins = bins.size;
    const points = Array.from(bins.values()).filter(row => {
      if (row.x < 0 || row.x >= WIDTH || row.y < 0 || row.y >= HEIGHT) { excluded.outside++; return false; }
      return true;
    }).sort((a, b) => a.bin - b.bin);
    return { points, excluded, trackedValidBins };
  }
  function densityForBlock(block, options = {}) {
    const cellSize = options.cellSize === 20 ? 20 : 16;
    const sigmaPx = Number.isFinite(options.sigmaPx) && options.sigmaPx >= 8 && options.sigmaPx <= 80 ? options.sigmaPx : 32;
    const columns = Math.ceil(WIDTH / cellSize), rows = Math.ceil(HEIGHT / cellSize);
    const { points, excluded, trackedValidBins } = validPoints(block, options.binMs);
    const grid = new Float64Array(columns * rows), sigma = sigmaPx / cellSize, radius = Math.ceil(sigma * 3);
    const seconds = Number.isFinite(block?.elapsedMs) && block.elapsedMs > 0 ? block.elapsedMs / 1000 : 0;
    if (!seconds) return { grid, points: [], excluded, trackedValidBins, columns, rows, cellSize, sigmaPx, max: 0, seconds: 0, units: 'valid_points_per_second_per_cell' };
    for (const point of points) {
      const cx = point.x / cellSize - 0.5, cy = point.y / cellSize - 0.5, weights = [];
      let totalWeight = 0;
      for (let y = Math.max(0, Math.floor(cy) - radius); y <= Math.min(rows - 1, Math.ceil(cy) + radius); y++) {
        for (let x = Math.max(0, Math.floor(cx) - radius); x <= Math.min(columns - 1, Math.ceil(cx) + radius); x++) {
          const weight = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma ** 2));
          weights.push([y * columns + x, weight]); totalWeight += weight;
        }
      }
      // Each actual, deduplicated 100 ms-bin estimate contributes 1 / seconds.
      // Gaussian weights sum to one, including at scene edges; no points are filled in.
      for (const [index, weight] of weights) grid[index] += weight / totalWeight / seconds;
    }
    let max = 0; for (const value of grid) max = Math.max(max, value);
    return { grid, points, excluded, trackedValidBins, columns, rows, cellSize, sigmaPx, max, seconds, units: 'valid_points_per_second_per_cell' };
  }
  function buildDensity(result, options = {}) {
    const globalReason = resultReason(result);
    const conditionDefs = CONDITIONS.slice();
    // Old stage-2 records can retain their extra condition without mixing it into a new run.
    if (result?.blocks?.some(block => block.conditionId === 'frequency_cue')) conditionDefs.push({ id: 'frequency_cue', title: '频率提示（旧版）' });
    const panels = conditionDefs.map(condition => {
      const block = result?.blocks?.find(item => item.conditionId === condition.id);
      let reason = globalReason || blockReason(block);
      let density = null, observedCoverage = null;
      if (!reason) {
        density = densityForBlock(block, { ...options, binMs: result?.plan?.gazeBinMs || BIN_MS });
        observedCoverage = density.trackedValidBins / Math.ceil(block.elapsedMs / (result?.plan?.gazeBinMs || BIN_MS));
        if (observedCoverage < MIN_COVERAGE) { reason = '现有有效采样覆盖不足 60%，不生成热图。若导出的记录只含汇总信息，请回到保存了完整本地数据的设备查看。'; density = null; }
        else if (!density.points.length || density.max <= 0) { reason = '这一段没有可绘制的有效场景内估计点，因此不生成热图。'; density = null; }
      }
      return { ...condition, available: !reason, reason, density, coverage: observedCoverage ?? block?.quality?.sampleCoverage ?? null, elapsedMs: block?.elapsedMs ?? null };
    });
    const max = panels.reduce((value, panel) => Math.max(value, panel.density?.max || 0), 0);
    return {
      width: WIDTH, height: HEIGHT, panels, max, simulation: result?.simulation === true,
      mapping: result?.plan?.mapping || [], runId: result?.runId || null,
      units: 'valid_points_per_second_per_cell', normalization: 'Each condition is divided by its own elapsed seconds; one shared color maximum across all available conditions.',
      noInference: 'Descriptive estimated-gaze density; not fixation detection or evidence of improvement.'
    };
  }
  function colorForValue(value, max) {
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(max) || max <= 0) return [0, 0, 0, 0];
    const ratio = Math.max(0, Math.min(1, value / max)), position = ratio * (PALETTE.length - 1);
    const lower = Math.floor(position), upper = Math.min(PALETTE.length - 1, lower + 1), mix = position - lower;
    const rgb = PALETTE[lower].map((channel, i) => Math.round(channel + (PALETTE[upper][i] - channel) * mix));
    return [...rgb, Math.round((0.10 + 0.67 * Math.sqrt(ratio)) * 255)];
  }
  function mount(container, result) {
    if (!container?.appendChild || !container.ownerDocument) throw new TypeError('A DOM container is required.');
    const doc = container.ownerDocument, model = buildDensity(result);
    let selected = Math.max(0, model.panels.findIndex(panel => panel.available)), destroyed = false, loaded = false;
    const root = doc.createElement('section'); root.className = 'attention-heatmap heatmap-panel';
    const style = doc.createElement('style'); style.textContent = `
      .attention-heatmap{color:#29251f;font:inherit;margin:24px 0;padding:22px;border:2px solid #29251f;background:#fff9e7;border-radius:14px}
      .attention-heatmap [hidden]{display:none!important}
      .attention-heatmap h2{font-size:1.3rem;margin:0 0 12px}.attention-heatmap p{line-height:1.7;margin:10px 0}
      .attention-heatmap .heatmap-control{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:18px 0}
      .attention-heatmap button{font:inherit;padding:9px 14px;border:2px solid #29251f;border-radius:8px;background:#fff9e7;color:#29251f;cursor:pointer}
      .attention-heatmap button[aria-pressed=true]{background:#ffdc3f;font-weight:700}.attention-heatmap button:focus-visible{outline:3px solid #276d6a;outline-offset:3px}
      .attention-heatmap button:disabled{opacity:.5;cursor:not-allowed}.attention-heatmap .heatmap-canvas{display:block;width:100%;height:auto;max-width:1200px;border:1px solid #d3c7ab;border-radius:8px}
      .attention-heatmap .heatmap-empty{padding:24px;background:#f4ecd8;border:1px dashed #9c8b6a;border-radius:8px}
      .attention-heatmap .heatmap-legend{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0;font-size:.9rem}
      .attention-heatmap .heatmap-gradient{height:16px;width:220px;max-width:42vw;border:1px solid #8e8167;background:linear-gradient(90deg,#316baa,#22a4a4,#75b96b,#f5da50,#ed8b3d,#d13c30)}
      .attention-heatmap .heatmap-method{margin:14px 0;color:#655942;font-size:.9rem}.attention-heatmap .heatmap-method summary{cursor:pointer;font-weight:600;padding:6px 0}.attention-heatmap .heatmap-method summary:focus-visible{outline:3px solid #276d6a;outline-offset:3px}
      .attention-heatmap .heatmap-note{font-size:.9rem;color:#655942}.attention-heatmap .heatmap-simulation{display:inline-block;background:#ffe2d5;color:#843a20;font-weight:700;padding:6px 10px;border:1px solid #b75c34;border-radius:6px}
    `;
    root.appendChild(style);
    const element = (tag, className, text) => { const item = doc.createElement(tag); if (className) item.className = className; if (text) item.textContent = text; return item; };
    root.appendChild(element('h2', '', '你看向了哪里'));
    root.appendChild(element('p', '', '颜色越暖，表示视线在附近出现得越多。这里只显示烤箱任务。'));
    if (model.simulation) root.appendChild(element('p', 'heatmap-simulation', '模拟数据 · 仅用于检查页面，不是被试结果'));
    const controls = element('div', 'heatmap-control'); controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', '选择显示条件');
    const buttons = model.panels.map((panel, index) => {
      const button = element('button', '', panel.title); button.type = 'button'; button.addEventListener('click', () => { selected = index; render(); }); controls.appendChild(button); return button;
    });
    root.appendChild(controls);
    const grid = element('div', 'heatmap-grid'), canvas = element('canvas', 'heatmap-canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d'), empty = element('p', 'heatmap-empty'), summary = element('p', 'heatmap-note');
    summary.setAttribute('role', 'status'); grid.append(canvas, empty, summary); root.appendChild(grid);
    const legend = element('div', 'heatmap-legend');
    legend.append(element('span', '', '低'), element('span', 'heatmap-gradient'), element('span', '', '高'));
    const legendText = element('span', ''); legend.appendChild(legendText); root.appendChild(legend);
    root.appendChild(element('p', 'heatmap-note', '摄像头只能估计大致位置，热图不能单独说明哪种界面更好。'));
    const methods = element('details', 'heatmap-method');
    methods.appendChild(element('summary', '', '热图如何计算'));
    const numericLegend = element('p', ''); methods.appendChild(numericLegend);
    methods.appendChild(element('p', '', '每 100 毫秒最多保留一个有效估计点，剔除无效、过期和场景外的点，不补造缺失记录。密度除以本段实际秒数，两个条件使用相同色标，任务时长不同时也能比较。'));
    methods.appendChild(element('p', '', '画布为 1200 × 640 逻辑像素，网格为 16 × 16 像素，并使用高斯平滑（标准差 32 像素）呈现分布。这里没有识别精确注视点。浅色不代表完全没看过，透明处表示没有可绘制的点。'));
    methods.appendChild(element('p', '', '果汁任务不采集眼动，因此没有对应热图。'));
    root.appendChild(methods);
    const download = element('button', '', '下载当前条件图片'); download.type = 'button'; download.addEventListener('click', () => { downloadCurrent(); });
    const actions = element('div', 'heatmap-control'), status = element('p', 'heatmap-note'); status.setAttribute('role', 'status'); actions.appendChild(download); root.append(actions, status);
    container.appendChild(root);
    const background = new global.Image(); background.onload = () => { loaded = true; if (!destroyed) render(); };
    background.onerror = () => { if (!destroyed) { status.textContent = '场景图片暂未加载，热图仍使用原实验的坐标。'; render(); } };
    background.src = 'assets/bakery.png';
    function text(value, x, y, size = 18, color = '#29251f', align = 'left', weight = 600) {
      ctx.font = `${weight} ${size}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
    }
    function box(x, y, w, h, fill, stroke = '#29251f', lineWidth = 2, radius = 8) {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
    }
    function scene(panel) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.fillStyle = '#ffedb1'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      if (loaded) ctx.drawImage(background, 0, 0, 960, HEIGHT);
      ctx.fillStyle = '#fff9e7'; ctx.fillRect(960, 0, 240, HEIGHT);
      ctx.strokeStyle = '#29251f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(960, 0); ctx.lineTo(960, HEIGHT); ctx.stroke();
      text('饼干别烤焦', 979, 83, 28, '#29251f', 'left', 900); text(panel.title, 979, 122, 17, '#725e42');
      ['看到“出炉了”', '按对应数字键。', '', '几台同时出炉时，', '可以依次取出。', '', '尽量少漏掉重要订单。'].forEach((line, i) => { if (line) text(line, 979, 187 + i * 25, i < 2 ? 19 : 16); });
      text('键盘操作', 979, 414, 15, '#725e42');
      [1, 2, 3, 4].forEach((number, i) => { box(979 + i * 50, 438, 39, 37, '#ffdf65'); text(String(number), 998.5 + i * 50, 456.5, 18, '#29251f', 'center', 800); });
      box(978, 511, 203, 86, '#ffedb1'); text('保持坐姿，', 993, 539, 16); text('请继续看四台烤箱。', 993, 566, 16);
      OVENS.forEach((oven, index) => {
        const factor = model.mapping.find(row => row.oven === index);
        const emphasis = panel.id === 'value_cue' && factor?.value === 'high' || panel.id === 'frequency_cue' && factor?.frequency === 'high';
        if (emphasis) { box(oven.x + 3, oven.y + 3, oven.w - 6, oven.h - 6, null, '#fff9e7', 10, 24); box(oven.x + 3, oven.y + 3, oven.w - 6, oven.h - 6, null, '#276d6a', 6, 24); }
        box(oven.x + 9, oven.y + 56, 31, 29, '#fff7df'); text(String(index + 1), oven.x + 24.5, oven.y + 70.5, 17, '#29251f', 'center', 850);
        if (factor) {
          box(oven.x + 47, oven.y + 55, 90, 29, '#fff7df'); text(factor.frequency === 'high' ? '常出炉' : '较少出炉', oven.x + 92, oven.y + 69.5, 14, '#725e42', 'center');
          box(oven.x + 143, oven.y + 55, 88, 29, '#fff7df'); text(factor.value === 'high' ? '漏掉 −5' : '漏掉 −1', oven.x + 187, oven.y + 69.5, 14, '#725e42', 'center');
        }
      });
      const density = panel.density, layer = doc.createElement('canvas'); layer.width = density.columns; layer.height = density.rows;
      const layerCtx = layer.getContext('2d'), pixels = layerCtx.createImageData(density.columns, density.rows);
      for (let i = 0; i < density.grid.length; i++) pixels.data.set(colorForValue(density.grid[i], model.max), i * 4);
      layerCtx.putImageData(pixels, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(layer, 0, 0, WIDTH, HEIGHT);
      if (model.simulation) { box(325, 588, 550, 37, '#fff1d7', '#a94b29'); text('模拟数据 · 仅用于检查页面', 600, 607, 21, '#843a20', 'center', 850); }
    }
    function render() {
      if (destroyed) return;
      const panel = model.panels[selected]; buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === selected)));
      canvas.hidden = !panel.available; empty.hidden = panel.available; legend.hidden = !panel.available; download.disabled = !panel.available || !loaded;
      if (!panel.available) { ctx.clearRect(0, 0, WIDTH, HEIGHT); empty.textContent = panel.reason; summary.textContent = ''; numericLegend.textContent = '当前条件没有可显示的热图。'; return; }
      canvas.setAttribute('aria-label', `${panel.title}的摄像头估计视线分布，${panel.density.points.length} 个有效场景内估计点。`);
      scene(panel);
      summary.textContent = `本段 ${Math.round(panel.elapsedMs / 1000)} 秒，可用眼动记录覆盖 ${Math.round(panel.coverage * 100)}%。`;
      legendText.textContent = model.panels.length > 2 ? '各条件使用相同色标' : '两个条件使用相同色标';
      numericLegend.textContent = `当前条件有 ${panel.density.points.length} 个场景内有效估计点。统一色标范围：0 — ${model.max.toPrecision(3)} 有效点 / 秒 / 网格。`;
    }
    async function downloadCurrent() {
      const panel = model.panels[selected]; if (destroyed || !panel.available) return false;
      if (!loaded) { status.textContent = '场景图片还未加载完成，请稍后再下载。'; return false; }
      try {
        const output = doc.createElement('canvas'); output.width = WIDTH; output.height = HEIGHT + 205;
        const out = output.getContext('2d'); out.fillStyle = '#fff9e7'; out.fillRect(0, 0, output.width, output.height); out.drawImage(canvas, 0, 0);
        out.fillStyle = '#29251f'; out.font = '700 24px "PingFang SC",system-ui,sans-serif';
        out.fillText(`注意厨房 · ${panel.title} · ${model.simulation ? '模拟数据' : '摄像头眼动估计'}`, 30, HEIGHT + 40);
        const gradient = out.createLinearGradient(30, 0, 320, 0); PALETTE.forEach((rgb, i) => gradient.addColorStop(i / (PALETTE.length - 1), `rgb(${rgb.join(',')})`));
        out.fillStyle = gradient; out.fillRect(30, HEIGHT + 61, 290, 18); out.fillStyle = '#29251f'; out.font = '17px "PingFang SC",system-ui,sans-serif';
        out.fillText(`0 — ${model.max.toPrecision(3)} 有效点 / 秒 / 网格；所有条件共用色标`, 340, HEIGHT + 77);
        out.fillText(`${Math.round(panel.elapsedMs / 1000)} 秒；覆盖 ${Math.round(panel.coverage * 100)}%；${panel.density.points.length} 个绘图点；不补造缺失记录`, 30, HEIGHT + 111);
        out.fillText('每 100 ms 保留至多 1 个有效点；按任务秒数归一；16 × 16 像素网格；高斯平滑 σ = 32 像素', 30, HEIGHT + 143);
        out.fillText('描述性视线估计，不是精确注视点或改进效果的证据。果汁实验不采眼动。', 30, HEIGHT + 176);
        const blob = await new Promise((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error('empty_image')), 'image/png'));
        if (destroyed) return false;
        const url = global.URL.createObjectURL(blob), link = doc.createElement('a'); link.href = url; link.download = `注意厨房_眼动分布_${panel.id}${model.simulation ? '_模拟' : ''}.png`; link.click();
        global.setTimeout(() => global.URL.revokeObjectURL(url), 1000); status.textContent = '图片已生成，包含条件名称、统一色标和说明。'; return true;
      } catch (_) { status.textContent = '图片暂时无法下载。请通过「启动预览」打开网页后重试。'; return false; }
    }
    render();
    return { destroy() { destroyed = true; background.onload = null; background.onerror = null; root.remove(); }, getDensity: () => model, downloadCurrent };
  }
  const api = { mount, buildDensity, densityForBlock, validPoints, colorForValue, canvasSize: Object.freeze({ width: WIDTH, height: HEIGHT }) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.AttentionHeatmap = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
