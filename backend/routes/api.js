const express = require('express');
const router = express.Router();
const q = require('../queries/graphQueries');
const { verifyConnection } = require('../db');

function handleDbError(res, err) {
  res.status(503).json({ error: 'Database unavailable', details: err.message });
}

router.get('/health', async (req, res) => {
  const ok = await verifyConnection();
  res.json({ connected: ok });
});

router.get('/people', async (req, res) => {
  try {
    res.json(await q.listPeople());
  } catch (err) {
    handleDbError(res, err);
  }
});

router.get('/companies', async (req, res) => {
  try {
    res.json(await q.listCompanies());
  } catch (err) {
    handleDbError(res, err);
  }
});

router.get('/skills', async (req, res) => {
  try {
    res.json(await q.listSkills());
  } catch (err) {
    handleDbError(res, err);
  }
});

router.get('/path', async (req, res) => {
  const { from, company } = req.query;
  if (!from || !company) return res.status(400).json({ error: 'from and company are required' });
  try {
    const result = await q.shortestPathToCompany(from, company);
    res.json(result ? { found: true, ...result } : { found: false });
  } catch (err) {
    handleDbError(res, err);
  }
});

router.get('/recommend', async (req, res) => {
  const { from, company } = req.query;
  if (!from || !company) return res.status(400).json({ error: 'from and company are required' });
  try {
    res.json(await q.recommendConnectors(from, company));
  } catch (err) {
    handleDbError(res, err);
  }
});

router.get('/search-by-skill', async (req, res) => {
  const { skill } = req.query;
  if (!skill) return res.status(400).json({ error: 'skill is required' });
  try {
    res.json(await q.findBySkill(skill));
  } catch (err) {
    handleDbError(res, err);
  }
});

router.get('/graph', async (req, res) => {
  try {
    res.json(await q.getGraphSnapshot());
  } catch (err) {
    handleDbError(res, err);
  }
});

router.get('/stats', async (req, res) => {
  try {
    res.json(await q.networkStats());
  } catch (err) {
    handleDbError(res, err);
  }
});

router.get('/leaderboard', async (req, res) => {
  const limit = Number(req.query.limit) || 10;
  try {
    res.json(await q.topConnectors(limit));
  } catch (err) {
    handleDbError(res, err);
  }
});

router.get('/mutual', async (req, res) => {
  const { personA, personB } = req.query;
  if (!personA || !personB) return res.status(400).json({ error: 'personA and personB are required' });
  if (personA === personB) return res.status(400).json({ error: 'personA and personB must be different' });
  try {
    res.json(await q.mutualConnections(personA, personB));
  } catch (err) {
    handleDbError(res, err);
  }
});

router.post('/person', async (req, res) => {
  const { name, role, college, company, skills } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    res.json(await q.addPerson({ name, role, college, company, skills }));
  } catch (err) {
    handleDbError(res, err);
  }
});

router.post('/connection', async (req, res) => {
  const { from, to, context } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
  try {
    res.json(await q.addConnection({ from, to, context }));
  } catch (err) {
    handleDbError(res, err);
  }
});

module.exports = router;
