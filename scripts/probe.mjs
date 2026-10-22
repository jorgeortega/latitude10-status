// Latitude 10's status probes: every 5 minutes, one request per service from
// outside Cloudflare, and a second try a minute later before a window counts
// as down (the SLA's rule). Results are appended to data/YYYY-MM.jsonl, one
// line per window. No dependencies: Node 22's fetch and fs.
//
//   node scripts/probe.mjs            probe once, append one window
//   node scripts/probe.mjs --for 55   probe every 5 minutes for 55 minutes
//
// MIT, October Moon LLC.

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RETRY_AFTER_MS = 60_000;

export async function loadConfig(root = ROOT) {
  const config = JSON.parse(await readFile(join(root, 'probes.json'), 'utf8'));
  return { ...config, probes: config.probes.filter((probe) => probe.enabled !== false) };
}

// One request: ok when the status is one the probe expects. Never throws.
export async function probeOnce(probe, { fetchFn = fetch, timeoutMs = 10_000, now = () => Date.now() } = {}) {
  const started = now();
  try {
    const response = await fetchFn(probe.url, {
      method: probe.method ?? 'GET',
      headers: { 'user-agent': 'Latitude10-Status/1.0 (+https://status.latitude10.tech)', ...(probe.headers ?? {}) },
      body: probe.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel().catch(() => undefined);
    return { ok: probe.expect.includes(response.status), status: response.status, ms: now() - started };
  } catch (error) {
    return { ok: false, status: 0, ms: now() - started, error: error?.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}

// A window: each probe, retried once after a minute if it failed.
export async function probeWindow(config, { fetchFn = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now() } = {}) {
  const at = new Date(now()).toISOString();
  const first = await Promise.all(config.probes.map((probe) => probeOnce(probe, { fetchFn, timeoutMs: config.timeoutMs, now })));
  const failed = first.map((result, i) => (result.ok ? null : i)).filter((i) => i !== null);
  const second = new Map();
  if (failed.length) {
    await wait(RETRY_AFTER_MS);
    for (const i of failed) second.set(i, await probeOnce(config.probes[i], { fetchFn, timeoutMs: config.timeoutMs, now }));
  }
  return {
    at,
    results: Object.fromEntries(
      config.probes.map((probe, i) => {
        const retry = second.get(i);
        const up = first[i].ok || retry?.ok === true;
        return [probe.id, { up, status: (retry ?? first[i]).status, ms: first[i].ms }];
      }),
    ),
  };
}

export async function append(window, root = ROOT) {
  const file = join(root, 'data', `${window.at.slice(0, 7)}.jsonl`);
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(window)}\n`);
  return file;
}

async function main() {
  const config = await loadConfig();
  const index = process.argv.indexOf('--for');
  const minutes = index > 0 ? Number(process.argv[index + 1]) : 0;
  const until = Date.now() + minutes * 60_000;
  for (;;) {
    const started = Date.now();
    const window = await probeWindow(config);
    await append(window);
    console.log(window.at, Object.entries(window.results).map(([id, r]) => `${id}:${r.up ? 'up' : 'DOWN'}`).join(' '));
    const next = started + config.intervalSeconds * 1000;
    if (next >= until) break;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, next - Date.now())));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
