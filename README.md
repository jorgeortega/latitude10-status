# latitude10-status

The status page for Latitude 10's hosted services, at
[status.latitude10.tech](https://status.latitude10.tech). It runs outside
Cloudflare, where latitude10.tech runs, so it stays up when the site doesn't.

- `probes.json`: what's probed. The hosted reference and docs probes are off
  until a canary project is published (set `enabled` and the URL).
- `scripts/probe.mjs`: one window every 5 minutes; a failed probe is tried
  again a minute later, and the window is down only if both fail. Results go
  to `data/YYYY-MM.jsonl`.
- `scripts/summary.mjs`: monthly uptime per service and the incidents, into
  `summary.json` for the page. A window with no probe counts neither way.
- `incidents/*.md`: written by hand. First line `# Title`, then
  `Date: YYYY-MM-DD`, then the account.
- `.github/workflows/probe.yml`: every hour, probes for 55 minutes, commits
  once, and publishes the page. `.github/workflows/pages.yml` publishes it
  after a push of your own (an incident).

The SLA these numbers serve: https://latitude10.tech/legal/sla (Enterprise
agreements only).

```bash
node --test test/
node scripts/probe.mjs
node scripts/summary.mjs
```

No dependencies. MIT, October Moon LLC.
