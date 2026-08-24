const $ = (id) => document.getElementById(id);
const statusBanner = $('statusBanner');

// --- Tab switching ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    $(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'networkTab') { renderNetwork(); loadStats(); }
    if (btn.dataset.tab === 'insightsTab') loadLeaderboard();
  });
});

// --- Health check ---
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    statusBanner.innerHTML = data.connected
      ? '<div class="status-banner status-ok">Connected to CognoDB</div>'
      : '<div class="status-banner status-bad">Database unreachable — check your connection settings</div>';
  } catch {
    statusBanner.innerHTML = '<div class="status-banner status-bad">Could not reach the server</div>';
  }
}

// --- Load dropdown data ---
async function loadOptions() {
  try {
    const [people, companies, skills] = await Promise.all([
      fetch('/api/people').then((r) => r.json()),
      fetch('/api/companies').then((r) => r.json()),
      fetch('/api/skills').then((r) => r.json()),
    ]);
    const peopleOpts = people.map((p) => `<option value="${p}">${p}</option>`).join('');
    $('fromPerson').innerHTML = peopleOpts;
    $('connFrom').innerHTML = peopleOpts;
    $('connTo').innerHTML = peopleOpts;
    $('mutualA').innerHTML = peopleOpts;
    $('mutualB').innerHTML = peopleOpts;
    if (people.length > 1) $('mutualB').selectedIndex = 1;
    $('targetCompany').innerHTML = companies.map((c) => `<option value="${c}">${c}</option>`).join('');
    $('skillSelect').innerHTML = skills.map((s) => `<option value="${s}">${s}</option>`).join('');
  } catch {
    $('pathResult').innerHTML = '<div class="empty">Could not load data. Is the database seeded and reachable?</div>';
  }
}

// --- Find path ---
$('findPathBtn').addEventListener('click', async () => {
  const from = $('fromPerson').value;
  const company = $('targetCompany').value;
  const pathResult = $('pathResult');
  const recResult = $('recResult');
  pathResult.innerHTML = '<div class="loading">Searching for the shortest path...</div>';
  recResult.innerHTML = '<div class="loading">Loading recommendations...</div>';
  $('findPathBtn').disabled = true;

  try {
    const res = await fetch(`/api/path?from=${encodeURIComponent(from)}&company=${encodeURIComponent(company)}`);
    const data = await res.json();
    if (!data.found) {
      pathResult.innerHTML = '<div class="empty">No connection path found to that company yet.</div>';
    } else {
      pathResult.innerHTML = `<div class="chain">${data.chain.map((n, i) => `<span class="node">${n}</span>${i < data.chain.length - 1 ? '<span class="arrow">✦</span>' : ''}`).join('')}</div>
         <p class="contact-line">Contact at ${company}: <strong>${data.contact}</strong></p>
         <button class="ghost-btn" id="viewOnGraphBtn" type="button">View this path on the graph →</button>`;
      $('viewOnGraphBtn').addEventListener('click', () => highlightPathOnGraph(data.chain, company));
    }
  } catch {
    pathResult.innerHTML = '<div class="empty" style="color: var(--danger);">Something went wrong fetching the path.</div>';
  }

  try {
    const res2 = await fetch(`/api/recommend?from=${encodeURIComponent(from)}&company=${encodeURIComponent(company)}`);
    const recs = await res2.json();
    recResult.innerHTML = !recs.length
      ? '<div class="empty">No strong connectors found for this company yet — try a different target.</div>'
      : recs.map((r) => `<div class="rec-item"><div class="name">${r.name}</div><div class="meta">${r.college} · ${r.sharedSkills.map((s) => `<span class="pill">${s}</span>`).join('')}</div></div>`).join('');
  } catch {
    recResult.innerHTML = '<div class="empty" style="color: var(--danger);">Could not load recommendations.</div>';
  }

  $('findPathBtn').disabled = false;
});

// --- Skill search ---
$('skillSearchBtn').addEventListener('click', async () => {
  const skill = $('skillSelect').value;
  const el = $('skillResult');
  el.innerHTML = '<div class="loading">Searching...</div>';
  try {
    const res = await fetch(`/api/search-by-skill?skill=${encodeURIComponent(skill)}`);
    const people = await res.json();
    el.innerHTML = !people.length
      ? '<div class="empty">Nobody with that skill yet.</div>'
      : people.map((p) => `<div class="rec-item"><div class="name">${p.name}</div><div class="meta">${p.company || 'No company listed'}</div></div>`).join('');
  } catch {
    el.innerHTML = '<div class="empty" style="color: var(--danger);">Search failed.</div>';
  }
});

// --- Add person ---
$('addPersonBtn').addEventListener('click', async () => {
  const name = $('newName').value.trim();
  const role = $('newRole').value.trim();
  const college = $('newCollege').value.trim();
  const company = $('newCompany').value.trim();
  const skills = $('newSkills').value.split(',').map((s) => s.trim()).filter(Boolean);
  const el = $('addPersonResult');
  if (!name) { el.innerHTML = '<div class="empty" style="color: var(--danger);">Name is required.</div>'; return; }
  el.innerHTML = '<div class="loading">Adding...</div>';
  try {
    await fetch('/api/person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, college, company, skills }),
    });
    el.innerHTML = `<div class="success">Added ${name} to the network.</div>`;
    loadOptions();
    invalidateGraph(); // so the new node shows up next time the graph is viewed
  } catch {
    el.innerHTML = '<div class="empty" style="color: var(--danger);">Failed to add person.</div>';
  }
});

// --- Add connection ---
$('addConnBtn').addEventListener('click', async () => {
  const from = $('connFrom').value;
  const to = $('connTo').value;
  const context = $('connContext').value.trim();
  const el = $('addConnResult');
  el.innerHTML = '<div class="loading">Connecting...</div>';
  try {
    await fetch('/api/connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, context }),
    });
    el.innerHTML = `<div class="success">Connected ${from} and ${to}.</div>`;
    invalidateGraph();
  } catch {
    el.innerHTML = '<div class="empty" style="color: var(--danger);">Failed to add connection.</div>';
  }
});

// --- Network visualization ---
// Graph data is fetched once and cached. The vis DataSets are built once and
// then mutated in place (via .update()) for every highlight/reset/hover, so
// the force layout that vis-network settles into is never thrown away and
// re-simulated — that's what was making the graph feel jittery and busy.
const NODE_COLORS = { Person: '#e4e7f7', Company: '#7fb69e', College: '#c98a8a', Skill: '#a78bda' };
let graphDataPromise = null;
let networkInstance = null;
let visNodes = null;
let visEdges = null;
let rawEdges = [];
let nodeLabels = new Map(); // nodeId -> display name, kept separate from the live DataSet
                             // because dimmed nodes have their label cleared to '' to declutter
let neighborMap = new Map(); // nodeId -> Set(connected nodeIds), for click-to-explore
let hoveredEdgeId = null;

// Drops the cached snapshot and tears down the live network instance so the
// next renderNetwork() call rebuilds from scratch with fresh data.
function invalidateGraph() {
  graphDataPromise = null;
  if (networkInstance) {
    networkInstance.destroy();
    networkInstance = null;
  }
  const container = $('networkView');
  if (container) container.dataset.rendered = '';
}

async function fetchGraphData() {
  if (!graphDataPromise) {
    graphDataPromise = fetch('/api/graph').then(async (r) => {
      if (!r.ok) {
        let details = '';
        try { details = (await r.json()).details || ''; } catch { /* ignore */ }
        throw new Error(details || `graph fetch failed (${r.status})`);
      }
      return r.json();
    });
  }
  return graphDataPromise;
}

function baseNodeStyle(n) {
  const color = NODE_COLORS[n.label] || '#999';
  return {
    id: n.id,
    label: n.name || n.label,
    title: n.label,
    shape: 'dot',
    size: n.label === 'Person' ? 15 : 10,
    color: { background: color, border: color, highlight: { background: '#e8a33d', border: '#f4c470' } },
    // vis-network draws this label BELOW the dot, on the dark canvas — not on
    // top of the node — so it needs to be light with a dark stroke to read on
    // that background, not a color chosen against the node's own fill.
    font: { color: '#e4e7f7', size: 12, strokeWidth: 3, strokeColor: '#0a0e1a' },
    borderWidth: 1,
  };
}

function baseEdgeStyle(e, i) {
  return {
    id: `e${i}`,
    from: e.source,
    to: e.target,
    label: '', // labels stay hidden by default — hover reveals them (see edge hover handlers)
    title: e.type,
    font: { size: 10, color: '#e8a33d', strokeWidth: 4, strokeColor: '#0a0e1a' },
    color: { color: '#2a3358', opacity: 0.65, highlight: '#e8a33d' },
    width: 1,
    smooth: { type: 'continuous', roundness: 0.35 },
    arrows: { to: { enabled: true, scaleFactor: 0.55 } },
  };
}

// Applies (or clears, when ids is null) a highlight: the given node ids and
// any edge between two of them go bright/amber; everything else dims. Pure
// in-place .update() calls — never rebuilds the DataSets or restarts physics.
// Label color is always light-on-dark-stroke — vis-network draws a dot's
// label below it on the canvas background, never on top of the dot itself,
// so a dark label color (matched to the amber fill) is invisible, not subtle.
function applyHighlight(ids) {
  const dim = !!ids && ids.size > 0;
  const isOn = (id) => !dim || ids.has(id);

  visNodes.update(visNodes.get().map((n) => {
    const on = isOn(n.id);
    const color = NODE_COLORS[n.title] || '#999';
    return {
      id: n.id,
      label: on ? nodeLabels.get(n.id) : '', // hide dimmed labels entirely — decluttered, not just faint
      color: on
        ? { background: dim ? '#e8a33d' : color, border: dim ? '#f4c470' : color }
        : { background: '#161b33', border: '#232c4d' },
      font: on
        ? { color: dim ? '#ffffff' : '#e4e7f7', size: dim ? 13 : 12, strokeWidth: 3, strokeColor: '#0a0e1a' }
        : { color: '#454c73', size: 12, strokeWidth: 0 },
      borderWidth: dim && on ? 3 : 1,
    };
  }));

  visEdges.update(rawEdges.map((e, i) => {
    const on = isOn(e.source) && isOn(e.target);
    const showLabel = hoveredEdgeId === `e${i}`;
    return {
      id: `e${i}`,
      label: showLabel ? e.type : '',
      color: { color: on && dim ? '#e8a33d' : '#2a3358', opacity: dim && !on ? 0.08 : 0.65 },
      width: on && dim ? 2.5 : 1,
    };
  }));
}

function neighborsOf(nodeId) {
  const set = neighborMap.get(nodeId) || new Set();
  return new Set([nodeId, ...set]);
}

async function renderNetwork(highlightNodeIds) {
  const container = $('networkView');
  if (typeof vis === 'undefined') {
    container.innerHTML = '<div class="empty" style="color: var(--danger);">The graph library (vis-network) failed to load from its CDN. Check your internet connection or ad-blocker and refresh.</div>';
    return;
  }
  try {
    const { nodes, edges } = await fetchGraphData();
    if (!nodes.length) {
      container.innerHTML = '<div class="empty">No data yet — run the seed script, or add a person from the Add Person tab.</div>';
      return;
    }
    rawEdges = edges;
    neighborMap = new Map();
    edges.forEach((e) => {
      if (!neighborMap.has(e.source)) neighborMap.set(e.source, new Set());
      if (!neighborMap.has(e.target)) neighborMap.set(e.target, new Set());
      neighborMap.get(e.source).add(e.target);
      neighborMap.get(e.target).add(e.source);
    });

    if (!networkInstance) {
      container.innerHTML = '';
      // Node "title" is repurposed to stash the node's label/type for restyling later.
      nodeLabels = new Map(nodes.map((n) => [n.id, n.name || n.label]));
      visNodes = new vis.DataSet(nodes.map((n) => ({ ...baseNodeStyle(n), title: n.label })));
      visEdges = new vis.DataSet(edges.map(baseEdgeStyle));

      networkInstance = new vis.Network(container, { nodes: visNodes, edges: visEdges }, {
        physics: {
          solver: 'forceAtlas2Based',
          forceAtlas2Based: { gravitationalConstant: -70, springLength: 140, springConstant: 0.06, damping: 0.6, avoidOverlap: 0.6 },
          stabilization: { iterations: 250 },
          minVelocity: 0.75,
        },
        interaction: { hover: true, tooltipDelay: 120, hideEdgesOnDrag: true, hideEdgesOnZoom: true },
        edges: { hoverWidth: 1.5 },
      });

      // Freeze the layout once it settles so re-highlighting never reshuffles it.
      networkInstance.once('stabilizationIterationsDone', () => {
        networkInstance.setOptions({ physics: false });
      });

      // Reveal an edge's relationship type only while hovering it.
      networkInstance.on('hoverEdge', (params) => {
        hoveredEdgeId = params.edge;
        visEdges.update({ id: params.edge, label: rawEdges[Number(params.edge.slice(1))].type });
      });
      networkInstance.on('blurEdge', (params) => {
        hoveredEdgeId = null;
        visEdges.update({ id: params.edge, label: '' });
      });

      // Click a node to trace its immediate connections; click empty space to reset.
      networkInstance.on('click', (params) => {
        if (params.nodes.length) {
          applyHighlight(neighborsOf(params.nodes[0]));
        } else {
          applyHighlight(null);
        }
      });
    } else {
      applyHighlight(null);
    }
    container.dataset.rendered = '1';

    if (highlightNodeIds && highlightNodeIds.size) {
      applyHighlight(highlightNodeIds);
      setTimeout(() => networkInstance.fit({ nodes: Array.from(highlightNodeIds), animation: true }), 200);
    }
  } catch (err) {
    graphDataPromise = null;
    container.innerHTML = `<div class="empty" style="color: var(--danger);">Could not load graph.<br><span style="font-size:0.78rem; color: var(--muted);">${(err && err.message) || 'Unknown error'}</span></div>`;
  }
}

async function highlightPathOnGraph(chain, company) {
  document.querySelector('[data-tab="networkTab"]').click();
  const ids = new Set(chain.map((name) => `Person:${name}`));
  ids.add(`Company:${company}`);
  await renderNetwork(ids);
}

$('resetGraphBtn').addEventListener('click', () => applyHighlight(null));

// --- Network stats ---
async function loadStats() {
  const el = $('statsBar');
  el.innerHTML = '<div class="loading">Loading network stats...</div>';
  try {
    const res = await fetch('/api/stats');
    const s = await res.json();
    const order = [
      { key: 'Person', label: 'Person', pluralLabel: 'People' },
      { key: 'Company', label: 'Company', pluralLabel: 'Companies' },
      { key: 'College', label: 'College', pluralLabel: 'Colleges' },
      { key: 'Skill', label: 'Skill', pluralLabel: 'Skills' },
    ];
    const chips = order
      .filter((o) => s.nodeCounts[o.key] !== undefined)
      .map((o) => {
        const count = s.nodeCounts[o.key];
        return `<div class="stat"><span class="stat-num">${count}</span><span class="stat-label">${count === 1 ? o.label : o.pluralLabel}</span></div>`;
      })
      .join('');
    el.innerHTML = `<div class="stats-grid">
      ${chips}
      <div class="stat"><span class="stat-num">${s.totalConnections}</span><span class="stat-label">Connections</span></div>
      <div class="stat"><span class="stat-num">${s.avgConnections}</span><span class="stat-label">Avg / person</span></div>
    </div>`;
  } catch {
    el.innerHTML = '<div class="empty" style="color: var(--danger);">Could not load network stats.</div>';
  }
}

// --- Leaderboard ---
async function loadLeaderboard() {
  const el = $('leaderboardResult');
  el.innerHTML = '<div class="loading">Ranking connectors...</div>';
  try {
    const res = await fetch('/api/leaderboard');
    const rows = await res.json();
    if (!rows.length) { el.innerHTML = '<div class="empty">No connectors yet.</div>'; return; }
    const max = Math.max(...rows.map((r) => r.connections));
    el.innerHTML = rows.map((r, i) => `
      <div class="leader-row">
        <span class="leader-rank">#${i + 1}</span>
        <div class="leader-info">
          <div class="leader-name">${r.name}${r.company ? ` <span class="leader-company">· ${r.company}</span>` : ''}</div>
          <div class="leader-bar"><div class="leader-bar-fill" style="width:${max ? (r.connections / max * 100).toFixed(0) : 0}%"></div></div>
        </div>
        <span class="leader-count">${r.connections}</span>
      </div>`).join('');
  } catch {
    el.innerHTML = '<div class="empty" style="color: var(--danger);">Could not load leaderboard.</div>';
  }
}

// --- Mutual connections ---
$('mutualBtn').addEventListener('click', async () => {
  const a = $('mutualA').value;
  const b = $('mutualB').value;
  const el = $('mutualResult');
  if (!a || !b) { el.innerHTML = '<div class="empty" style="color: var(--danger);">Pick two people.</div>'; return; }
  if (a === b) { el.innerHTML = '<div class="empty" style="color: var(--danger);">Pick two different people.</div>'; return; }
  el.innerHTML = '<div class="loading">Finding overlap...</div>';
  try {
    const res = await fetch(`/api/mutual?personA=${encodeURIComponent(a)}&personB=${encodeURIComponent(b)}`);
    const data = await res.json();
    const parts = [];
    if (data.directlyConnected) parts.push('<div class="success">They already know each other directly.</div>');
    parts.push(data.mutualConnections.length
      ? `<div class="meta">Mutual connections: ${data.mutualConnections.map((n) => `<span class="pill">${n}</span>`).join('')}</div>`
      : '<div class="empty">No mutual connections.</div>');
    if (data.sharedSkills.length) parts.push(`<div class="meta" style="margin-top:8px;">Shared skills: ${data.sharedSkills.map((s) => `<span class="pill">${s}</span>`).join('')}</div>`);
    if (data.sameCollege) parts.push(`<div class="meta" style="margin-top:8px;">Same college: <strong>${data.sameCollege}</strong></div>`);
    el.innerHTML = parts.join('');
  } catch {
    el.innerHTML = '<div class="empty" style="color: var(--danger);">Could not compare.</div>';
  }
});

checkHealth();
loadOptions();
