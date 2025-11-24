// Vercel Serverless Function - imports and exports the Express app
// This imports the compiled Express server from server/dist/index.js
const app = require('../server/dist/index.js').default || require('../server/dist/index.js');

module.exports = app;

