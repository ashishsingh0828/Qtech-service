import mongoose from "mongoose";
import { config } from "./env.js";
import { createApp } from "./app.js";

await mongoose.connect(config.mongoUri);
const server = createApp().listen(config.port, () => {
  console.log(`Qtech Service Desk API listening on http://localhost:${config.port} (${config.isProd ? "production" : "development"})`);
});

const stop = () => server.close(() => mongoose.disconnect().then(() => process.exit(0)));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
