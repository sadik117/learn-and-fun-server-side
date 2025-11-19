// Vercel serverless entrypoint exporting the Express app directly
// This preserves the original request URL for proper routing
import app from "../index1";

export default app;
