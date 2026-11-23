import {clock} from '../utils.js';

export function drawLoadChart(canvas, rows) {
  if (!canvas || !rows.length) return;
  const area = canvas.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  canvas.width = area.width * dpr;
  canvas.height = area.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const colors = getComputedStyle(canvas);
  const red = colors.getPropertyValue('--ink-red');
  const ink = colors.getPropertyValue('--ink');
  const paper = colors.getPropertyValue('--paper');
  const fade = colors.getPropertyValue('--rule');
  const max = Math.max(100, Math.ceil(Math.max(...rows.flatMap(row => [row.observed_kg, row.baseline_kg])) / 100) * 100);
  const box = {left: 44, right: area.width - 14, top: 16, bottom: area.height - 32};
  const width = (box.right - box.left) / rows.length;
  const x = i => box.left + width * (i + 0.5);
  const y = value => box.bottom - (box.bottom - box.top) * value / max;
  ctx.font = '11px "Noto Sans SC", sans-serif';
  ctx.fillStyle = ink;
  ctx.textAlign = 'right';
  for (let tick = 0; tick <= 4; tick++) {
    const value = max * tick / 4;
    ctx.fillText(value.toFixed(0), box.left - 8, y(value) + 4);
    ctx.strokeStyle = fade;
    ctx.beginPath(); ctx.moveTo(box.left, y(value)); ctx.lineTo(box.right, y(value)); ctx.stroke();
  }
  rows.forEach((row, i) => {
    ctx.fillStyle = row.flagged ? red : colors.getPropertyValue('--bar');
    ctx.fillRect(x(i) - width * 0.25, y(row.observed_kg), width * 0.5, box.bottom - y(row.observed_kg));
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.fillText(clock(row.start), x(i), box.bottom + 19);
  });
  ctx.beginPath();
  rows.forEach((row, i) => i === 0 ? ctx.moveTo(x(i), y(row.baseline_kg)) : ctx.lineTo(x(i), y(row.baseline_kg)));
  ctx.strokeStyle = paper;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = ink;
  rows.forEach((row, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(row.baseline_kg), 3.5, 0, 2 * Math.PI);
    ctx.strokeStyle = paper;
    ctx.stroke();
    ctx.fill();
  });
}
