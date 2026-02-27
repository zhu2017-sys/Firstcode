export type Common = {
  session_id?: string;
  anon_id?: string;
  app_version?: string;
  env?: string;
  utm?: Record<string, any>;
  device?: any;
  region?: string;
};

function post(url: string, body: any) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

function base(): Common {
  return {
    app_version: '1.0.0',
    env: 'dev',
    device: { os: navigator.platform, browser: navigator.userAgent },
  };
}

export function track(ev: any) {
  const payload = { ...base(), ...ev, ts: Date.now() };
  return post('/api/track', payload);
}

export function trackBatch(evs: any[]) {
  const items = evs.map(e => ({ ...base(), ...e, ts: Date.now() }));
  return post('/api/track', items);
}
