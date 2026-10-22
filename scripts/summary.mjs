// Monthly uptime per service from data/*.jsonl, and the incident list from
// incidents/*.md, written to summary.json for the page. A window with no line
// counts neither way (the SLA's rule). No dependencies.
//
//   node scripts/summary.mjs
//
// MIT, October Moon LLC.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function monthUptime(lines) {
  const counts = {};
  for (const line of lines) {
    for (const [id, result] of Object.entries(line.results ?? {})) {
      counts[id] ??= { up: 0, total: 0 };
      counts[id].total += 1;
      if (result.up) counts[id].up += 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).map(([id, { up, total }]) => [id, { windows: total, uptime: total ? Math.floor((up / total) * 100_000) / 1000 : null }]));
}

export const parseLines = (text) =>
  text
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });

// An incident file: a first line "# Title", a line "Date: YYYY-MM-DD", then text.
export function parseIncident(name, text) {
  const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? name;
  const date = /^Date:\s*(\d{4}-\d{2}-\d{2})\s*$/m.exec(text)?.[1] ?? null;
  const body = text
    .replace(/^#\s+.+$/m, '')
    .replace(/^Date:.*$/m, '')
    .trim();
  return { id: name.replace(/\.md$/, ''), title: title.slice(0, 200), date, body: body.slice(0, 5000) };
}

export async function build(root = ROOT) {
  const config = JSON.parse(await readFile(join(root, 'probes.json'), 'utf8'));
  const dataFiles = (await readdir(join(root, 'data')).catch(() => [])).filter((name) => /^\d{4}-\d{2}\.jsonl$/.test(name)).sort();
  const months = [];
  let latest = null;
  for (const file of dataFiles.slice(-12)) {
    const lines = parseLines(await readFile(join(root, 'data', file), 'utf8'));
    months.push({ month: file.slice(0, 7), services: monthUptime(lines) });
    if (lines.length) latest = lines.at(-1);
  }
  const incidentFiles = (await readdir(join(root, 'incidents')).catch(() => [])).filter((name) => /^[\w-]+\.md$/.test(name));
  const incidents = (await Promise.all(incidentFiles.map(async (name) => parseIncident(name, await readFile(join(root, 'incidents', name), 'utf8'))))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const services = config.probes.filter((probe) => probe.enabled !== false).map(({ id, name }) => ({ id, name }));
  const summary = { updated: latest?.at ?? null, services, current: latest?.results ?? {}, months: months.reverse(), incidents };
  await writeFile(join(root, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
