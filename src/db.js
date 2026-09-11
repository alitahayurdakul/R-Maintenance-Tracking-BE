import mongoose from "mongoose";

import { config } from "./config.js";

export const connectDb = async () => {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri);
  console.log(`[db] connected to ${config.mongoUri}`);
};
