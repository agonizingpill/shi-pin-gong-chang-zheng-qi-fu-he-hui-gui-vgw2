import {FINDING, REVIEW} from '../constants.js';
import {esc, clock, number, options} from '../utils.js';
import {feedback, heading, notice, report, shiftStamp, status} from '../components/ui.js';

function spikeSlip(review, spike, mayReview) {
  const reads = [spike.start_read, spike.end_read];
  return `<article class="spike-slip"><div class="spike-header"><div><h3>${esc(spike.shift)} · ${clock(reads[0].reading_at)}–${clock(reads[1].reading_at)}</h3>
    <p>${spike.sample_scope === 'history' ? '历史班次' : '目标班次'} · 实耗 ${number(spike.observed_kg)} kg · 基线 ${number(spike.baseline_kg)} kg</p></div>
    ${status(spike.finding ? 'closed' : 'pending', {closed: '已核验', pending: '待核验'})}</div>
    <dl class="source-ledger">${reads.map(item => `<div><dt>${clock(item.reading_at)} · ${number(item.cumulative_kg)} kg</dt><dd>${esc(item.source_ref)} <small>#${item.id}</small></dd></div>`).join('')}</dl>
    ${spike.finding ? `<p class="verdict"><strong>${esc(FINDING[spike.finding])}</strong> · ${esc(spike.verified_by)}<br>${esc(spike.findings_note)}</p>` : ''}
    ${mayReview ? `<details class="accordion"><summary>${spike.finding ? '修订核验意见' : '填写人工核验'}</summary>
      <form class="fields" data-path="/reviews/${review.id}/spikes/${spike.id}/verify"><label>核验结论<select name="finding">${options(FINDING, spike.finding)}</select></label>
      <label>凭证与判断<textarea name="note" minlength="4" maxlength="500" required>${esc(spike.findings_note)}</textarea></label>
      <button>签署核验</button>${feedback}</form></details>` : ''}</article>`;
}

function reviewDetail(review, role) {
  const result = review.plan.result;
  const pending = review.spikes.filter(spike => !spike.finding).length;
  const mayReview = role === 'supervisor' && review.state === 'pending';
  return `<section class="review-paper"><div class="sheet-header"><div><p class="eyebrow">能效班后会 / 复核单 ${String(review.id).padStart(3, '0')}</p>
    <h2>${esc(review.plan.title)}</h2>${shiftStamp(review.plan.shift)}</div>${status(review.state, REVIEW)}</div>
    <div class="review-grid"><section class="pane">${report('尖峰取证', `<span class="subtle">${review.spikes.length} 条 / 待核 ${pending}</span>`)}
      ${review.spikes.map(spike => spikeSlip(review, spike, mayReview)).join('') || notice('本次无尖峰', '可结合小时曲线完成节能复核结案。')}</section>
    <section class="review-brief">${report('结案交接', '')}<dl class="metrics"><div><dt>班次实耗</dt><dd>${number(result.observed_kg)} kg</dd></div>
      <div><dt>班次基线</dt><dd>${number(result.baseline_kg)} kg</dd></div><div><dt>本班耗汽偏差</dt><dd>${number(result.excess_kg)} kg</dd></div></dl>
      ${review.state === 'closed' ? `<div class="conclusion"><h3>复核结论</h3><p>${esc(review.conclusion)}</p><h3>后续措施</h3><p>${esc(review.follow_up)}</p></div>` :
       (mayReview ? `<form class="fields" data-path="/reviews/${review.id}/close"><label>复核结论<textarea name="conclusion" minlength="4" maxlength="500" placeholder="填写班次耗汽偏差判断" required></textarea></label>
       <label>后续措施<textarea name="follow_up" minlength="4" maxlength="500" placeholder="下一班应检查或调整什么" required></textarea></label>
       ${pending ? '<p class="subtle">尖峰核验完成后方可结案。</p>' : ''}<button ${pending ? 'disabled' : ''}>关闭节能复核单</button>${feedback}</form>` :
       notice('等待能源主管签署', '结案后将显示核验结论与下一班措施。'))}</section></div></section>`;
}

export function reviewsPage(list, detail, role) {
  return `${heading('能源交接', '节能复核', '从横跨尖峰时段的两次原始抄表，回查耗汽偏差。')}
    <div class="desktop"><aside class="roster">${report('班后复核单', `<span class="subtle">${list.length} 份</span>`)}
      ${list.map(review => `<a class="roster-item ${review.id === detail?.id ? 'selected' : ''}" href="#reviews/${review.id}">${shiftStamp(review.plan.shift)}${status(review.state, REVIEW)}</a>`).join('')}</aside>
    ${detail ? reviewDetail(detail, role) : notice('复核单为空', '能源主管审批负荷方案后，系统会建立复核单。')}</div>`;
}
