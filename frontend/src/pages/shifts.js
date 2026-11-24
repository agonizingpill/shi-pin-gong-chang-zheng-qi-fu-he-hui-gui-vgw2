import {ASSET, LINE, SHIFT} from '../constants.js';
import {esc, clock, number, options, interval} from '../utils.js';
import {feedback, heading, notice, report, shiftStamp, status} from '../components/ui.js';

function openForm() {
  return `<details class="accordion"><summary>登记新班次</summary><form class="fields" data-path="/shifts" data-route="shifts">
    <label>班次编号<input name="code" placeholder="A-1122-B" required></label>
    <label>产线<select name="line">${options(LINE)}</select></label>
    <label>在产品<input name="product" placeholder="菌菇炖汁" required></label>
    <label>生产批号<input name="batch_code" placeholder="QH-261122-B" required></label>
    <label>班初<input type="datetime-local" name="starts_at" required></label>
    <label>班末<input type="datetime-local" name="ends_at" required></label>
    <label>室外温度 °C<input type="number" name="ambient_c" step="0.1" min="-10" max="55" required></label>
    <button>登记班次</button>${feedback}</form></details>`;
}

function meterForm(shift) {
  return `<details class="accordion"><summary>补录抄表读数</summary><form class="fields" data-path="/shifts/${shift.id}/readings">
    <label>小时边界<select name="reading_at" required>${shift.missing.map(value => `<option value="${esc(value)}">${esc(value.replace('T', ' '))}</option>`).join('')}</select></label>
    <label>累计蒸汽 kg<input name="cumulative_kg" type="number" min="0" step="0.01" required></label>
    <label>原始来源<input name="source_ref" placeholder="交接簿页码或照片编号" required></label><button>保存原始读数</button>${feedback}</form></details>`;
}

function swapFields(required) {
  const mark = required ? 'required' : '';
  return `<label>换表时刻<input type="datetime-local" name="swapped_at" ${mark}></label>
    <label>旧表末值 kg<input name="old_final_kg" type="number" min="0" step="0.01" ${mark}></label>
    <label>新表初值 kg<input name="new_initial_kg" type="number" min="0" step="0.01" ${mark}></label>
    <label>换表凭证<input name="source_ref" placeholder="换表记录单或照片编号" ${mark}></label>`;
}

function swapForm(shift) {
  return `<details class="accordion"><summary>登记换表</summary><form class="fields" data-path="/shifts/${shift.id}/swaps">
    ${swapFields(true)}<button>保存换表记录</button>${feedback}</form></details>`;
}

function runForm(shift, run) {
  return `<details class="accordion ${run ? 'inline' : ''}"><summary>${run ? '更正' : '录入启停区间'}</summary>
    <form class="fields" data-path="/shifts/${shift.id}/equipment${run ? `/${run.id}` : ''}" ${run ? 'data-method="PATCH"' : ''}>
    <label>设备<select name="asset">${options(ASSET, run?.asset)}</select></label>
    <label>开机<input type="datetime-local" name="starts_at" value="${esc(run?.starts_at?.slice(0, 16) || shift.starts_at.slice(0, 16))}" required></label>
    <label>停机<input type="datetime-local" name="ends_at" value="${esc(run?.ends_at?.slice(0, 16) || shift.ends_at.slice(0, 16))}" required></label>
    ${run ? '<label>更正理由<input name="reason" minlength="4" required></label>' : ''}<button>${run ? '确认更正' : '保存区间'}</button>${feedback}</form></details>`;
}

function sealForm(shift) {
  return `<form class="seal-form" data-path="/shifts/${shift.id}/seal" data-shape="seal">
    <details class="accordion inline"><summary>封账时一并补录换表（可选）</summary><div class="fields">${swapFields(false)}</div></details>
    <div><button>交接并封账</button>${feedback}</div></form>`;
}

function swapLedger(shift) {
  if (!shift.swaps.length) return '';
  return `<h3 class="pane-sub">换表记录</h3><div class="scroll"><table>
    <thead><tr><th>换表时刻</th><th class="num">旧表末值</th><th class="num">新表初值</th><th>换表凭证</th></tr></thead>
    <tbody>${shift.swaps.map(row => `<tr><td class="mono">${clock(row.swapped_at)}</td><td class="num">${number(row.old_final_kg)}</td>
      <td class="num">${number(row.new_initial_kg)}</td><td>${esc(row.source_ref)}</td></tr>`).join('')}</tbody></table></div>`;
}

function segmentHtml(segment) {
  return `<div class="segment"><span class="mono">${clock(segment.start_at)}–${clock(segment.end_at)}</span>
    ${number(segment.start_kg)} → ${number(segment.end_kg)} <b>+${number(segment.kg)}</b><br>
    <small>${esc(segment.start_source)} ／ ${esc(segment.end_source)}</small></div>`;
}

function hourLedger(shift) {
  return `<section class="pane hour-ledger">${report('小时耗汽', '<span class="subtle">换表小时按各表增量相加 · 逐段附原始凭证</span>')}
    <div class="scroll"><table><thead><tr><th>时段</th><th class="num">耗汽 kg</th><th>分段读数与原始凭证</th></tr></thead>
    <tbody>${shift.hours.map(hour => `<tr><td class="mono">${clock(hour.start)}–${clock(hour.end)}</td>
      <td class="num">${hour.kg === null ? '—' : number(hour.kg)}</td>
      <td>${hour.segments.length ? hour.segments.map(segmentHtml).join('<p class="swap-mark">换表</p>') : '<span class="subtle">待补边界读数</span>'}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function logbook(shift, role) {
  const canWrite = role !== 'viewer' && shift.state === 'open';
  const recorded = shift.hours.filter(hour => hour.kg !== null);
  const total = recorded.length ? recorded.reduce((sum, hour) => sum + hour.kg, 0) : null;
  return `<section class="shift-paper"><div class="sheet-header"><div><p class="eyebrow">${esc(LINE[shift.line])} / ${esc(shift.batch_code)}</p><h2>${esc(shift.product)}</h2><span>${esc(shift.code)} · ${interval(shift.starts_at, shift.ends_at)} · ${number(shift.ambient_c)} °C</span></div>${status(shift.state, SHIFT)}</div>
    <div class="gauges"><div><span>抄表时点</span><strong>${shift.reading_count}<small> / ${shift.expected_count}</small></strong></div>
      <div><span>启停记录</span><strong>${shift.run_count}<small> 条</small></strong></div>
      <div><span>${shift.missing.length ? '已录小时耗汽' : '班次实耗'}</span><strong>${total === null ? '—' : number(total)}<small> kg</small></strong></div></div>
    ${shift.missing.length ? notice('待补抄表', shift.missing.map(value => value.replace('T', ' ')).join('、')) : ''}
    <div class="capture-columns"><section class="pane">${report('蒸汽抄表', '<span class="subtle">累计表 · kg</span>')}
      ${shift.readings.length ? `<div class="scroll"><table><thead><tr><th>时点</th><th class="num">累计读数</th><th>原始来源</th></tr></thead><tbody>${shift.readings.map(row =>
        `<tr><td class="mono">${clock(row.reading_at)}</td><td class="num">${number(row.cumulative_kg)}</td><td>${esc(row.source_ref)}</td></tr>`).join('')}</tbody></table></div>` : notice('暂未抄表', '先录班初累计读数，再逐小时接续。')}
      ${canWrite && shift.missing.length ? meterForm(shift) : ''}
      ${swapLedger(shift)}
      ${canWrite ? swapForm(shift) : ''}</section>
    <section class="pane">${report('设备启停', '<span class="subtle">同设备区间独立校验</span>')}
      ${shift.runs.length ? `<div class="scroll"><ul class="run-list">${shift.runs.map(row => `<li><span><b>${esc(ASSET[row.asset])}</b><small>${esc(row.asset)}</small></span><time>${interval(row.starts_at, row.ends_at)}</time>
        ${canWrite && role === 'supervisor' ? runForm(shift, row) : ''}</li>`).join('')}</ul></div>` : notice('暂未记录启停', '录入对应设备的开机与停机时间。')}
      ${canWrite ? runForm(shift) : ''}</section></div>
    ${hourLedger(shift)}
    <div class="sheet-footer">${canWrite ? sealForm(shift) : shift.state === 'sealed' ? `<a class="button ghost" href="?shift=${shift.id}#plans">前往负荷估计</a>` : ''}</div></section>`;
}

export function shiftsPage(list, detail, role) {
  return `${heading('现场台账', '班次采集', '逐小时抄表，与设备启停一并交接。')}
    <div class="desktop"><aside class="roster">${report('生产班次', `<span class="subtle">${list.length} 班</span>`)}
      ${role !== 'viewer' ? openForm() : ''}
      ${list.map(shift => `<a class="roster-item ${shift.id === detail?.id ? 'selected' : ''}" href="#shifts/${shift.id}">${shiftStamp(shift)}${status(shift.state, SHIFT)}</a>`).join('')}</aside>
    ${detail ? logbook(detail, role) : notice('班次簿为空', '由值班员登记首个班次，随后录入抄表与启停。')}</div>`;
}
