export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
}

export const number = (value, precision = 2) => new Intl.NumberFormat('en-US', {maximumFractionDigits: precision}).format(value);
export const clock = value => value?.slice(11, 16) || '—';
export const day = value => value?.slice(5, 10).replace('-', ' / ') || '—';
export const interval = (from, to) => `${clock(from)}–${from.slice(0, 10) === to.slice(0, 10) ? '' : `${to.slice(5, 10)} `}${clock(to)}`;
export const options = (lookup, selected) => Object.entries(lookup).map(([key, label]) =>
  `<option value="${esc(key)}" ${key === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
export const busyPlan = state => state === 'running' || state === 'queued';
