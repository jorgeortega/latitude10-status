// Renders summary.json. Text only: every value is set with textContent.
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};

async function main() {
  const response = await fetch('summary.json', { cache: 'no-store' });
  const summary = await response.json();
  $('updated').textContent = summary.updated ? `Last probe: ${summary.updated.replace('T', ' ').slice(0, 16)} UTC` : 'No probes yet.';
  for (const service of summary.services) {
    const now = summary.current[service.id];
    const li = el('li');
    li.append(el('span', service.name), el('span', now ? (now.up ? 'Up' : 'Down') : 'No data', now ? (now.up ? 'up' : 'down') : undefined));
    $('now').append(li);
  }
  const table = $('months');
  const head = el('tr');
  head.append(el('th', 'Month'), ...summary.services.map((s) => el('th', s.name)));
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  for (const month of summary.months) {
    const row = el('tr');
    row.append(el('td', month.month), ...summary.services.map((s) => el('td', month.services[s.id]?.uptime == null ? '—' : `${month.services[s.id].uptime.toFixed(3)} %`)));
    tbody.append(row);
  }
  table.append(thead, tbody);
  if (!summary.incidents.length) $('incidents').append(el('p', 'No incidents recorded.'));
  for (const incident of summary.incidents) {
    const article = el('article');
    article.append(el('h3', incident.title), el('p', incident.date ?? '', 'small'), el('pre', incident.body));
    $('incidents').append(article);
  }
}

main().catch(() => {
  $('updated').textContent = 'The status data couldn’t be loaded.';
});
