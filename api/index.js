// Vercel serverless entrypoint: export a plain handler function.
// Exporting a function is the most-compatible shape for serverless builders.
const app = require("../index");

module.exports = (req, res) => app(req, res);