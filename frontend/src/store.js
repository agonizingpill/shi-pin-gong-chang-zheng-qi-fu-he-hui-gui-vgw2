export const store = {token: sessionStorage.getItem('steam.jwt'), user: null, lists: {}, detail: {}};

export function setSession(session) {
  store.token = session?.token || null;
  store.user = session?.user || null;
  store.lists = {};
  store.detail = {};
  if (session) sessionStorage.setItem('steam.jwt', session.token);
  else sessionStorage.removeItem('steam.jwt');
}
