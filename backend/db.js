const neo4j = require('neo4j-driver');
const config = require('./config');

const { uri, user, password } = config.cognodb;

if (!uri || !password) {
  console.error('Missing COGNODB_URI or COGNODB_PASSWORD in environment. Check your .env file.');
}

let driver;
try {
  driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
} catch (err) {
  console.error('Failed to create driver:', err.message);
}

async function verifyConnection() {
  try {
    await driver.verifyConnectivity();
    return true;
  } catch (err) {
    console.error('CognoDB connectivity check failed:', err.message);
    return false;
  }
}

async function runQuery(cypher, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

module.exports = { driver, runQuery, verifyConnection };
