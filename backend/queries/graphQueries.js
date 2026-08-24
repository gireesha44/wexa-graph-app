const { runQuery } = require('../db');

// --- Reads ---

async function listPeople() {
  const records = await runQuery('MATCH (p:Person) RETURN p.name AS name ORDER BY p.name');
  return records.map((r) => r.get('name'));
}

async function listCompanies() {
  const records = await runQuery('MATCH (c:Company) RETURN c.name AS name ORDER BY c.name');
  return records.map((r) => r.get('name'));
}

async function listSkills() {
  const records = await runQuery('MATCH (s:Skill) RETURN s.name AS name ORDER BY s.name');
  return records.map((r) => r.get('name'));
}

// Multi-hop traversal: shortest warm-intro path from a person to anyone at a target company
async function shortestPathToCompany(from, company) {
  const cypher = `
    MATCH (start:Person {name: $from}), (target:Company {name: $company})
    MATCH path = shortestPath((start)-[:KNOWS*..6]-(end:Person))
    WHERE (end)-[:WORKS_AT]->(target)
    RETURN [n IN nodes(path) | n.name] AS chain, end.name AS contact
    ORDER BY length(path) ASC
    LIMIT 1
  `;
  const records = await runQuery(cypher, { from, company });
  if (records.length === 0) return null;
  return { chain: records[0].get('chain'), contact: records[0].get('contact') };
}

// SQL-awkward: same college, shares skills, works at target company - three relationship types converging
async function recommendConnectors(from, company) {
  const cypher = `
    MATCH (me:Person {name: $from})-[:STUDIED_AT]->(col:College)<-[:STUDIED_AT]-(cand:Person)
    MATCH (cand)-[:WORKS_AT]->(target:Company {name: $company})
    MATCH (me)-[:HAS_SKILL]->(sharedSkill:Skill)<-[:HAS_SKILL]-(cand)
    WITH cand, col, collect(DISTINCT sharedSkill.name) AS sharedSkills
    WHERE size(sharedSkills) >= 1
    RETURN cand.name AS name, col.name AS college, sharedSkills
  `;
  const records = await runQuery(cypher, { from, company });
  return records.map((r) => ({
    name: r.get('name'),
    college: r.get('college'),
    sharedSkills: r.get('sharedSkills'),
  }));
}

// Find people by a given skill
async function findBySkill(skill) {
  const cypher = `
    MATCH (p:Person)-[:HAS_SKILL]->(s:Skill {name: $skill})
    OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
    RETURN p.name AS name, c.name AS company
  `;
  const records = await runQuery(cypher, { skill });
  return records.map((r) => ({ name: r.get('name'), company: r.get('company') }));
}

// Helper: Neo4j driver returns Integer objects for count()/aggregates on some
// servers. Normalize to a plain JS number regardless of what CognoDB returns.
function toNum(v) {
  if (v && typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
  return v;
}

// Full graph snapshot for visualization (nodes + edges).
//
// NOTE: this used to select elementId(n)/elementId(a)/elementId(b) as node ids.
// elementId() is a Neo4j-proprietary function (added in Neo4j 5), not part of
// the openCypher standard CognoDB implements, so the query failed silently and
// the live graph never rendered. Fixed by building a stable id from the node's
// label + business key (name) instead -- both labels() and coalesce() are
// standard openCypher, so this works against any openCypher-compliant engine.
async function getGraphSnapshot() {
  const nodeCypher = `
    MATCH (n)
    RETURN labels(n)[0] AS label, coalesce(n.name, '') AS name
  `;
  const edgeCypher = `
    MATCH (a)-[r]->(b)
    RETURN labels(a)[0] AS sourceLabel, coalesce(a.name, '') AS sourceName,
           labels(b)[0] AS targetLabel, coalesce(b.name, '') AS targetName,
           type(r) AS type
  `;
  // Run sequentially rather than Promise.all: the free-tier CognoDB instance
  // is a single burstable 0.5 vCPU / 256MB box with a modest connection cap,
  // and two concurrent Bolt sessions opening at once was intermittently
  // erroring out here even after the elementId() fix. One session at a time
  // is a little slower but far more reliable on that tier.
  const nodeRecords = await runQuery(nodeCypher);
  const edgeRecords = await runQuery(edgeCypher);
  const nodeId = (label, name) => `${label}:${name}`;
  const nodes = nodeRecords.map((r) => {
    const label = r.get('label');
    const name = r.get('name');
    return { id: nodeId(label, name), label, name };
  });
  const edges = edgeRecords.map((r) => ({
    source: nodeId(r.get('sourceLabel'), r.get('sourceName')),
    target: nodeId(r.get('targetLabel'), r.get('targetName')),
    type: r.get('type'),
  }));
  return { nodes, edges };
}

// Network-wide stats: node counts by label, relationship counts by type,
// and derived metrics (total connections, average connections per person).
async function networkStats() {
  const nodeCypher = `MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count`;
  const relCypher = `MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count`;
  const [nodeRecords, relRecords] = await Promise.all([runQuery(nodeCypher), runQuery(relCypher)]);

  const nodeCounts = {};
  nodeRecords.forEach((r) => { nodeCounts[r.get('label')] = toNum(r.get('count')); });

  const relCounts = {};
  relRecords.forEach((r) => { relCounts[r.get('type')] = toNum(r.get('count')); });

  const totalPeople = nodeCounts.Person || 0;
  const totalKnowsDirected = relCounts.KNOWS || 0;
  const totalConnections = totalKnowsDirected / 2; // KNOWS is stored as a pair of directed edges
  const avgConnections = totalPeople ? Math.round((totalConnections * 2 / totalPeople) * 10) / 10 : 0;

  return { nodeCounts, relCounts, totalPeople, totalConnections, avgConnections };
}

// Leaderboard: people ranked by degree centrality (distinct people they KNOW).
// This is a graph-native metric -- in SQL it means a self-join on a
// "connections" table plus a GROUP BY/COUNT DISTINCT, and gets uglier the
// moment you want it alongside unrelated attributes like current employer.
async function topConnectors(limit = 10) {
  const cypher = `
    MATCH (p:Person)-[:KNOWS]->(other:Person)
    WITH p, count(DISTINCT other) AS connections
    OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
    RETURN p.name AS name, connections, c.name AS company
    ORDER BY connections DESC, name ASC
    LIMIT $limit
  `;
  const records = await runQuery(cypher, { limit: neo4jInt(limit) });
  return records.map((r) => ({
    name: r.get('name'),
    connections: toNum(r.get('connections')),
    company: r.get('company'),
  }));
}

// How connected are two people? Mutual acquaintances, shared skills, shared
// college, and whether they already know each other directly. Each of these
// is a different relationship type converging on the same pair of nodes --
// exactly the kind of question that turns into several joins (one of them a
// self-join with a NOT EXISTS to exclude direct pairs) in a relational schema.
async function mutualConnections(personA, personB) {
  const mutualCypher = `
    MATCH (a:Person {name: $personA})-[:KNOWS]->(mutual:Person)<-[:KNOWS]-(b:Person {name: $personB})
    WHERE mutual.name <> $personA AND mutual.name <> $personB
    RETURN DISTINCT mutual.name AS name
    ORDER BY name
  `;
  const skillCypher = `
    MATCH (a:Person {name: $personA})-[:HAS_SKILL]->(s:Skill)<-[:HAS_SKILL]-(b:Person {name: $personB})
    RETURN DISTINCT s.name AS name
    ORDER BY name
  `;
  const collegeCypher = `
    MATCH (a:Person {name: $personA})-[:STUDIED_AT]->(col:College)<-[:STUDIED_AT]-(b:Person {name: $personB})
    RETURN col.name AS name
    LIMIT 1
  `;
  const directCypher = `
    MATCH (a:Person {name: $personA})-[:KNOWS]->(b:Person {name: $personB})
    RETURN count(*) > 0 AS direct
  `;
  const [mutualRecords, skillRecords, collegeRecords, directRecords] = await Promise.all([
    runQuery(mutualCypher, { personA, personB }),
    runQuery(skillCypher, { personA, personB }),
    runQuery(collegeCypher, { personA, personB }),
    runQuery(directCypher, { personA, personB }),
  ]);
  return {
    mutualConnections: mutualRecords.map((r) => r.get('name')),
    sharedSkills: skillRecords.map((r) => r.get('name')),
    sameCollege: collegeRecords.length ? collegeRecords[0].get('name') : null,
    directlyConnected: directRecords.length ? directRecords[0].get('direct') : false,
  };
}

// LIMIT must be passed as an integer type over Bolt, not a JS float.
function neo4jInt(n) {
  try {
    // eslint-disable-next-line global-require
    const neo4j = require('neo4j-driver');
    return neo4j.int(n);
  } catch {
    return n;
  }
}

// --- Writes ---

async function addPerson({ name, role, college, company, skills }) {
  await runQuery('MERGE (p:Person {name: $name}) SET p.role = $role', { name, role: role || '' });

  if (college) {
    await runQuery(
      `MATCH (p:Person {name: $name})
       MERGE (c:College {name: $college})
       MERGE (p)-[:STUDIED_AT]->(c)`,
      { name, college }
    );
  }
  if (company) {
    await runQuery(
      `MATCH (p:Person {name: $name})
       MERGE (c:Company {name: $company})
       MERGE (p)-[:WORKS_AT {role: $role}]->(c)`,
      { name, company, role: role || '' }
    );
  }
  if (Array.isArray(skills)) {
    for (const skill of skills) {
      await runQuery(
        `MATCH (p:Person {name: $name})
         MERGE (s:Skill {name: $skill})
         MERGE (p)-[:HAS_SKILL]->(s)`,
        { name, skill: skill.trim() }
      );
    }
  }
  return { name };
}

async function addConnection({ from, to, context }) {
  await runQuery(
    `MATCH (a:Person {name: $from}), (b:Person {name: $to})
     MERGE (a)-[:KNOWS {context: $context}]->(b)
     MERGE (b)-[:KNOWS {context: $context}]->(a)`,
    { from, to, context: context || '' }
  );
  return { from, to };
}

module.exports = {
  listPeople,
  listCompanies,
  listSkills,
  shortestPathToCompany,
  recommendConnectors,
  findBySkill,
  getGraphSnapshot,
  networkStats,
  topConnectors,
  mutualConnections,
  addPerson,
  addConnection,
};
