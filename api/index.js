// Vercel serverless entrypoint exporting the Express app directly
// This preserves the original request URL for proper routing
const app = require("../index");

module.exports = app;