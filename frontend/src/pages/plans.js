import {LINE, PLAN, SHIFT} from '../constants.js';
import {busyPlan, esc, clock, number} from '../utils.js';
import {feedback, heading, notice, report, shiftStamp, status} from '../components/ui.js';

function requestForm(shifts, draft) {
  return `<details class="accordion ${draft ? 'request-open' : ''}" ${draft ? 'open' : ''}><summary>建立负荷方案</summary>
    <form class="fields" data-path="/plans" data-route="plans"><label>目标班次<select name="shift_id" required>
      ${shifts.map(shift => `<option value="${shift.id}" ${draft === shift.id ? 'selected' : ''}>${esc(shift.code)} · ${esc(shift.product)} · ${SHIFT[shift.state]}</option>`).join('')}</select></label>
    <label>方案名称<input name="title" minlength="4" maxlength="80" placeholder="晚班供汽基线" required></label>
    <button>提交稳健估计</button>${feedback}</form></details>`;
}

function planDetail(plan, role) {
  const result = plan.result;
  const ready = result ? `<div class="gauges"><div><span>班次实耗</span><strong>${number(result.observed_kg)}<small> kg</small></strong></div>
      <div><span>模型基线</span><strong>${number(result.baseline_kg)}<small> kg</small></strong></div>
      <div><span>实耗 − 基线</span><strong>${result.excess_kg > 0 ? '+' : ''}${number(result.excess_kg)}<small> kg</small></strong></div></div>
      <div class="analysis-grid"><section class="pane">${report('小时耗汽曲线', '<span class="subtle">kg / 小时</span>')}
        <div class="legend"><span>蒸汽实耗</span><span>模型基线</span>${result.profile.some(row => row.flagged) ? '<span>目标班尖峰</span>' : ''}</div><canvas id="load-chart" role="img" aria-label="班内小时蒸汽实耗柱状图及基线曲线"></canvas>
        <details class="table-fold"><summary>查看曲线数据</summary><table><thead><tr><th>时点</th><th>实耗 kg</th><th>基线 kg</th></tr></thead><tbody>${result.profile.map(row =>
        `<tr><td>${clock(row.start)}</td><td>${number(row.observed_kg)}</td><td>${number(row.baseline_kg)}</td></tr>`).join('')}</tbody></table></details>
      </section><section class="pane">${report('特征筛选', '<span class="subtle">互信息得分</span>')}
        <ol class="features">${result.features.map(feature => `<li><span>${esc(feature.name)}${feature.selected ? '<i>入模</i>' : ''}</span><b>${number(feature.score, 4)}</b></li>`).join('')}</ol>
        <dl class="metrics"><div><dt>历史留出 MAE</dt><dd>${number(result.metrics.holdout_mae_kg)} kg/h</dd></div>
        <div><dt>留出班次</dt><dd>${esc(result.sample.holdout_shift)}</dd></div>
        <div><dt>建模 / 留出小时</dt><dd>${result.sample.training} / ${result.sample.holdout}</dd></div>
        <div><dt>标记尖峰</dt><dd>${result.spikes.length} 条</dd></div></dl></section></div>` :
    (busyPlan(plan.state) ? notice('方案正在处理', '计算完成后，小时负荷曲线与特征筛选会在这里更新。') : notice('估计失败', plan.error || '检查班次覆盖后重新提交，系统会保留本次修订。'));
  return `<section class="shift-paper"><div class="sheet-header"><div><p class="eyebrow">${esc(LINE[plan.shift.line])} / 修订 ${plan.revision}</p>
    <h2>${esc(plan.title)}</h2>${shiftStamp(plan.shift)}</div>${status(plan.state, PLAN)}</div>${ready}
    <div class="sheet-footer plan-actions">${result && plan.evidence ? `<button class="ghost" data-evidence="${plan.id}">下载估计证据</button>` : ''}
    ${plan.state === 'estimated' && role === 'supervisor' ? `<form data-path="/plans/${plan.id}/approve" data-route="reviews"><button>审批并发起节能复核</button>${feedback}</form>` : ''}
    ${plan.review_id ? `<a class="button ghost" href="#reviews/${plan.review_id}">查看节能复核</a>` : ''}<p id="download-feedback" class="feedback" role="status" hidden></p></div></section>`;
}

export function plansPage(plans, plan, role, shifts, draft) {
  return `${heading('负荷建模', '负荷估计', '用同线已封账的前序班次，建立目标班的耗汽基线。')}
    <div class="desktop"><aside class="roster">${report('负荷方案', `<span class="subtle">${plans.length} 份</span>`)}
    ${plans.map(item => `<a class="roster-item ${item.id === plan?.id ? 'selected' : ''}" href="#plans/${item.id}"><div class="plan-item"><b>${esc(item.title)}</b><small>${esc(item.shift.code)} / R${item.revision}</small></div>${status(item.state, PLAN)}</a>`).join('')}
    ${role !== 'viewer' && shifts.length ? requestForm(shifts, draft) : ''}</aside>
    ${plan ? planDetail(plan, role) : notice('尚无负荷方案', '先在班次采集完成交接封账，再选一个班次提交。')}</div>`;
}
