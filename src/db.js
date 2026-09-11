import mongoose from "mongoose";

import { config } from "./config.js";

/**
 * Hides the credentials in a connection string before it is logged.
 *
 * `mongodb+srv://user:password@host/db` carries the password in the URI, so
 * logging it verbatim writes the database password into the terminal, the
 * scrollback and any log file that captures stdout.
 */
const redact = (uri) => uri.replace(/\/\/([^:@/]+):([^@]*)@/, "//$1:***@");

export const connectDb = async () => {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri);
  console.log(`[db] connected to ${redact(config.mongoUri)}`);
};
