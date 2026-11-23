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

function runForm(shift, run) {
  return `<details class="accordion ${run ? 'inline' : ''}"><summary>${run ? '更正' : '录入启停区间'}</summary>
    <form class="fields" data-path="/shifts/${shift.id}/equipment${run ? `/${run.id}` : ''}" ${run ? 'data-method="PATCH"' : ''}>
    <label>设备<select name="asset">${options(ASSET, run?.asset)}</select></label>
    <label>开机<input type="datetime-local" name="starts_at" value="${esc(run?.starts_at?.slice(0, 16) || shift.starts_at.slice(0, 16))}" required></label>
    <label>停机<input type="datetime-local" name="ends_at" value="${esc(run?.ends_at?.slice(0, 16) || shift.ends_at.slice(0, 16))}" required></label>
    ${run ? '<label>更正理由<input name="reason" minlength="4" required></label>' : ''}<button>${run ? '确认更正' : '保存区间'}</button>${feedback}</form></details>`;
}

function logbook(shift, role) {
  const canWrite = role !== 'viewer' && shift.state === 'open';
  const total = shift.readings.length > 1 ? shift.readings.at(-1).cumulative_kg - shift.readings[0].cumulative_kg : null;
  return `<section class="shift-paper"><div class="sheet-header"><div><p class="eyebrow">${esc(LINE[shift.line])} / ${esc(shift.batch_code)}</p><h2>${esc(shift.product)}</h2><span>${esc(shift.code)} · ${interval(shift.starts_at, shift.ends_at)} · ${number(shift.ambient_c)} °C</span></div>${status(shift.state, SHIFT)}</div>
    <div class="gauges"><div><span>抄表时点</span><strong>${shift.reading_count}<small> / ${shift.expected_count}</small></strong></div>
      <div><span>启停记录</span><strong>${shift.run_count}<small> 条</small></strong></div>
      <div><span>${shift.missing.length ? '已录首末差' : '班次实耗'}</span><strong>${total === null ? '—' : number(total)}<small> kg</small></strong></div></div>
    ${shift.missing.length ? notice('待补抄表', shift.missing.map(value => value.replace('T', ' ')).join('、')) : ''}
    <div class="capture-columns"><section class="pane">${report('蒸汽抄表', '<span class="subtle">累计表 · kg</span>')}
      ${shift.readings.length ? `<div class="scroll"><table><thead><tr><th>时点</th><th class="num">累计读数</th><th>原始来源</th></tr></thead><tbody>${shift.readings.map(row =>
        `<tr><td class="mono">${clock(row.reading_at)}</td><td class="num">${number(row.cumulative_kg)}</td><td>${esc(row.source_ref)}</td></tr>`).join('')}</tbody></table></div>` : notice('暂未抄表', '先录班初累计读数，再逐小时接续。')}
      ${canWrite && shift.missing.length ? meterForm(shift) : ''}</section>
    <section class="pane">${report('设备启停', '<span class="subtle">同设备区间独立校验</span>')}
      ${shift.runs.length ? `<div class="scroll"><ul class="run-list">${shift.runs.map(row => `<li><span><b>${esc(ASSET[row.asset])}</b><small>${esc(row.asset)}</small></span><time>${interval(row.starts_at, row.ends_at)}</time>
        ${canWrite && role === 'supervisor' ? runForm(shift, row) : ''}</li>`).join('')}</ul></div>` : notice('暂未记录启停', '录入对应设备的开机与停机时间。')}
      ${canWrite ? runForm(shift) : ''}</section></div>
    <div class="sheet-footer">${canWrite ? `<form data-path="/shifts/${shift.id}/seal"><button>交接并封账</button>${feedback}</form>` : shift.state === 'sealed' ? `<a class="button ghost" href="?shift=${shift.id}#plans">前往负荷估计</a>` : ''}</div></section>`;
}

export function shiftsPage(list, detail, role) {
  return `${heading('现场台账', '班次采集', '逐小时抄表，与设备启停一并交接。')}
    <div class="desktop"><aside class="roster">${report('生产班次', `<span class="subtle">${list.length} 班</span>`)}
      ${role !== 'viewer' ? openForm() : ''}
      ${list.map(shift => `<a class="roster-item ${shift.id === detail?.id ? 'selected' : ''}" href="#shifts/${shift.id}">${shiftStamp(shift)}${status(shift.state, SHIFT)}</a>`).join('')}</aside>
    ${detail ? logbook(detail, role) : notice('班次簿为空', '由值班员登记首个班次，随后录入抄表与启停。')}</div>`;
}
