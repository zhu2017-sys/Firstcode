const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'events.jsonl');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, '');

const events = [];

function toMs(ts) {
  if (typeof ts === 'number') return ts;
  const d = new Date(ts);
  return d.getTime();
}

function nowMs() {
  return Date.now();
}

function appendEvent(ev) {
  const normalized = {
    ...ev,
    ts: ev.ts ? toMs(ev.ts) : nowMs(),
  };
  events.push(normalized);
  try {
    fs.appendFileSync(dataFile, JSON.stringify(normalized) + '\n');
  } catch {}
}

// Load existing events into memory
try {
  const lines = fs.readFileSync(dataFile, 'utf-8').split('\n').filter(Boolean);
  for (const line of lines) {
    const ev = JSON.parse(line);
    events.push(ev);
  }
} catch {}

function queryEvents({ from, to, filters = {} }) {
  const fromMs = from ? toMs(from) : 0;
  const toMsVal = to ? toMs(to) : Infinity;
  return events.filter(ev => {
    if (ev.ts < fromMs || ev.ts > toMsVal) return false;
    for (const k of Object.keys(filters)) {
      if (filters[k] !== undefined && ev[k] !== filters[k]) return false;
    }
    return true;
  });
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function overview({ from, to }) {
  const evs = queryEvents({ from, to });
  const pageViews = evs.filter(e => e.type === 'page_view');
  const uvSet = uniq(pageViews.map(e => e.anon_id || e.session_id || e.device_id || e.ip)).filter(Boolean);
  const uploadValid = evs.filter(e => e.type === 'upload_success').length;
  const imagesTotal = evs
    .filter(e => e.type === 'upload_start' || e.type === 'upload_success')
    .reduce((sum, e) => sum + (e.files_count || 0), 0);
  const analyzeStart = evs.filter(e => e.type === 'analyze_start').length;
  const analyzeSuccess = evs.filter(e => e.type === 'analyze_success').length;
  const analyzeRate = analyzeStart ? analyzeSuccess / analyzeStart : 0;
  const latencies = evs.filter(e => e.type === 'analyze_success' && typeof e.latency_ms === 'number').map(e => e.latency_ms);
  latencies.sort((a, b) => a - b);
  const p = (p) => latencies.length ? latencies[Math.floor(p / 100 * (latencies.length - 1))] : 0;
  const p95Latency = p(95);
  return {
    pv: pageViews.length,
    uv: uvSet.length,
    upload_valid: uploadValid,
    images_total: imagesTotal,
    analyze_start: analyzeStart,
    analyze_success: analyzeSuccess,
    analyze_rate: Number(analyzeRate.toFixed(2)),
    p95_latency: p95Latency
  };
}

function trends({ metric = 'pv', from, to, interval = 'day' }) {
  const evs = queryEvents({ from, to });
  const bucketSize = interval === 'hour' ? 3600_000 : 24 * 3600_000;
  const start = Math.floor((from ? toMs(from) : 0) / bucketSize) * bucketSize;
  const end = Math.ceil((to ? toMs(to) : nowMs()) / bucketSize) * bucketSize;
  const buckets = [];
  for (let t = start; t <= end; t += bucketSize) {
    buckets.push({ t, value: 0 });
  }
  const matchers = {
    pv: e => e.type === 'page_view',
    uv: e => e.type === 'page_view',
    upload: e => e.type === 'upload_success' || e.type === 'upload_start',
    analyze_success: e => e.type === 'analyze_success',
  };
  const matcher = matchers[metric] || matchers.pv;
  const uvSeen = {};
  for (const e of evs) {
    const b = Math.floor(e.ts / bucketSize) * bucketSize;
    const idx = Math.floor((b - start) / bucketSize);
    if (idx < 0 || idx >= buckets.length) continue;
    if (metric === 'uv' && matcher(e)) {
      const key = e.anon_id || e.session_id || e.device_id || e.ip || `${e.ts}-${Math.random()}`;
      if (!uvSeen[idx]) uvSeen[idx] = new Set();
      uvSeen[idx].add(key);
    } else if (matcher(e)) {
      buckets[idx].value += 1;
    }
  }
  if (metric === 'uv') {
    for (let i = 0; i < buckets.length; i++) {
      buckets[i].value = uvSeen[i] ? uvSeen[i].size : 0;
    }
  }
  return buckets;
}

function funnel({ from, to }) {
  const ov = overview({ from, to });
  return {
    pv: ov.pv,
    upload_valid: ov.upload_valid,
    analyze_start: ov.analyze_start,
    analyze_success: ov.analyze_success
  };
}

function grouped({ group_by = 'channel', from, to }) {
  const evs = queryEvents({ from, to });
  const groups = new Map();
  const getKey = (e) => {
    if (group_by === 'region') return e.region || 'unknown';
    if (group_by === 'device') return (e.device && e.device.os) || e.device || 'unknown';
    if (group_by === 'version') return e.app_version || 'unknown';
    return (e.utm && e.utm.source) || e.channel || 'unknown';
  };
  const uvPerGroup = {};
  for (const e of evs) {
    const key = getKey(e);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        pv: 0,
        upload: 0,
        analyze_success: 0,
        latencies: []
      });
      uvPerGroup[key] = new Set();
    }
    if (e.type === 'page_view') {
      groups.get(key).pv += 1;
      uvPerGroup[key].add(e.anon_id || e.session_id || e.device_id || e.ip || `${e.ts}-${Math.random()}`);
    }
    if (e.type === 'upload_success') groups.get(key).upload += 1;
    if (e.type === 'analyze_success') {
      groups.get(key).analyze_success += 1;
      if (typeof e.latency_ms === 'number') groups.get(key).latencies.push(e.latency_ms);
    }
  }
  const result = [];
  for (const [key, val] of groups.entries()) {
    val.uv = uvPerGroup[key].size;
    val.p95_latency = val.latencies.sort((a, b) => a - b)[Math.floor(0.95 * (val.latencies.length - 1))] || 0;
    delete val.latencies;
    result.push(val);
  }
  return result;
}

module.exports = {
  appendEvent,
  queryEvents,
  overview,
  trends,
  funnel,
  grouped,
};
