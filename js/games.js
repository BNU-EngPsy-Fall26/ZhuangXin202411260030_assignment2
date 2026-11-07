/*
 * Two interactive previews. These are practice scenes, not research trials.
 * Timing/state are kept separate from drawing so the eventual experiments can
 * replace the demo schedule without changing the visual language.
 */
(function () {
  'use strict';

  const W = 1200;
  const H = 640;
  const INK = '#29251f';
  const CREAM = '#fff8df';
  const YELLOW = '#ffdb3e';
  const RED = '#d9412f';
  const FONT = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  const BAKERY_TARGETS = [1, 3, 0, 2, 3, 1];
  const JUICE_ORDERS = [
    { sweet: 7, sour: 3, task: 'compare' },
    { sweet: 4, sour: 8, task: 'compare' },
    { sweet: 8, sour: 2, task: 'single' },
    { sweet: 3, sour: 7, task: 'single' },
    { sweet: 6, sour: 8, task: 'compare' },
    { sweet: 6, sour: 4, task: 'single' }
  ];
  // Same-sized areas, aligned with the four ovens in the original illustration.
  const OVENS = [
    { x: 201, y: 57, w: 296, h: 222 },
    { x: 501, y: 57, w: 296, h: 222 },
    { x: 201, y: 283, w: 296, h: 222 },
    { x: 501, y: 283, w: 296, h: 222 }
  ];

  function mount(canvas, type, options = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('A canvas is required.');
    if (!['bakery', 'juice'].includes(type)) throw new TypeError('Unknown preview.');
    const ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', type === 'bakery'
      ? '饼干别烤焦游戏。按空格开始，用数字一到四取出对应烤箱的饼干，也可以点击烤箱。'
      : '果汁调配游戏。按空格开始，读懂题目后按 F 选是，按 J 选不是，也可以点击答案。');
    let destroyed = false;
    let raf = 0;
    let lastFrame = performance.now();
    let lastNotify = -1000;
    let hover = null;
    let imageReady = false;
    let state;
    const background = new Image();
    background.onload = () => { imageReady = true; if (!destroyed) draw(); };
    background.src = `assets/${type}.png`;

    function roundRect(x, y, w, h, radius = 16, fill = CREAM, stroke = INK, width = 3) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    }

    function line(x1, y1, x2, y2, color = INK, width = 3) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
    }

    function ellipse(x, y, rx, ry, fill, stroke = INK, width = 3) {
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    }

    function text(value, x, y, size = 22, color = INK, weight = 700, align = 'left') {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${FONT}`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(String(value), x, y);
    }

    function pill(label, x, y, w, color = CREAM, textColor = INK, size = 18) {
      roundRect(x, y, w, 36, 18, color, INK, 2.5);
      text(label, x + w / 2, y + 18, size, textColor, 750, 'center');
    }

    function button(label, rect, keyLabel, color = RED, isHovered = false) {
      const lift = isHovered ? 2 : 0;
      roundRect(rect.x + 5, rect.y + 6, rect.w, rect.h, 12, INK, INK, 2);
      roundRect(rect.x, rect.y - lift, rect.w, rect.h, 12, color, INK, 3);
      text(label, rect.x + rect.w / 2 - (keyLabel ? 16 : 0), rect.y + rect.h / 2 - lift, 23,
        color === RED ? '#fffdf3' : INK, 800, 'center');
      if (keyLabel) {
        roundRect(rect.x + rect.w - 47, rect.y + (rect.h - 29) / 2 - lift, 29, 29, 6,
          color === RED ? '#fff8df' : '#ffed94', INK, 2);
        text(keyLabel, rect.x + rect.w - 32.5, rect.y + rect.h / 2 - lift, 16, INK, 850, 'center');
      }
    }

    function star(x, y, r, fill = YELLOW) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const d = i % 2 ? r * 0.45 : r;
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d;
        if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    }

    function chick(x, y, scale = 1, apron = true) {
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
      ellipse(0, 56, 57, 10, '#695c4233', null);
      line(-18, 44, -25, 59, '#d08029', 7);
      line(18, 44, 25, 59, '#d08029', 7);
      ellipse(0, 5, 46, 49, '#ffdb3e', INK, 3.5);
      ellipse(-42, 17, 13, 24, '#ffcf36', INK, 3);
      ellipse(42, 17, 13, 24, '#ffcf36', INK, 3);
      if (apron) {
        roundRect(-27, 9, 54, 41, [4, 4, 16, 16], '#fcf5db', INK, 2.5);
        line(-24, 12, -30, -9, INK, 2.5); line(24, 12, 30, -9, INK, 2.5);
        roundRect(-12, 22, 24, 17, 3, '#ffb7a3', INK, 2);
      }
      ellipse(-14, -8, 4.5, 6, INK, null); ellipse(14, -8, 4.5, 6, INK, null);
      ellipse(-25, 3, 8, 4.5, '#e99c62', null); ellipse(25, 3, 8, 4.5, '#e99c62', null);
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.lineTo(0, 9); ctx.closePath();
      ctx.fillStyle = '#ed8a30'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      // The little baker's hat is intentionally part of the world, not a UI icon.
      roundRect(-31, -57, 62, 24, 8, '#fffdf5', INK, 3);
      ellipse(-22, -60, 19, 15, '#fffdf5', INK, 3);
      ellipse(0, -66, 21, 18, '#fffdf5', INK, 3);
      ellipse(22, -60, 19, 15, '#fffdf5', INK, 3);
      roundRect(-28, -54, 56, 20, 5, '#fffdf5', INK, 2.5);
      ctx.restore();
    }

    function cookie(x, y, size = 1, baked = true) {
      ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
      ellipse(0, 5, 31, 9, '#20181244', null);
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) {
        const a = i / 32 * Math.PI * 2;
        const r = 29 + (i % 2 ? 1.6 : -0.6);
        if (!i) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.81);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.81);
      }
      ctx.closePath(); ctx.fillStyle = baked ? '#e9ac56' : '#f1d999'; ctx.fill();
      ctx.strokeStyle = '#633d29'; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -3, 23, 16, 0, Math.PI, Math.PI * 1.8);
      ctx.strokeStyle = baked ? '#f8d58c' : '#fff0c0'; ctx.lineWidth = 3.5; ctx.stroke();
      const chips = [[-12, -10, 4], [11, -10, 3.6], [1, 3, 4.6], [-16, 7, 3], [17, 8, 3.7], [0, -16, 2.3]];
      for (const [cx, cy, r] of chips) {
        ctx.beginPath(); ctx.moveTo(cx - r, cy + r * 0.65); ctx.lineTo(cx + r * 0.2, cy - r);
        ctx.lineTo(cx + r, cy + r * 0.6); ctx.closePath(); ctx.fillStyle = '#61412e'; ctx.fill();
      }
      ctx.restore();
    }

    function coverImage() {
      if (!imageReady) return;
      const scale = Math.max(W / background.naturalWidth, H / background.naturalHeight);
      const iw = background.naturalWidth * scale;
      const ih = background.naturalHeight * scale;
      ctx.drawImage(background, (W - iw) / 2, (H - ih) / 2, iw, ih);
      ctx.fillStyle = type === 'bakery' ? '#fff2c69c' : '#fff5ce8a';
      ctx.fillRect(0, 0, W, H);
    }

    function backdrop() {
      ctx.fillStyle = '#f5dfad'; ctx.fillRect(0, 0, W, H);
      // Painted shop tiles and striped canvas awning retain character offline.
      ctx.fillStyle = '#fff5d7'; ctx.fillRect(0, 60, W, 468);
      ctx.strokeStyle = '#dbc99d'; ctx.lineWidth = 1.5;
      for (let x = 0; x < W; x += 68) { ctx.beginPath(); ctx.moveTo(x, 62); ctx.lineTo(x, 530); ctx.stroke(); }
      for (let y = 62; y < 530; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      for (let x = 0; x < W; x += 100) {
        roundRect(x - 1, -16, 102, 91, [0, 0, 20, 20], x % 200 ? '#fff8df' : '#ffcf39', INK, 2.5);
      }
      coverImage();
      ctx.fillStyle = '#e6b780'; ctx.fillRect(0, 581, W, 59);
      line(0, 583, W, 583, '#6a4a30', 4);
      line(0, 595, W, 595, '#f8d7a4', 3);
      for (let x = 0; x < W; x += 175) line(x, 598, x - 25, 640, '#bc8b5b', 1.5);
      // A clean sign is stable across all rounds; the scene never flashes.
      roundRect(28, 20, 1144, 86, 16, '#fff9e8', INK, 3);
      pill('试玩', 46, 45, 64, YELLOW, INK, 17);
      text(type === 'bakery' ? '饼干别烤焦' : '果汁调配师', 127, 62, 30, INK, 900);
      text(type === 'bakery' ? '看好四台烤箱，熟了就取出来。' : '看清这杯的要求，再决定怎么做。', 312, 63, 21, '#645a43', 550);
      text(`${Math.min(state.round + 1, 6)} / 6`, 1097, 62, 22, INK, 800, 'center');
    }

    function oven(index) {
      const box = OVENS[index];
      const x = box.x, y = box.y, w = box.w, h = box.h;
      const isTarget = BAKERY_TARGETS[state.round] === index;
      const active = state.phase === 'playing';
      const progress = ovenProgress(index);
      const ready = active && isTarget && state.roundMs >= 2250;
      const collected = state.phase === 'feedback' && state.lastCorrect && isTarget;
      const isHover = hover === `oven-${index}` && active;
      // Cast feet/shadow, enamel casing, inset glass and a real tray.
      roundRect(x + 9, y + h - 8, w - 18, 19, 7, '#513b2d', INK, 2);
      roundRect(x + 5, y + 6, w, h, 19, '#6c452a', INK, 3);
      roundRect(x, y, w, h, 19, isHover ? '#ffe26b' : '#ffc94b', INK, 3.5);
      roundRect(x + 8, y + 8, w - 16, h - 16, 14, null, '#ffe998', 3);
      roundRect(x + 15, y + 45, w - 30, 126, 13, '#4e3b32', INK, 3);
      const glass = ctx.createLinearGradient(x, y + 47, x, y + 165);
      glass.addColorStop(0, '#7f5a42'); glass.addColorStop(1, ready ? '#bd793f' : '#61442f');
      roundRect(x + 22, y + 52, w - 44, 111, 8, glass, '#a77d50', 2);
      ctx.save();
      ctx.beginPath(); ctx.roundRect(x + 22, y + 52, w - 44, 111, 8); ctx.clip();
      // Glass reflection stays in the same place: it does not compete for attention.
      ctx.fillStyle = '#fff9d112';
      ctx.beginPath(); ctx.moveTo(x + 34, y + 52); ctx.lineTo(x + 77, y + 52);
      ctx.lineTo(x + 35, y + 163); ctx.lineTo(x + 22, y + 163); ctx.closePath(); ctx.fill();
      roundRect(x + 44, y + 132, w - 88, 17, 6, '#a6a598', '#353432', 2.5);
      line(x + 54, y + 135, x + w - 54, y + 135, '#dcd9c6', 2);
      if (!collected) {
        cookie(x + 90, y + 118, 0.88, progress > 0.8);
        cookie(x + 167, y + 110, 0.92, progress > 0.8);
        cookie(x + 246, y + 119, 0.88, progress > 0.8);
      } else {
        text('已取出', x + w / 2, y + 109, 24, '#fff1c3', 800, 'center');
      }
      ctx.restore();
      roundRect(x + 119, y + 49, 98, 9, 4.5, '#c6c4b9', INK, 2);
      for (const dx of [127, 209]) line(x + dx, y + 48, x + dx, y + 59, INK, 2.5);
      roundRect(x + 17, y + 12, 34, 27, 6, CREAM, INK, 2.2);
      text(index + 1, x + 34, y + 26, 18, INK, 850, 'center');
      text(`${index + 1} 号烤箱`, x + 65, y + 27, 17, INK, 750);
      ellipse(x + w - 30, y + 26, 11, 11, '#f8f3db', INK, 2);
      line(x + w - 30, y + 26, x + w - 25, y + 20, INK, 2.5);
      ellipse(x + w - 56, y + 26, 5.5, 5.5, ready ? '#eb5c34' : '#8d7847', INK, 1.5);
      roundRect(x + 21, y + 181, 168, 10, 5, '#a87b33', INK, 1.5);
      roundRect(x + 23, y + 183, Math.max(4, 164 * progress), 6, 3, ready ? '#ec6e35' : '#fff2b0', null);
      text(collected ? '取好啦' : ready ? '烤好了！' : '烘烤中', x + 256, y + 185, 16,
        ready ? '#9b341f' : '#57472e', ready ? 900 : 600, 'center');
    }

    function bakeryNotes() {
      const x = 786;
      roundRect(x + 5, 142, 370, 338, 12, '#8e6940', INK, 3);
      roundRect(x, 136, 370, 338, 12, '#fffaf0', INK, 3);
      roundRect(x + 108, 124, 152, 32, 8, '#b8b5a2', INK, 3);
      line(x + 123, 137, x + 246, 137, '#e8e6d6', 2);
      text('小店的烤制指南', x + 185, 190, 24, INK, 850, 'center');
      line(x + 27, 217, x + 343, 217, '#cfbea2', 2);
      text('1', x + 31, 249, 19, RED, 900);
      text('四台烤箱都会慢慢烤。', x + 61, 249, 20, INK, 550);
      text('2', x + 31, 289, 19, RED, 900);
      text('看到“烤好了”，就取出。', x + 61, 289, 20, INK, 550);
      text('3', x + 31, 329, 19, RED, 900);
      text('按对应数字，或点烤箱。', x + 61, 329, 20, INK, 550);
      line(x + 27, 355, x + 343, 355, '#cfbea2', 2);
      text('已取出', x + 31, 391, 18, '#6f6048', 600);
      text(`${state.score} 盘`, x + 31, 426, 32, INK, 900);
      const label = state.phase === 'playing' ? '这一盘，留意一下' : state.phase === 'feedback' ? '稍等，准备下一盘' : '先玩 6 盘，熟悉一下';
      text(label, x + 338, 423, 17, '#6f6048', 600, 'right');
      chick(1087, 552, 0.7);
      roundRect(778, 495, 239, 65, 13, '#fff9e4', INK, 2.5);
      text(state.phase === 'feedback'
        ? state.lastCorrect ? '刚刚好，真香！' : '别急，接着来。'
        : state.phase === 'playing' && state.messageUntil > state.elapsed
          ? '还没好，再等一等。' : '出炉后记得及时取哦。', 897, 527, 18, INK, 650, 'center');
    }

    function drawBakery() {
      if (!imageReady) {
        backdrop();
        for (let i = 0; i < 4; i++) oven(i);
        bakeryNotes();
        return;
      }
      // The painting is the scene, with live state placed on its physical ovens.
      // Preserve its aspect ratio; the narrow right-hand order slip holds guidance.
      ctx.drawImage(background, 0, 0, 960, H);
      ctx.fillStyle = '#fff9e7'; ctx.fillRect(960, 0, 240, H);
      line(960, 0, 960, H, INK, 4);
      pill('试玩', 979, 23, 67, YELLOW, INK, 17);
      text('饼干别烤焦', 981, 88, 30, INK, 900);
      text('帮小黄看好四台烤箱', 981, 128, 17, '#746348', 550);
      line(981, 157, 1179, 157, '#d3c19b', 2);
      text('看到“烤好了”，', 981, 191, 20, INK, 650);
      text('就把饼干取出来。', 981, 222, 20, INK, 650);
      text('按对应的数字键，', 981, 273, 18, '#746348', 550);
      text('也可以直接点烤箱。', 981, 301, 18, '#746348', 550);
      for (let i = 0; i < 4; i++) {
        roundRect(981 + i * 49, 331, 39, 36, 6, '#ffdf65', INK, 2);
        text(i + 1, 1000.5 + i * 49, 349, 18, INK, 850, 'center');
      }
      line(981, 399, 1179, 399, '#d3c19b', 2);
      text('已取出', 981, 435, 18, '#746348', 650);
      text(`${state.score} 盘`, 981, 477, 36, INK, 900);
      pill(`${Math.min(state.round + 1, 6)} / 6`, 1101, 451, 75, '#fff1be', INK, 17);
      const notice = state.phase === 'feedback'
        ? state.lastCorrect ? ['刚刚好，真香！', '准备下一盘。'] : ['这盘没来得及取。', '下一盘继续！']
        : state.messageUntil > state.elapsed
          ? ['还没烤好，', '再等一等。'] : ['先试玩 6 盘，', '熟悉一下怎么操作。'];
      roundRect(979, 530, 201, 84, 11, '#ffedb1', INK, 2);
      text(notice[0], 994, 555, 17, INK, 650);
      text(notice[1], 994, 583, 17, '#746348', 550);

      for (let i = 0; i < OVENS.length; i++) {
        const b = OVENS[i];
        const progress = ovenProgress(i);
        const ready = state.phase === 'playing' && BAKERY_TARGETS[state.round] === i && state.roundMs >= 2250;
        const collected = state.phase === 'feedback' && state.lastCorrect && BAKERY_TARGETS[state.round] === i;
        if (hover === `oven-${i}` && state.phase === 'playing') {
          roundRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6, 30, null, '#fff7b7', 4);
        }
        // Key plates sit on the enamel, leaving the painted cookies fully visible.
        roundRect(b.x + 9, b.y + 55, 31, 29, 6, '#fff7df', '#684226', 2.4);
        text(i + 1, b.x + 24.5, b.y + 69.5, 18, INK, 900, 'center');
        roundRect(b.x + 63, b.y + 190, 169, 19, 8, '#76512c', '#5a391f', 2);
        roundRect(b.x + 67, b.y + 194, 161 * progress, 11, 5, ready ? '#ffb84b' : '#f9d98a', null);
        if (ready) {
          // A stable readiness sign, never a flashing alarm.
          roundRect(b.x + 80, b.y + 129, 143, 36, 9, '#fff1b1', '#5a391f', 2.5);
          text('烤好了，取出！', b.x + 151.5, b.y + 147, 18, '#773b1f', 900, 'center');
        } else if (collected) {
          const interior = ctx.createLinearGradient(b.x, b.y + 84, b.x, b.y + 187);
          interior.addColorStop(0, '#62402e'); interior.addColorStop(0.45, '#9a693b'); interior.addColorStop(1, '#513725');
          roundRect(b.x + 26, b.y + 84, 244, 103, 13, interior, '#a27b48', 2);
          line(b.x + 38, b.y + 156, b.x + 257, b.y + 156, '#b69363', 2);
          const metal = ctx.createLinearGradient(b.x, b.y + 164, b.x, b.y + 178);
          metal.addColorStop(0, '#d0c3a2'); metal.addColorStop(0.5, '#b4a588'); metal.addColorStop(1, '#7c6d53');
          roundRect(b.x + 42, b.y + 164, 212, 14, 5, metal, '#51412f', 2);
          text('这盘取好啦', b.x + 148, b.y + 127, 23, '#ffedb2', 800, 'center');
        }
      }
    }

    function fruit(x, y, kind, scale = 1) {
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
      if (kind === 'strawberry') {
        ctx.beginPath(); ctx.moveTo(0, 22); ctx.bezierCurveTo(-38, -3, -27, -27, -9, -19);
        ctx.bezierCurveTo(-2, -26, 5, -26, 11, -19); ctx.bezierCurveTo(29, -25, 33, -1, 0, 22);
        ctx.fillStyle = '#f17361'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.3; ctx.stroke();
        for (const [a, b] of [[-13, -8], [8, -9], [-7, 3], [10, 3], [0, 13]]) line(a, b, a - 1, b + 3, '#ffe4a4', 2);
        ctx.beginPath(); ctx.moveTo(-17, -20); ctx.lineTo(-5, -23); ctx.lineTo(-1, -34);
        ctx.lineTo(6, -23); ctx.lineTo(20, -22); ctx.lineTo(7, -15); ctx.lineTo(-6, -15); ctx.closePath();
        ctx.fillStyle = '#7ba766'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      } else {
        ctx.save(); ctx.rotate(-0.25);
        ellipse(0, 0, 26, 19, '#ffdc45', INK, 2.5);
        ctx.beginPath(); ctx.ellipse(-4, -4, 17, 10, 0, Math.PI, Math.PI * 1.7);
        ctx.strokeStyle = '#fff39a'; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
        line(21, -8, 30, -17, '#668447', 3);
        ellipse(31, -18, 10, 4, '#83a663', INK, 1.5);
      }
      ctx.restore();
    }

    function dispenser(x, y, value, kind, label) {
      const fill = kind === 'strawberry' ? '#ed927a' : '#f2cf48';
      // Rounded enamel shoulders, a glass tank, ten tick marks, and a brass tap.
      roundRect(x + 8, y + 12, 211, 228, 29, '#69492f', INK, 3);
      roundRect(x, y, 211, 230, 29, kind === 'strawberry' ? '#f7b6a1' : '#ffe17b', INK, 3.5);
      roundRect(x + 20, y + 18, 171, 159, 16, '#fff9e8', INK, 3);
      ctx.save(); ctx.beginPath(); ctx.roundRect(x + 24, y + 22, 163, 151, 12); ctx.clip();
      const liquidY = y + 168 - value * 13;
      ctx.fillStyle = fill; ctx.fillRect(x + 24, liquidY, 163, y + 173 - liquidY);
      ellipse(x + 105, liquidY, 81, 6, kind === 'strawberry' ? '#f7b8a1' : '#ffed87', null);
      ctx.fillStyle = '#ffffff4a'; ctx.fillRect(x + 32, y + 30, 13, 132);
      // Fixed markings are the information source, with an explicit reading.
      for (let i = 0; i <= 10; i++) {
        const yy = y + 168 - i * 13;
        line(x + 144, yy, x + (i % 5 === 0 ? 174 : 163), yy, '#675b43', 1.7);
        if (i % 5 === 0) text(i, x + 135, yy, 11, '#53432d', 650, 'right');
      }
      fruit(x + 86, y + 95, kind, 1.12);
      ctx.restore();
      roundRect(x + 24, y + 185, 163, 31, 9, '#fff8df', INK, 2.5);
      text(`${label}  ${value} 格`, x + 105, y + 201, 20, INK, 850, 'center');
      // Faucet and the tray underneath read as an actual juice shop appliance.
      roundRect(x + 88, y + 223, 36, 20, 6, '#bdb39a', INK, 2.5);
      roundRect(x + 99, y + 235, 18, 22, 4, '#ded1af', INK, 2.5);
      line(x + 105, y + 220, x + 105, y + 210, INK, 4);
    }

    function cup(x, y, filled = false) {
      ctx.save(); ctx.translate(x, y);
      ellipse(0, 60, 60, 10, '#48362722', null);
      ctx.beginPath(); ctx.moveTo(-47, -40); ctx.lineTo(47, -40);
      ctx.lineTo(36, 56); ctx.quadraticCurveTo(0, 68, -36, 56); ctx.closePath();
      ctx.fillStyle = '#fff9dd'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      if (filled) {
        ctx.save(); ctx.beginPath(); ctx.moveTo(-43, -35); ctx.lineTo(43, -35);
        ctx.lineTo(33, 53); ctx.quadraticCurveTo(0, 61, -33, 53); ctx.closePath(); ctx.clip();
        ctx.fillStyle = '#f5b36a'; ctx.fillRect(-44, -22, 88, 84);
        ctx.fillStyle = '#ffcc8d'; ctx.fillRect(-44, -22, 88, 10); ctx.restore();
      }
      roundRect(-45, -3, 90, 35, 3, YELLOW, INK, 2);
      ellipse(-11, 12, 3, 4, INK, null); ellipse(11, 12, 3, 4, INK, null);
      ctx.beginPath(); ctx.arc(0, 14, 7, 0.1, Math.PI - 0.1); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      line(19, -36, 29, -82, '#c65340', 7);
      line(29, -82, 52, -86, '#c65340', 7);
      ellipse(0, -40, 47, 8, '#fff7d3', INK, 2.5);
      ctx.restore();
    }

    function juiceTask() {
      const order = JUICE_ORDERS[Math.min(state.round, 5)];
      const query = order.task === 'compare' ? '这杯果汁的甜度，比酸度高吗？' : '只看甜度：这杯的甜度达到 6 格了吗？';
      roundRect(63, 125, 1074, 85, 14, '#fffaf0', INK, 3);
      pill(order.task === 'compare' ? '比较两边' : '只看一边', 82, 149, 123,
        order.task === 'compare' ? '#d5e7c2' : '#ffe295', INK, 18);
      text(query, 230, 167, 25, INK, 800);
    }

    function drawJuiceFallback() {
      backdrop(); juiceTask();
      // Counter with a scalloped shop sign and two matched, readable dispensers.
      roundRect(245, 229, 706, 303, 30, '#8a583b', INK, 3.5);
      roundRect(237, 220, 706, 299, 30, '#ffda63', INK, 3.5);
      roundRect(252, 234, 676, 271, 22, '#fff0bc', '#d4a24b', 2.5);
      const order = JUICE_ORDERS[Math.min(state.round, 5)];
      dispenser(279, 239, order.sweet, 'strawberry', '甜度');
      dispenser(685, 239, order.sour, 'lemon', '酸度');
      roundRect(509, 254, 157, 36, 18, '#fffaf0', INK, 2);
      text('小黄的果汁铺', 587, 272, 16, INK, 750, 'center');
      cup(586, 388, state.phase === 'feedback');
      // A tiny display reports progress without looking like an arbitrary score HUD.
      roundRect(531, 463, 111, 31, 6, '#544936', INK, 2);
      text(`做好 ${state.score} 杯`, 586, 479, 17, '#fff0b9', 750, 'center');
      chick(123, 411, 1.13);
      roundRect(31, 240, 173, 83, 15, '#fffaf0', INK, 2.5);
      text('先看题目，', 117, 266, 20, INK, 650, 'center');
      text('再看刻度。', 117, 294, 20, INK, 650, 'center');
      // Fruit crate on the right creates a scene while staying outside task AOIs.
      roundRect(981, 389, 174, 100, 8, '#dca66d', INK, 3);
      for (let i = 0; i < 3; i++) line(990, 411 + i * 26, 1146, 411 + i * 26, '#ad7a48', 3);
      fruit(1009, 383, 'lemon', 0.77); fruit(1052, 382, 'strawberry', 0.84);
      fruit(1090, 388, 'lemon', 0.82); fruit(1131, 383, 'strawberry', 0.78);
      roundRect(1005, 438, 127, 31, 5, '#fff1cf', INK, 2);
      text('今日新鲜到店', 1069, 454, 15, INK, 750, 'center');
      const yes = { x: 278, y: 547, w: 286, h: 59 };
      const no = { x: 616, y: 547, w: 286, h: 59 };
      button('是', yes, 'F', RED, hover === 'yes');
      button('不是', no, 'J', '#fff9e4', hover === 'no');
      if (state.phase === 'feedback') {
        roundRect(300, 455, 586, 61, 12, state.lastCorrect ? '#e5efce' : '#fff1d1', INK, 3);
        text(state.message, 593, 485, 21, INK, 750, 'center');
      }
    }

    function paintedDial(x, y, value, label, color) {
      ellipse(x + 2, y + 3, 44, 44, '#7c542e', '#573a26', 2);
      const rim = ctx.createRadialGradient(x - 14, y - 15, 1, x, y, 44);
      rim.addColorStop(0, '#ffeaa3'); rim.addColorStop(0.73, '#e1b45b'); rim.addColorStop(1, '#a06b2e');
      ellipse(x, y, 43, 43, rim, '#72502c', 2);
      ellipse(x, y, 35, 35, '#fff2d0', '#9e773e', 2);
      for (let i = 0; i <= 10; i++) {
        const angle = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
        const inner = i % 5 === 0 ? 25 : 28;
        line(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner,
          x + Math.cos(angle) * 32, y + Math.sin(angle) * 32, '#745b36', i % 5 === 0 ? 2 : 1.5);
      }
      const a = Math.PI * 0.75 + (value / 10) * Math.PI * 1.5;
      line(x, y, x + Math.cos(a) * 27, y + Math.sin(a) * 27, color, 4);
      ellipse(x, y, 5, 5, color, '#744126', 1.5);
      roundRect(x - 70, y + 63, 140, 35, 8, '#fff9e5', '#805733', 2.5);
      text(`${label}  ${value} 格`, x, y + 80.5, 21, '#463923', 850, 'center');
    }

    function drawJuice() {
      if (!imageReady) { drawJuiceFallback(); return; }
      // Keep the shopkeeper, fruit and hand-painted machine visible. The coded
      // dials occupy the illustration's original dials; the counter holds the order.
      ctx.drawImage(background, 0, -55, 1200, 800);
      pill('试玩', 27, 24, 67, YELLOW, INK, 17);
      roundRect(993, 19, 181, 41, 10, '#fff8df', '#62452e', 2.5);
      text(`第 ${Math.min(state.round + 1, 6)} / 6 杯`, 1083, 40, 20, INK, 800, 'center');
      const order = JUICE_ORDERS[Math.min(state.round, 5)];
      paintedDial(448, 264, order.sweet, '甜度', '#b9533e');
      paintedDial(704, 264, order.sour, '酸度', '#a77724');
      ctx.save(); ctx.translate(570, 290); ctx.scale(0.70, 0.70);
      cup(0, 0, state.phase === 'feedback'); ctx.restore();
      roundRect(222, 420, 758, 86, 12, '#fff9e8', '#795432', 2.5);
      pill(order.task === 'compare' ? '比较两边' : '只看一边', 242, 443, 121,
        order.task === 'compare' ? '#e4ebbd' : '#ffe39b', INK, 17);
      const query = order.task === 'compare' ? '这杯的甜度，比酸度高吗？' : '只看甜度：达到 6 格了吗？';
      text(query, 391, 463, 25, '#3e3425', 850);
      const yes = { x: 298, y: 540, w: 271, h: 58 };
      const no = { x: 629, y: 540, w: 271, h: 58 };
      button('是', yes, 'F', RED, hover === 'yes');
      button('不是', no, 'J', '#fff9e4', hover === 'no');
      if (state.phase === 'feedback') {
        roundRect(222, 420, 758, 86, 12, state.lastCorrect ? '#eaf0d2' : '#fff0cc', '#795432', 2.5);
        text(state.message, 601, 463, 23, '#463923', 750, 'center');
      }
    }

    function overlay() {
      if (!['intro', 'complete'].includes(state.phase)) return;
      ctx.fillStyle = '#39271573'; ctx.fillRect(0, 0, W, H);
      const x = 325, y = 197;
      roundRect(x + 8, y + 9, 550, 291, 22, INK, INK, 3);
      roundRect(x, y, 550, 291, 22, '#fff9e6', INK, 3.5);
      pill(state.phase === 'intro' ? '操作演示' : '试玩完成', x + 204, y - 18, 142, YELLOW, INK, 19);
      if (state.phase === 'intro') {
        text(type === 'bakery' ? '帮小黄看一会儿烤箱' : '帮小黄做好这杯果汁', 600, y + 58, 30, INK, 850, 'center');
        text(type === 'bakery' ? '烤好了，按对应数字或点一下烤箱。' : '每一杯要求不同，先看题目再选答案。', 600, y + 111, 21, '#67583e', 550, 'center');
        text('这次只试玩，不会上传实验数据。', 600, y + 148, 18, '#796d57', 550, 'center');
        button('开始试玩', { x: 465, y: y + 190, w: 270, h: 61 }, null, RED, hover === 'start');
      } else {
        star(600, y + 53, 26);
        text(type === 'bakery' ? `取出了 ${state.score} / 6 盘饼干` : `做对了 ${state.score} / 6 杯果汁`, 600, y + 107, 30, INK, 850, 'center');
        text('这次试玩已结束，没有上传实验数据。', 600, y + 151, 19, '#67583e', 550, 'center');
        button('再玩一次', { x: 465, y: y + 190, w: 270, h: 61 }, null, RED, hover === 'start');
      }
    }

    function draw() {
      if (destroyed) return;
      ctx.clearRect(0, 0, W, H);
      ctx.lineJoin = 'round';
      if (type === 'bakery') drawBakery(); else drawJuice();
      overlay();
    }

    function ovenProgress(index) {
      if (state.phase === 'intro' || state.phase === 'complete') return [0.38, 0.7, 0.52, 0.23][index];
      const target = BAKERY_TARGETS[state.round] === index;
      const p = target ? Math.min(1, 0.3 + state.roundMs / 2250 * 0.7)
        : Math.min(0.88, 0.11 + ((index + state.round) % 4) * 0.13 + state.roundMs / 12000);
      return p;
    }

    function getState() {
      const result = {
        type, phase: state.phase, preview: true, uploads: false,
        score: state.score, round: Math.min(state.round + 1, 6), totalRounds: 6,
        elapsedMs: Math.round(state.elapsed), roundMs: Math.round(state.roundMs),
        message: state.message, errors: state.errors, missed: state.missed,
        coordinates: 'Canvas 1200×640; origin top left; x right, y down.'
      };
      if (type === 'bakery') {
        result.controls = 'Start: Space or click. Collect: 1, 2, 3, 4 or click oven.';
        result.ovens = OVENS.map((b, i) => ({
          id: i + 1, ...b, progress: Number(ovenProgress(i).toFixed(3)),
          ready: state.phase === 'playing' && BAKERY_TARGETS[state.round] === i && state.roundMs >= 2250
        }));
      } else {
        result.controls = 'Start: Space or click. Yes: F. No: J. Both are also clickable.';
        result.order = { ...JUICE_ORDERS[Math.min(state.round, 5)] };
        result.question = result.order.task === 'compare'
          ? '甜度比酸度高吗？' : '甜度达到 6 格了吗？';
      }
      return result;
    }

    function notify(force = false) {
      if (force || state.elapsed - lastNotify >= 150) {
        lastNotify = state.elapsed;
        if (typeof options.onState === 'function') options.onState(getState());
      }
    }

    function reset() {
      state = { phase: 'intro', round: 0, score: 0, elapsed: 0, roundMs: 0,
        feedbackMs: 0, errors: 0, missed: 0, message: '', messageUntil: 0, lastCorrect: false };
      hover = null; lastNotify = -1000; lastFrame = performance.now();
      draw(); notify(true);
    }

    function start() {
      if (destroyed) return;
      if (state.phase === 'complete') reset();
      if (state.phase !== 'intro') return;
      state.phase = 'playing'; state.message = type === 'bakery' ? '留意烤箱，熟了就取出。' : '先看题目，再回答。';
      state.roundMs = 0; lastFrame = performance.now();
      canvas.focus({ preventScroll: true }); draw(); notify(true);
    }

    function finishRound(correct, message) {
      state.phase = 'feedback'; state.lastCorrect = correct; state.message = message;
      state.feedbackMs = 0;
      if (correct) state.score++;
      draw(); notify(true);
    }

    function nextRound() {
      if (state.round >= 5) {
        state.phase = 'complete'; state.message = '试玩已完成，未上传数据。';
        draw(); notify(true);
        if (typeof options.onComplete === 'function') options.onComplete(getState());
        return;
      }
      state.round++; state.roundMs = 0; state.feedbackMs = 0; state.phase = 'playing';
      state.message = type === 'bakery' ? '留意烤箱，熟了就取出。' : '先看题目，再回答。';
      notify(true);
    }

    function collect(index) {
      if (state.phase !== 'playing' || type !== 'bakery') return;
      if (BAKERY_TARGETS[state.round] === index && state.roundMs >= 2250) {
        finishRound(true, '刚刚好，这盘饼干取出来了。');
      } else {
        state.errors++; state.message = '这盘还没烤好，再等一等。';
        state.messageUntil = state.elapsed + 1200; draw(); notify(true);
      }
    }

    function answer(yes) {
      if (state.phase !== 'playing' || type !== 'juice') return;
      const order = JUICE_ORDERS[state.round];
      const expected = order.task === 'compare' ? order.sweet > order.sour : order.sweet >= 6;
      const correct = yes === expected;
      if (!correct) state.errors++;
      const explanation = order.task === 'compare' ? `甜度 ${order.sweet} 格，酸度 ${order.sour} 格。`
        : `甜度 ${order.sweet} 格，${order.sweet >= 6 ? '已经达到' : '还没达到'} 6 格。`;
      finishRound(correct, `${correct ? '答对了！' : '这次选错了。'}${explanation}`);
    }

    function update(ms) {
      if (destroyed || !Number.isFinite(ms) || ms <= 0) return;
      state.elapsed += ms;
      if (state.phase === 'playing') {
        state.roundMs += ms;
        if (type === 'bakery' && state.roundMs >= 6100) {
          state.missed++; finishRound(false, '这一盘没来得及取，下一盘继续。');
        }
      } else if (state.phase === 'feedback') {
        state.feedbackMs += ms;
        if (state.feedbackMs >= (type === 'bakery' ? 1050 : 1750)) nextRound();
      }
      notify();
    }

    function advanceTime(ms) {
      const duration = Math.max(0, Math.min(Number(ms) || 0, 180000));
      let rest = duration;
      while (rest > 0) { const step = Math.min(rest, 20); update(step); rest -= step; }
      lastFrame = performance.now(); draw();
      return getState();
    }

    function inRect(point, rect) {
      return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
    }

    function pointFromEvent(event) {
      const r = canvas.getBoundingClientRect();
      return { x: (event.clientX - r.left) / r.width * W, y: (event.clientY - r.top) / r.height * H };
    }

    function targetAt(point) {
      if (['intro', 'complete'].includes(state.phase)) {
        return inRect(point, { x: 465, y: 387, w: 270, h: 61 }) ? 'start' : null;
      }
      if (state.phase !== 'playing') return null;
      if (type === 'bakery') {
        const index = OVENS.findIndex(r => inRect(point, r));
        return index >= 0 ? `oven-${index}` : null;
      }
      const yesRect = imageReady ? { x: 298, y: 540, w: 271, h: 58 } : { x: 278, y: 547, w: 286, h: 59 };
      const noRect = imageReady ? { x: 629, y: 540, w: 271, h: 58 } : { x: 616, y: 547, w: 286, h: 59 };
      if (inRect(point, yesRect)) return 'yes';
      if (inRect(point, noRect)) return 'no';
      return null;
    }

    function onClick(event) {
      canvas.focus({ preventScroll: true });
      const target = targetAt(pointFromEvent(event));
      if (target === 'start') start();
      if (target && target.startsWith('oven-')) collect(Number(target.slice(5)));
      if (target === 'yes') answer(true);
      if (target === 'no') answer(false);
    }

    function respond(keyOrIndex) {
      if (destroyed) return;
      if (type === 'bakery') {
        const index = Number(keyOrIndex) - 1;
        if (Number.isInteger(index) && index >= 0 && index < 4) collect(index);
      } else {
        const key = String(keyOrIndex).toLowerCase();
        if (key === 'f' || key === 'yes') answer(true);
        if (key === 'j' || key === 'no') answer(false);
      }
    }

    function onPointerMove(event) {
      const next = targetAt(pointFromEvent(event));
      if (hover !== next) { hover = next; canvas.style.cursor = next ? 'pointer' : 'default'; draw(); }
    }

    function onPointerLeave() { hover = null; canvas.style.cursor = 'default'; draw(); }

    function onKeyDown(event) {
      if (event.repeat) return;
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault(); start();
      }
      if (type === 'bakery' && /^[1-4]$/.test(event.key)) {
        event.preventDefault(); collect(Number(event.key) - 1);
      }
      if (type === 'juice' && ['f', 'j'].includes(event.key.toLowerCase())) {
        event.preventDefault(); answer(event.key.toLowerCase() === 'f');
      }
    }

    function frame(now) {
      if (destroyed) return;
      const ms = Math.min(100, Math.max(0, now - lastFrame)); lastFrame = now;
      // A hidden preview does not silently play through all six rounds.
      if (!document.hidden && ['playing', 'feedback'].includes(state.phase)) { update(ms); draw(); }
      raf = requestAnimationFrame(frame);
    }

    function onVisibilityChange() { lastFrame = performance.now(); }

    function destroy() {
      if (destroyed) return;
      destroyed = true; cancelAnimationFrame(raf);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.style.cursor = '';
      background.onload = null;
    }

    canvas.addEventListener('click', onClick);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    reset(); raf = requestAnimationFrame(frame);
    return { start, reset, destroy, advanceTime, getState, respond };
  }

  window.AttentionGames = Object.freeze({ mount });
})();
