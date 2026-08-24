const express = require('express');
const path = require('path');
const config = require('./config');
const apiRoutes = require('./routes/api');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/api', apiRoutes);

app.listen(config.port, () => console.log(`Server running on port ${config.port}`));
