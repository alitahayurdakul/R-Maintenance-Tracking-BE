import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 5050),
  mongoUri:
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/tms-maintenance",
  accessSecret: process.env.ACCESS_TOKEN_SECRET || "dev-access-secret",
  refreshSecret: process.env.REFRESH_TOKEN_SECRET || "dev-refresh-secret",
  accessTtl: process.env.ACCESS_TOKEN_TTL || "15m",
  refreshTtl: process.env.REFRESH_TOKEN_TTL || "7d",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  /** The frontend reads the refresh token from this cookie (SESSION_COOKIE_NAME). */
  cookieName: "jwt",
};
