import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { probeOnce, probeWindow, append } from '../scripts/probe.mjs';
import { build, monthUptime, parseIncident, parseLines } from '../scripts/summary.mjs';

const answer = (statuses) => {
  const queue = [...statuses];
  return async () => {
    const next = queue.shift();
    if (next === 'throw') throw new TypeError('fetch failed');
    return new Response('', { status: next });
  };
};
const probe = { id: 'site', url: 'https://latitude10.tech/', expect: [200] };

test('a probe is up only on an expected status, and never throws', async () => {
  assert.equal((await probeOnce(probe, { fetchFn: answer([200]) })).ok, true);
  assert.equal((await probeOnce(probe, { fetchFn: answer([500]) })).ok, false);
  assert.equal((await probeOnce(probe, { fetchFn: answer([302]) })).ok, false);
  assert.deepEqual(await probeOnce(probe, { fetchFn: answer(['throw']), now: () => 0 }), { ok: false, status: 0, ms: 0, error: 'network' });
});

test('a window is down only when the retry a minute later fails too', async () => {
  const config = { timeoutMs: 1000, probes: [probe] };
  let waited = 0;
  const wait = async (ms) => void (waited += ms);
  assert.equal((await probeWindow(config, { fetchFn: answer([500, 200]), wait })).results.site.up, true);
  assert.equal(waited, 60_000);
  assert.equal((await probeWindow(config, { fetchFn: answer([500, 503]), wait })).results.site.up, false);
  waited = 0;
  assert.equal((await probeWindow(config, { fetchFn: answer([200]), wait })).results.site.up, true);
  assert.equal(waited, 0);
});

test('uptime counts only windows that were probed', () => {
  const lines = parseLines(['{"results":{"a":{"up":true}}}', '{"results":{"a":{"up":false}}}', 'not json', '{"results":{"a":{"up":true},"b":{"up":true}}}'].join('\n'));
  assert.deepEqual(monthUptime(lines), { a: { windows: 3, uptime: 66.666 }, b: { windows: 1, uptime: 100 } });
});

test('an incident is title, date and text', () => {
  assert.deepEqual(parseIncident('2026-11-02-dns.md', '# DNS outage\nDate: 2026-11-02\n\nResolved in 20 minutes.'), { id: '2026-11-02-dns', title: 'DNS outage', date: '2026-11-02', body: 'Resolved in 20 minutes.' });
});

test('the summary has the enabled services, the last window and the months, newest first', async () => {
  const root = await mkdtemp(join(tmpdir(), 'status-'));
  await writeFile(join(root, 'probes.json'), JSON.stringify({ probes: [probe, { id: 'docs', name: 'Docs', url: 'x', expect: [200], enabled: false }] }));
  await mkdir(join(root, 'incidents'));
  await append({ at: '2026-10-31T23:55:00.000Z', results: { site: { up: true } } }, root);
  await append({ at: '2026-11-01T00:00:00.000Z', results: { site: { up: false } } }, root);
  const summary = await build(root);
  assert.deepEqual(summary.services, [{ id: 'site', name: undefined }]);
  assert.equal(summary.updated, '2026-11-01T00:00:00.000Z');
  assert.deepEqual(summary.months.map((m) => [m.month, m.services.site.uptime]), [['2026-11', 0], ['2026-10', 100]]);
  assert.ok(JSON.parse(await readFile(join(root, 'summary.json'), 'utf8')));
});
