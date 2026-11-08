(function () {
  "use strict";

  const minus = value => String(value).replace("-", "−");
  const signed = (value, digits = 2) => (value > 0 ? "+" : "") + minus(value.toFixed(digits));

  function forestChart() {
    const rows = [
      { label: "高价值漏取率", effect: -0.86, low: -3.60, high: 1.89, tone: "primary" },
      { label: "低价值漏取率", effect: 2.29, low: -1.07, high: 5.64, tone: "secondary" },
      { label: "整体漏取率", effect: 0.71, low: -1.58, high: 3.01, tone: "overall" }
    ];
    const min = -5;
    const max = 6;
    const left = 230;
    const right = 740;
    const width = right - left;
    const x = value => left + ((value - min) / (max - min)) * width;
    const ticks = [-4, -2, 0, 2, 4, 6];
    const grid = ticks.map(value => {
      const zero = value === 0;
      return `<line class="${zero ? "analysis-zero-line" : "analysis-grid-line"}" x1="${x(value)}" y1="54" x2="${x(value)}" y2="286"></line><text class="analysis-axis-label" x="${x(value)}" y="310" text-anchor="middle">${value > 0 ? "+" : ""}${minus(value)}</text>`;
    }).join("");
    const marks = rows.map((row, index) => {
      const y = 92 + index * 78;
      return [
        `<g class="analysis-forest-row analysis-forest-row--${row.tone}">`,
        `<text class="analysis-row-label" x="14" y="${y - 6}">${row.label}</text>`,
        `<text class="analysis-row-value" x="14" y="${y + 19}">${signed(row.effect)} pp</text>`,
        `<line class="analysis-ci-line" x1="${x(row.low)}" y1="${y}" x2="${x(row.high)}" y2="${y}"></line>`,
        `<line class="analysis-ci-cap" x1="${x(row.low)}" y1="${y - 8}" x2="${x(row.low)}" y2="${y + 8}"></line>`,
        `<line class="analysis-ci-cap" x1="${x(row.high)}" y1="${y - 8}" x2="${x(row.high)}" y2="${y + 8}"></line>`,
        `<circle class="analysis-effect-point" cx="${x(row.effect)}" cy="${y}" r="8"></circle>`,
        `</g>`
      ].join("");
    }).join("");
    return [
      `<div class="analysis-plot-scroll" role="region" aria-label="漏取率效应图，可横向滚动" tabindex="0"><svg class="analysis-svg analysis-forest-svg" role="img" aria-labelledby="analysis-forest-title analysis-forest-desc" viewBox="0 0 780 340">`,
      `<title id="analysis-forest-title">价值提示条件相对普通条件的漏取率变化</title>`,
      `<desc id="analysis-forest-desc">高价值、低价值和整体漏取率的参与者配对平均差及百分之九十五置信区间。三条区间均跨过零。</desc>`,
      `<text class="analysis-axis-caption" x="${left}" y="27">提示后漏取更少</text>`,
      `<text class="analysis-axis-caption" x="${right}" y="27" text-anchor="end">提示后漏取更多</text>`,
      grid, marks,
      `<line class="analysis-axis-line" x1="${left}" y1="286" x2="${right}" y2="286"></line>`,
      `<text class="analysis-axis-title" x="${(left + right) / 2}" y="336" text-anchor="middle">漏取率变化：价值提示 − 普通（百分点）</text>`,
      `</svg></div>`
    ].join("");
  }

  function interactionChart(config) {
    const left = 78;
    const right = 562;
    const top = 52;
    const bottom = 296;
    const xs = [148, 320, 492];
    const y = value => bottom - ((value - config.min) / (config.max - config.min)) * (bottom - top);
    const grid = config.ticks.map(value => `<line class="analysis-grid-line" x1="${left}" y1="${y(value)}" x2="${right}" y2="${y(value)}"></line><text class="analysis-axis-label" x="${left - 12}" y="${y(value) + 5}" text-anchor="end">${config.tick(value)}</text>`).join("");
    const xLabels = ["分离显示", "共框显示", "按任务组织"].map((label, index) => `<text class="analysis-axis-label" x="${xs[index]}" y="326" text-anchor="middle">${label}</text>`).join("");
    const line = values => values.map((value, index) => `${index ? "L" : "M"} ${xs[index]} ${y(value)}`).join(" ");
    const focusedMarks = config.focused.map((value, index) => `<circle class="analysis-point analysis-point--focused" cx="${xs[index]}" cy="${y(value)}" r="7"></circle><text class="analysis-value-label analysis-value-label--focused" x="${xs[index]}" y="${y(value) - 14}" text-anchor="middle">${config.label(value)}</text>`).join("");
    const comparisonMarks = config.comparison.map((value, index) => `<rect class="analysis-point analysis-point--comparison" x="${xs[index] - 7}" y="${y(value) - 7}" width="14" height="14"></rect><text class="analysis-value-label analysis-value-label--comparison" x="${xs[index]}" y="${y(value) + 25}" text-anchor="middle">${config.label(value)}</text>`).join("");
    const annotation = config.annotation ? `<g class="analysis-chart-annotation"><rect x="${config.annotation.x}" y="${config.annotation.y}" width="${config.annotation.width}" height="31"></rect><text x="${config.annotation.x + config.annotation.width / 2}" y="${config.annotation.y + 21}" text-anchor="middle">${config.annotation.text}</text></g>` : "";
    return [
      `<div class="analysis-plot-scroll" role="region" aria-label="${config.title}，可横向滚动" tabindex="0"><svg class="analysis-svg analysis-interaction-svg" role="img" aria-labelledby="${config.id}-title ${config.id}-desc" viewBox="0 0 620 370">`,
      `<title id="${config.id}-title">${config.title}</title>`,
      `<desc id="${config.id}-desc">${config.desc}</desc>`,
      grid,
      `<line class="analysis-axis-line" x1="${left}" y1="${top}" x2="${left}" y2="${bottom}"></line>`,
      `<line class="analysis-axis-line" x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}"></line>`,
      `<path class="analysis-series-line analysis-series-line--focused" d="${line(config.focused)}"></path>`,
      `<path class="analysis-series-line analysis-series-line--comparison" d="${line(config.comparison)}"></path>`,
      focusedMarks, comparisonMarks, annotation, xLabels,
      `<text class="analysis-axis-title" transform="translate(18 174) rotate(-90)" text-anchor="middle">${config.axisTitle}</text>`,
      `</svg></div>`
    ].join("");
  }

  function aoiMap(config) {
    const cells = config.values.map((value, index) => {
      const label = config.difference ? signed(value) + " pp" : value.toFixed(2) + "%";
      const arrow = config.difference ? `<span aria-hidden="true">${value > 0 ? "↑" : value < 0 ? "↓" : "→"}</span>` : "";
      return `<td style="--analysis-cell:${config.colors[index]};--analysis-cell-ink:${config.inks[index] || "var(--ink)"}"><strong>${label}</strong>${arrow}</td>`;
    });
    return [
      `<section class="analysis-aoi-figure" aria-labelledby="${config.id}-heading">`,
      `<h4 id="${config.id}-heading">${config.title}</h4>`,
      `<p>${config.subtitle}</p>`,
      `<table class="analysis-aoi-map" aria-label="${config.ariaLabel}">`,
        `<thead><tr><td></td><th scope="col">高价值</th><th scope="col">低价值</th></tr></thead>`,
        `<tbody><tr><th scope="row">高频</th>${cells[0]}${cells[1]}</tr><tr><th scope="row">低频</th>${cells[2]}${cells[3]}</tr></tbody>`,
      `</table>`,
      `<p class="analysis-outside">${config.outside}</p>`,
      `</section>`
    ].join("");
  }

  function render() {
    const accuracyChart = interactionChart({
      id: "analysis-pcp-accuracy",
      title: "三种显示下的正确率",
      desc: "单项题与比较题在分离、共框和按任务组织三种显示条件下的平均正确率。所有数值都在百分之九十以上。",
      min: 0, max: 100, ticks: [0, 25, 50, 75, 100],
      tick: value => value + "%", label: value => value.toFixed(2) + "%", axisTitle: "正确率",
      focused: [95.71, 93.57, 94.29], comparison: [90.71, 92.86, 90.71]
    });
    const rtChart = interactionChart({
      id: "analysis-pcp-rt",
      title: "三种显示下的正确反应时",
      desc: "单项题与比较题在三种显示条件下的平均正确反应时。比较题在共框条件下比分离条件下快一百五十七点五毫秒。",
      min: 1000, max: 1500, ticks: [1000, 1100, 1200, 1300, 1400, 1500],
      tick: value => value, label: value => value.toFixed(1), axisTitle: "正确反应时（ms）",
      focused: [1232.0, 1122.5, 1162.8], comparison: [1443.6, 1286.1, 1268.0],
      annotation: { x: 380, y: 8, width: 164, text: "比较题快 157.5 ms" }
    });
    const baselineMap = aoiMap({
      id: "analysis-aoi-baseline", title: "普通边框", subtitle: "baseline",
      ariaLabel: "普通边框条件的价值乘频率眼动区域占比矩阵",
      values: [27.50, 8.69, 23.39, 12.21],
      colors: ["#df6a28", "#fff0a7", "#ed862d", "#ffdd61"], inks: ["#181711", "#181711", "#181711", "#181711"],
      outside: "炉外有效眼动格：28.21%"
    });
    const cueMap = aoiMap({
      id: "analysis-aoi-cue", title: "价值提示边框", subtitle: "value_cue",
      ariaLabel: "价值提示条件的价值乘频率眼动区域占比矩阵",
      values: [25.03, 8.32, 24.41, 15.57],
      colors: ["#e37a2b", "#fff2b3", "#e77f2c", "#ffc937"], inks: ["#181711", "#181711", "#181711", "#181711"],
      outside: "炉外有效眼动格：26.67%"
    });
    const differenceMap = aoiMap({
      id: "analysis-aoi-difference", title: "提示 − 普通", subtitle: "百分点变化",
      ariaLabel: "价值提示条件减普通条件的眼动区域占比差值矩阵",
      values: [-2.47, -0.38, 1.03, 3.36], difference: true,
      colors: ["#b7d7c9", "#edf4ef", "#f9e9a5", "#efb63f"], inks: ["#181711", "#181711", "#181711", "#181711"],
      outside: "炉外变化：−1.54 pp"
    });

    return [
      `<article class="analysis-page" aria-labelledby="analysis-title">`,
      `<header class="analysis-hero">`,
        `<div class="analysis-hero-copy">`,
          `<p class="analysis-kicker">研究结果 · 数据快照 2026-11-08</p>`,
          `<h1 id="analysis-title">从 14 份完整匿名样本中，<br><span>我们看到了什么？</span></h1>`,
          `<p class="analysis-lead">价值提示没有显示出可靠的行为或眼动收益；果汁实验中，共框让比较判断更快，但没有出现邻近兼容原则所预测的任务特异性交互。</p>`,
        `</div>`,
        `<aside class="analysis-sample-ticket" aria-label="分析样本">`,
          `<span>分析样本</span><strong>行为 n=14</strong><strong>眼动 n=6</strong><small>统计单位均为参与者</small>`,
        `</aside>`,
      `</header>`,

      `<section class="analysis-summary" aria-labelledby="analysis-summary-title">`,
        `<div class="analysis-section-label"><span>先看结论</span><h2 id="analysis-summary-title">三个问题，三个回答</h2></div>`,
        `<ol class="analysis-verdict-list">`,
          `<li><span class="analysis-verdict-number">01</span><div><div class="analysis-verdict-heading"><h3>价值边框减少了高损失漏取吗？</h3><span class="analysis-status">假设未获支持</span></div><p>高价值漏取率从 3.14% 降至 2.29%，方向符合预测，但平均差只有 −0.86 个百分点，区间跨过零，不能排除抽样波动（95% CI [−3.60, 1.89]，p=.512）。</p></div></li>`,
          `<li><span class="analysis-verdict-number">02</span><div><div class="analysis-verdict-heading"><h3>视线更多落到高价值烤箱了吗？</h3><span class="analysis-status">机制未获支持</span></div><p>合格眼动样本中，高价值 AOI 占比从 50.89% 变为 49.44%，没有出现预期的注意转移（Δ=−1.44 pp，95% CI [−6.07, 3.19]，p=.460）。</p></div></li>`,
          `<li><span class="analysis-verdict-number">03</span><div><div class="analysis-verdict-heading"><h3>共框显示更适合比较判断吗？</h3><span class="analysis-status analysis-status--partial">局部方向一致</span></div><p>比较题中，共框比分离显示快 157.5 ms（p=.0067）；但单项题也有同方向差异，任务特异的 RT 交互不明显（p=.497），因此不能称为完整复现。</p></div></li>`,
        `</ol>`,
      `</section>`,

      `<section class="analysis-quality" aria-labelledby="analysis-quality-title">`,
        `<div class="analysis-section-label"><span>图 1</span><h2 id="analysis-quality-title">行为数据完整，眼动分析保留 6 个样本</h2></div>`,
        `<ol class="analysis-sample-flow" aria-label="眼动数据质量筛选过程">`,
          `<li><strong>14</strong><span>完整行为样本</span><small>两项实验均完成</small></li>`,
          `<li><strong>12</strong><span>有眼动验证记录</span><small>2 个样本缺少验证行</small></li>`,
          `<li><strong>8</strong><span>四个区域均通过</span><small>每区命中与覆盖均 ≥60%</small></li>`,
          `<li><strong>6</strong><span>进入眼动配对分析</span><small>两个任务区块也均合格</small></li>`,
        `</ol>`,
        `<div class="analysis-count-strip"><span><strong>1,400</strong> 个烤箱事件<small>1,355 命中 · 45 漏取 · 156 误按</small></span><span><strong>840</strong> 道果汁题<small>781 正确 · 53 错误 · 6 超时</small></span><span><strong>42.9%</strong> 眼动纳入率<small>6 / 14 个行为样本</small></span><span><strong>0</strong> 个表现排除<small>所有完整行为样本均纳入</small></span></div>`,
        `<p class="analysis-method-note">眼动门槛是本项目预先设定的工程质量规则。通过门槛表示数据适合做四个大区域的粗粒度比较，不代表实验室眼动仪级别的定位精度。</p>`,
      `</section>`,

      `<section class="analysis-section" aria-labelledby="analysis-seev-title">`,
        `<header class="analysis-section-head"><span>实验 01 · 烤箱</span><div><h2 id="analysis-seev-title">价值提示没有产生可靠的漏取改善</h2><p>参与者在普通边框和价值提示边框下各监控 50 个事件。主要指标是高价值事件漏取率，差值均按“价值提示 − 普通”计算。</p></div></header>`,
        `<div class="analysis-callout"><strong>主要判断</strong><p>高价值漏取的点估计向预测方向移动，但置信区间包含零且效应量小；当前数据不支持 H-S1。</p></div>`,
        `<figure class="analysis-figure" aria-labelledby="analysis-forest-caption">`,
          `<figcaption id="analysis-forest-caption"><span>图 2</span><div><strong>三项漏取率差异都仍可能由抽样波动解释</strong><small>圆点为 14 个匿名样本的平均配对差，横线为 95% t 置信区间；虚线为零差异。</small></div></figcaption>`,
          forestChart(),
        `</figure>`,
        `<div class="analysis-table-region" role="region" aria-labelledby="analysis-seev-table-title" tabindex="0">`,
          `<table class="analysis-table">`,
            `<caption id="analysis-seev-table-title"><span>表 1</span> 烤箱实验的描述统计与配对推断</caption>`,
            `<thead><tr><th scope="col">指标</th><th scope="col">普通 M (SD)</th><th scope="col">提示 M (SD)</th><th scope="col">平均差</th><th scope="col">95% CI</th><th scope="col">p</th><th scope="col">dz</th></tr></thead>`,
            `<tbody>`,
              `<tr class="analysis-primary-row"><th scope="row">高价值漏取率</th><td>3.14% (4.75%)</td><td>2.29% (2.58%)</td><td>−0.86 pp</td><td>[−3.60, 1.89]</td><td>.512</td><td>−.18</td></tr>`,
              `<tr><th scope="row">低价值漏取率</th><td>2.57% (2.53%)</td><td>4.86% (5.48%)</td><td>+2.29 pp</td><td>[−1.07, 5.64]</td><td>.165</td><td>.39</td></tr>`,
              `<tr><th scope="row">整体漏取率</th><td>2.86% (2.91%)</td><td>3.57% (2.95%)</td><td>+0.71 pp</td><td>[−1.58, 3.01]</td><td>.513</td><td>.18</td></tr>`,
              `<tr><th scope="row">加权漏单损失</th><td>4.57 (6.10)</td><td>4.07 (3.43)</td><td>−0.50</td><td>[−4.13, 3.13]</td><td>.771</td><td>−.08</td></tr>`,
              `<tr><th scope="row">正确命中 RT</th><td>724.8 (131.9) ms</td><td>712.1 (103.0) ms</td><td>−12.7 ms</td><td>[−59.3, 33.8]</td><td>.564</td><td>−.16</td></tr>`,
              `<tr><th scope="row">误按次数</th><td>5.29 (3.73)</td><td>5.86 (4.47)</td><td>+0.57</td><td>[−2.05, 3.19]</td><td>.645</td><td>.13</td></tr>`,
              `<tr><th scope="row">高价值 AOI 占比（n=6）</th><td>50.89% (17.30%)</td><td>49.44% (13.86%)</td><td>−1.44 pp</td><td>[−6.07, 3.19]</td><td>.460</td><td>−.33</td></tr>`,
            `</tbody>`,
          `</table>`,
        `</div>`,

        `<figure class="analysis-figure analysis-aoi-group" aria-labelledby="analysis-aoi-caption">`,
          `<figcaption id="analysis-aoi-caption"><span>图 3</span><div><strong>合格样本的价值 × 频率 AOI 注意分布（n=6）</strong><small>先按每人的烤箱含义对齐，再对参与者等权平均；每格分母是该条件的全部有效 100 ms 眼动格。</small></div></figcaption>`,
          `<div class="analysis-aoi-grid">${baselineMap}${cueMap}${differenceMap}</div>`,
          `<div class="analysis-aoi-legends" aria-label="热力矩阵色标"><div><span>占比低</span><i class="analysis-scale analysis-scale--sequential"></i><span>占比高（0–30%）</span></div><div><span>减少</span><i class="analysis-scale analysis-scale--difference"></i><span>增加（±4 pp）</span></div></div>`,
          `<div class="analysis-aoi-summary"><strong>高价值 AOI 合计</strong><span>50.89%</span><b aria-hidden="true">→</b><span>49.44%</span><em>Δ −1.44 pp · p=.460</em></div>`,
          `<p class="analysis-figure-note"><strong>怎样读：</strong>这是一张按任务含义重排的 AOI 汇总矩阵，不是四个烤箱的固定屏幕位置，也不是由原始坐标生成的连续注视点密度图。四格之和小于 100%，因为部分有效眼动格落在烤箱之外。</p>`,
        `</figure>`,
      `</section>`,

      `<section class="analysis-section" aria-labelledby="analysis-pcp-title">`,
        `<header class="analysis-section-head"><span>实验 02 · 果汁</span><div><h2 id="analysis-pcp-title">共框使比较判断更快，但没有形成预期交互</h2><p>每位参与者完成分离、共框和按任务组织三种显示；每种显示各有 10 道单项题和 10 道比较题。</p></div></header>`,
        `<div class="analysis-callout"><strong>主要判断</strong><p>按任务组织没有提高等权正确率（Δ=−0.71 pp，p=.710）。比较题中的共框速度优势在本样本中较明确，但任务特异交互不明确，因此只构成对 PCP 的局部方向性支持。</p></div>`,
        `<div class="analysis-figure-grid">`,
          `<figure class="analysis-figure" aria-labelledby="analysis-accuracy-caption"><figcaption id="analysis-accuracy-caption"><span>图 4</span><div><strong>正确率整体很高，三种显示差异很小</strong><small>纵轴从 0% 开始；圆点实线为单项题，方点虚线为比较题。</small></div></figcaption><div class="analysis-series-key"><span class="analysis-key-focused">● 单项判断</span><span class="analysis-key-comparison">■ 比较判断</span></div>${accuracyChart}</figure>`,
          `<figure class="analysis-figure" aria-labelledby="analysis-rt-caption"><figcaption id="analysis-rt-caption"><span>图 5</span><div><strong>比较题中，共框比分离显示快 157.5 ms</strong><small>只统计正确反应；反应时纵轴为 1000–1500 ms。</small></div></figcaption><div class="analysis-series-key"><span class="analysis-key-focused">● 单项判断</span><span class="analysis-key-comparison">■ 比较判断</span></div>${rtChart}</figure>`,
        `</div>`,
        `<div class="analysis-table-region" role="region" aria-labelledby="analysis-pcp-table-title" tabindex="0">`,
          `<table class="analysis-table">`,
            `<caption id="analysis-pcp-table-title"><span>表 2</span> 果汁实验六个条件单元的描述统计</caption>`,
            `<thead><tr><th scope="col">显示方式</th><th scope="col">任务</th><th scope="col">正确率 M (SD)</th><th scope="col">正确 RT M (SD)</th><th scope="col">超时率 M (SD)</th></tr></thead>`,
            `<tbody>`,
              `<tr><th scope="row">分离显示</th><td>单项</td><td>95.71% (6.46%)</td><td>1232.0 (243.3) ms</td><td>0.71% (2.67%)</td></tr>`,
              `<tr><th scope="row">分离显示</th><td>比较</td><td>90.71% (10.72%)</td><td>1443.6 (301.6) ms</td><td>1.43% (3.63%)</td></tr>`,
              `<tr><th scope="row">共框显示</th><td>单项</td><td>93.57% (8.42%)</td><td>1122.5 (207.6) ms</td><td>0.00% (0.00%)</td></tr>`,
              `<tr><th scope="row">共框显示</th><td>比较</td><td>92.86% (7.26%)</td><td>1286.1 (270.9) ms</td><td>1.43% (3.63%)</td></tr>`,
              `<tr><th scope="row">按任务组织</th><td>单项</td><td>94.29% (7.56%)</td><td>1162.8 (264.2) ms</td><td>0.71% (2.67%)</td></tr>`,
              `<tr><th scope="row">按任务组织</th><td>比较</td><td>90.71% (9.17%)</td><td>1268.0 (279.9) ms</td><td>0.00% (0.00%)</td></tr>`,
            `</tbody>`,
          `</table>`,
        `</div>`,
        `<div class="analysis-inference-grid" aria-label="果汁实验关键推断结果">`,
          `<article><span>主要改进假设 H-P1</span><strong>−0.71 pp</strong><p>按任务正确率 − 两种固定显示平均<br>95% CI [−4.77, 3.35] · p=.710 · dz=−.10</p></article>`,
          `<article class="analysis-inference-highlight"><span>比较题的简单效应</span><strong>−157.5 ms</strong><p>共框 − 分离<br>95% CI [−263.1, −51.9] · p=.0067 · dz=−.86</p></article>`,
          `<article><span>任务特异 RT 交互</span><strong>+48.0 ms</strong><p>比较题共框速度收益 − 单项题共框速度收益<br>95% CI [−100.4, 196.4] · p=.497 · dz=.19</p></article>`,
        `</div>`,
        `<details class="analysis-details"><summary>查看重复测量 ANOVA 与顺序敏感性分析</summary><div><p>正确率没有明显的显示主效应，F(2,26)=0.080，p=.924，ηp²=.006；任务主效应为 F(1,13)=1.988，p=.182，ηp²=.133；显示×任务交互为 F(2,26)=0.634，p=.538，ηp²=.047。</p><p>正确 RT 有显示主效应，F<sub>GG</sub>(1.95,25.32)=5.717，p=.009，ηp²=.305；比较题总体比单项题慢 160.1 ms，F(1,13)=33.616，p&lt;.001，ηp²=.721。显示×任务交互为 F(2,26)=1.239，p=.306，ηp²=.087。</p><p>区块顺序并不完全平衡。事后线性顺序校正后，比较题中分离显示仍比共框慢 133.9 ms（95% CI [23.8, 244.0]，p=.021）；这一模型属于敏感性分析，依赖线性练习趋势假定。</p></div></details>`,
      `</section>`,

      `<section class="analysis-section analysis-interpretation" aria-labelledby="analysis-interpretation-title">`,
        `<header class="analysis-section-head"><span>结论与边界</span><div><h2 id="analysis-interpretation-title">结果支持到哪里，就说到哪里</h2><p>“假设未获支持”表示当前样本没有提供足够证据，不等于证明真实效应严格为零。</p></div></header>`,
        `<div class="analysis-interpretation-grid">`,
          `<article><h3>这些数据允许我们说</h3><ul><li>价值边框没有显示出稳定的高价值漏取改善，眼动也没有显示预期的高价值 AOI 转移。</li><li>比较题中的共框速度优势与“需要整合的信息靠得更近”的方向一致，并在事后顺序校正中保留。</li><li>按任务组织没有获得额外的正确率或整体速度收益；H-S1 与 H-P1 均未获支持。</li></ul></article>`,
          `<article><h3>这些数据不能证明</h3><ul><li>不能把未显著结果解释为设计绝对无效，也不能把一个简单效应称为完整复现 PCP。</li><li>不能由 AOI 汇总推断精确注视点、扫视路径或因果性的注意机制。</li><li>不能把厨房网页中的结果直接推广到驾驶、工业监控等安全关键场景。</li></ul></article>`,
        `</div>`,
        `<div class="analysis-limitations"><h3>解释结果时要同时看到的限制</h3><ul><li><strong>样本较小：</strong>行为 n=14，眼动 n=6，多项置信区间仍然较宽。</li><li><strong>表现接近天花板：</strong>烤箱总命中率约 96.8%，果汁总正确率约 93.0%，留给改进的空间有限。</li><li><strong>眼动较粗：</strong>普通摄像头 WebGazer 适合大区域分类；服务器不含原始坐标，不能重新识别注视事件。</li><li><strong>顺序不完全平衡：</strong>烤箱条件顺序为 10:4，果汁显示顺序也不均衡，条件差异可能混入练习或疲劳。</li><li><strong>操作包含多个变化：</strong>共框同时改变距离与对象化；按任务单项显示同时改变布局和视觉突出，无法单独估计每个视觉特征。</li><li><strong>研究情境简化：</strong>本实验是对 SEEV 与 PCP 机制的网页改编，不是原研究的逐项复制。</li></ul></div>`,
        `<p class="analysis-source-note">分析以匿名编号代表的参与者为统计单位，置信区间基于参与者内配对差。导出文件本身不能独立核实不同编号是否一定对应不同真人。次要与探索性检验未作多重比较校正。完整设计、统计方法和参考文献见项目 README。</p>`,
      `</section>`,
      `</article>`
    ].join("");
  }

  window.AttentionAnalysis = Object.freeze({ render });
})();
