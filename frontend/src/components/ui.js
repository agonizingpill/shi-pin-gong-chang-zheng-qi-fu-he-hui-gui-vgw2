import {ROLE} from '../constants.js';
import {esc, day, interval} from '../utils.js';

const pages = [['shifts', '班次采集'], ['plans', '负荷估计'], ['reviews', '节能复核']];

export function shell(active, user, content) {
  return `<header class="mast"><div class="mast-inner"><a class="brand" href="#shifts"><i class="mark" aria-hidden="true"></i><span>清禾食品 <small>· 公用工程</small></span></a>
    <nav aria-label="值班簿导航">${pages.map(([key, label]) => `<a href="#${key}" ${key === active ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <div class="identity"><span>${esc(user.display_name)}<small>${ROLE[user.role]}</small></span><button class="quit" type="button" data-logout>退出</button></div></div></header>
    <main class="work">${content}</main><footer class="foot"><span>清禾食品制造厂 · 蒸汽值班簿</span><span>北京时间 / 累计蒸汽与班次负荷均以 kg 计</span></footer>`;
}

export const status = (state, labels) => `<span class="status ${esc(state)}">${esc(labels[state] || state)}</span>`;
export const notice = (headline, message) => `<div class="notice"><strong>${esc(headline)}</strong><p>${esc(message)}</p></div>`;
export const heading = (kicker, title, supporting) => `<div class="page-head"><div><p class="eyebrow">${esc(kicker)}</p><h1>${esc(title)}</h1></div><p>${esc(supporting)}</p></div>`;
export const feedback = '<p class="feedback" role="status" tabindex="-1" hidden></p>';
export const report = (title, body) => `<div class="pane-head"><h2>${esc(title)}</h2>${body || ''}</div>`;

export function shiftStamp(shift) {
  return `<div class="shift-stamp"><strong>${esc(shift.code)}</strong><span>${day(shift.starts_at)} · ${interval(shift.starts_at, shift.ends_at)}</span></div>`;
}
