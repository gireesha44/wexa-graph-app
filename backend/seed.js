const { runQuery, driver } = require('./db');

const colleges = ['VNR VJIET', 'IIT Hyderabad', 'BITS Pilani', 'NIT Warangal', 'IIT Bombay', 'IIIT Hyderabad'];

const companies = [
  { name: 'Google', industry: 'Tech' },
  { name: 'Amazon', industry: 'Tech' },
  { name: 'Microsoft', industry: 'Tech' },
  { name: 'Wexa AI', industry: 'AI Startup' },
  { name: 'Flipkart', industry: 'E-commerce' },
  { name: 'Meta', industry: 'Tech' },
  { name: 'Razorpay', industry: 'Fintech' },
  { name: 'Netflix', industry: 'Media/Tech' },
];

const skills = [
  'React', 'Node.js', 'Python', 'System Design', 'Graph Databases', 'Machine Learning',
  'DSA', 'Go', 'Kubernetes', 'TypeScript', 'Distributed Systems', 'Product Sense',
];

const people = [
  { name: 'You (Gireesha)', role: 'Student', college: 'VNR VJIET', skills: ['React', 'Node.js', 'DSA'] },
  { name: 'Ananya Rao', role: 'SDE-2', college: 'VNR VJIET', works: 'Amazon', skills: ['DSA', 'System Design'] },
  { name: 'Rahul Mehta', role: 'SDE-1', college: 'IIT Hyderabad', works: 'Google', skills: ['Python', 'Machine Learning'] },
  { name: 'Priya Nair', role: 'Founding Engineer', college: 'BITS Pilani', works: 'Wexa AI', skills: ['Graph Databases', 'Node.js'] },
  { name: 'Karthik Iyer', role: 'SDE-3', college: 'NIT Warangal', works: 'Microsoft', skills: ['System Design', 'React'] },
  { name: 'Sneha Reddy', role: 'SDE-1', college: 'VNR VJIET', works: 'Flipkart', skills: ['React', 'Node.js'] },
  { name: 'Vikram Singh', role: 'Senior SDE', college: 'IIT Hyderabad', works: 'Amazon', skills: ['System Design', 'DSA'] },
  { name: 'Divya Menon', role: 'SDE-2', college: 'BITS Pilani', works: 'Google', skills: ['Machine Learning', 'Python'] },
  { name: 'Arjun Das', role: 'SDE-2', college: 'VNR VJIET', works: 'Meta', skills: ['React', 'TypeScript'] },
  { name: 'Meera Pillai', role: 'Staff Engineer', college: 'IIT Bombay', works: 'Meta', skills: ['Distributed Systems', 'Go'] },
  { name: 'Rohan Verma', role: 'SDE-1', college: 'IIIT Hyderabad', works: 'Razorpay', skills: ['Node.js', 'TypeScript'] },
  { name: 'Kavya Krishnan', role: 'SDE-3', college: 'NIT Warangal', works: 'Netflix', skills: ['Distributed Systems', 'Kubernetes'] },
  { name: 'Aditya Kumar', role: 'SDE-2', college: 'VNR VJIET', works: 'Amazon', skills: ['DSA', 'Python'] },
  { name: 'Nisha Shah', role: 'Product Manager', college: 'BITS Pilani', works: 'Wexa AI', skills: ['Product Sense', 'Graph Databases'] },
  { name: 'Suresh Babu', role: 'Senior SDE', college: 'IIT Hyderabad', works: 'Microsoft', skills: ['System Design', 'Go'] },
  { name: 'Pooja Iyer', role: 'SDE-1', college: 'VNR VJIET', works: 'Flipkart', skills: ['React', 'DSA'] },
  { name: 'Manish Gupta', role: 'SDE-2', college: 'IIT Bombay', works: 'Google', skills: ['Machine Learning', 'Distributed Systems'] },
  { name: 'Lakshmi Narayan', role: 'Founding Engineer', college: 'IIIT Hyderabad', works: 'Razorpay', skills: ['Node.js', 'Kubernetes'] },
  { name: 'Farhan Khan', role: 'SDE-1', college: 'NIT Warangal', works: 'Meta', skills: ['React', 'TypeScript'] },
  { name: 'Ishita Sharma', role: 'SDE-2', college: 'VNR VJIET', works: 'Netflix', skills: ['Python', 'Kubernetes'] },
];

// Undirected pairs -- the seed script creates KNOWS in both directions for each.
const knows = [
  ['You (Gireesha)', 'Ananya Rao', 'same college, senior batch'],
  ['You (Gireesha)', 'Sneha Reddy', 'same college'],
  ['You (Gireesha)', 'Pooja Iyer', 'same college'],
  ['You (Gireesha)', 'Aditya Kumar', 'same college'],
  ['Ananya Rao', 'Vikram Singh', 'teammates at Amazon'],
  ['Ananya Rao', 'Aditya Kumar', 'teammates at Amazon'],
  ['Sneha Reddy', 'Karthik Iyer', 'met at a hackathon'],
  ['Sneha Reddy', 'Pooja Iyer', 'same college'],
  ['Priya Nair', 'Rahul Mehta', 'college friends'],
  ['Priya Nair', 'Nisha Shah', 'colleagues at Wexa AI'],
  ['Priya Nair', 'Vikram Singh', 'former teammates'],
  ['Karthik Iyer', 'Divya Menon', 'ex-colleagues'],
  ['Karthik Iyer', 'Farhan Khan', 'same college'],
  ['Vikram Singh', 'Suresh Babu', 'IIT Hyderabad batchmates'],
  ['Divya Menon', 'Manish Gupta', 'colleagues at Google'],
  ['Arjun Das', 'Farhan Khan', 'same college'],
  ['Arjun Das', 'Meera Pillai', 'colleagues at Meta'],
  ['Meera Pillai', 'Manish Gupta', 'IIT Bombay batchmates'],
  ['Rohan Verma', 'Lakshmi Narayan', 'colleagues at Razorpay'],
  ['Kavya Krishnan', 'Ishita Sharma', 'met at a Kubernetes meetup'],
  ['Kavya Krishnan', 'Farhan Khan', 'same college'],
  ['Aditya Kumar', 'Pooja Iyer', 'same college'],
  ['Nisha Shah', 'Lakshmi Narayan', 'product x infra friends'],
  ['Suresh Babu', 'Rahul Mehta', 'IIT Hyderabad batchmates'],
];

async function seed() {
  console.log('Clearing existing data...');
  await runQuery('MATCH (n) DETACH DELETE n');

  console.log('Creating colleges...');
  for (const c of colleges) {
    await runQuery('CREATE (:College {name: $name})', { name: c });
  }

  console.log('Creating companies...');
  for (const c of companies) {
    await runQuery('CREATE (:Company {name: $name, industry: $industry})', c);
  }

  console.log('Creating skills...');
  for (const s of skills) {
    await runQuery('MERGE (:Skill {name: $name})', { name: s });
  }

  console.log('Creating people + relationships...');
  for (const p of people) {
    await runQuery('CREATE (:Person {name: $name, role: $role})', { name: p.name, role: p.role });
    await runQuery(
      `MATCH (p:Person {name: $pname}), (c:College {name: $cname})
       CREATE (p)-[:STUDIED_AT]->(c)`,
      { pname: p.name, cname: p.college }
    );
    if (p.works) {
      await runQuery(
        `MATCH (p:Person {name: $pname}), (c:Company {name: $cname})
         CREATE (p)-[:WORKS_AT {role: $role}]->(c)`,
        { pname: p.name, cname: p.works, role: p.role }
      );
    }
    for (const sk of p.skills) {
      await runQuery(
        `MATCH (p:Person {name: $pname}), (s:Skill {name: $sname})
         CREATE (p)-[:HAS_SKILL]->(s)`,
        { pname: p.name, sname: sk }
      );
    }
  }

  console.log('Creating KNOWS relationships...');
  for (const [a, b, context] of knows) {
    await runQuery(
      `MATCH (p1:Person {name: $a}), (p2:Person {name: $b})
       CREATE (p1)-[:KNOWS {context: $context}]->(p2),
              (p2)-[:KNOWS {context: $context}]->(p1)`,
      { a, b, context }
    );
  }

  console.log(`Seed complete: ${people.length} people, ${companies.length} companies, ${colleges.length} colleges, ${skills.length} skills, ${knows.length} connections.`);
  await driver.close();
}

seed().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
