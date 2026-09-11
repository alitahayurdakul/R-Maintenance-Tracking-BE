import { createApp } from "./app.js";
import { config } from "./config.js";
import { connectDb } from "./db.js";

const start = async () => {
  await connectDb();
  createApp().listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`);
    console.log(`[api] point the frontend at it with API_URL = "http://localhost:${config.port}"`);
  });
};

start().catch((err) => {
  console.error("[api] failed to start", err);
  process.exit(1);
});
