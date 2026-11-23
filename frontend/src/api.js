import {store} from './store.js';

export async function api(path, body, method) {
  const headers = {};
  if (store.token) headers.Authorization = `Bearer ${store.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'), headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const supplemental = data.missing?.map(time => time.replace('T', ' ')).join('、');
    const fields = data.fields?.map(item => `${item.field} ${item.error}`).join('、');
    const conflict = data.asset && data.starts_at ? `${data.asset} ${data.starts_at.slice(11, 16)}–${data.ends_at.slice(11, 16)}` : '';
    const error = new Error([data.message || '暂时无法读取台账', supplemental, fields, conflict].filter(Boolean).join('。'));
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function downloadEvidence(id) {
  const response = await fetch(`/api/plans/${id}/evidence`, {headers: {Authorization: `Bearer ${store.token}`}});
  if (!response.ok) throw new Error('估计证据暂不可下载');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `steam-plan-${id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
