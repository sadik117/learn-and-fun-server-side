// Vercel serverless entrypoint that wraps the Express app
// All incoming requests are forwarded to the exported Express instance
const app = require("../index");

module.exports = (req, res) => app(req, res);

