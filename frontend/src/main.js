import {api, downloadEvidence} from './api.js';
import {drawLoadChart} from './components/load-chart.js';
import {notice, shell} from './components/ui.js';
import {loginPage} from './pages/login.js';
import {plansPage} from './pages/plans.js';
import {reviewsPage} from './pages/reviews.js';
import {shiftsPage} from './pages/shifts.js';
import {setSession, store} from './store.js';
import {busyPlan} from './utils.js';

const app = document.querySelector('#app');
const valid = ['shifts', 'plans', 'reviews'];
const demo = {operator: 'SteamOps1064!', supervisor: 'SteamLead1064!', viewer: 'SteamView1064!'};
let renderVersion = 0;
let poll;
let resizeObserver;

async function render() {
  const version = ++renderVersion;
  clearTimeout(poll);
  resizeObserver?.disconnect();
  if (!store.user) {
    app.innerHTML = loginPage();
    return;
  }
  const [path, rawId] = location.hash.slice(1).split('/');
  const route = valid.includes(path) ? path : 'shifts';
  const role = store.user.role;
  try {
    const [list, roster] = await Promise.all([api(`/${route}`), route === 'plans' ? api('/shifts') : Promise.resolve([])]);
    const selected = (/^[1-9]\d*$/.test(rawId || '') ? Number(rawId) : null) || list[0]?.id;
    const detail = selected ? await api(`/${route}/${selected}`) : null;
    if (version !== renderVersion) return;
    store.lists[route] = list;
    store.detail[route] = detail;
    if (route === 'plans') store.lists.shifts = roster;
    const content = {
      shifts: shiftsPage, plans: plansPage, reviews: reviewsPage,
    }[route](store.lists[route], store.detail[route], role, roster,
      Number(new URLSearchParams(location.search).get('shift')));
    app.innerHTML = shell(route, store.user, content);
    if (route === 'plans' && detail?.result) {
      const canvas = app.querySelector('#load-chart');
      resizeObserver = new ResizeObserver(() => drawLoadChart(canvas, detail.result.profile));
      resizeObserver.observe(canvas);
      drawLoadChart(canvas, detail.result.profile);
    }
    if (route === 'plans' && busyPlan(detail?.state)) {
      const refreshStatus = () => {
        if (app.querySelector('form :focus')) poll = setTimeout(refreshStatus, 1800);
        else render();
      };
      poll = setTimeout(refreshStatus, 1800);
    }
  } catch (error) {
    if (version !== renderVersion) return;
    if (error.status === 401) {
      setSession(null);
      await render();
      showFeedback(app.querySelector('.feedback'), error.message);
    } else {
      app.innerHTML = shell(route, store.user, `${notice('读取台账失败', error.message)}<button data-retry>重新加载</button>`);
    }
  }
}

function showFeedback(node, text) {
  node.hidden = false;
  node.textContent = text;
  if (node.tabIndex === -1) node.focus();
}

app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (!form.matches('[data-login], [data-path]')) return;
  const button = form.querySelector('button[type="submit"], button:not([type])');
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    if (form.matches('[data-login]')) {
      setSession(await api('/auth/login', values));
      if (!location.hash) history.replaceState(null, '', '#shifts');
      await render();
    } else {
      const result = await api(form.dataset.path, values, form.dataset.method);
      if (form.dataset.route) {
        history.replaceState(null, '', `${location.pathname}#${form.dataset.route}/${result.id}`);
      }
      await render();
    }
  } catch (error) {
    if (error.status === 401 && !form.matches('[data-login]')) {
      setSession(null);
      await render();
      showFeedback(app.querySelector('.feedback'), error.message);
    } else {
      showFeedback(form.querySelector('.feedback'), error.message);
      button.disabled = false;
    }
  }
});

app.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.demo) {
    const form = app.querySelector('[data-login]');
    form.elements.username.value = button.dataset.demo;
    form.elements.password.value = demo[button.dataset.demo];
    form.querySelector('button[type="submit"]').focus();
  } else if (button.hasAttribute('data-logout')) {
    setSession(null);
    history.replaceState(null, '', '/');
    await render();
  } else if (button.dataset.evidence) {
    try {
      await downloadEvidence(button.dataset.evidence);
    } catch (error) {
      showFeedback(app.querySelector('#download-feedback'), error.message);
    }
  } else if (button.hasAttribute('data-retry')) {
    await render();
  }
});

window.addEventListener('hashchange', render);
if (store.token) {
  try {
    store.user = await api('/auth/me');
  } catch (error) {
    setSession(null);
  }
}
await render();
