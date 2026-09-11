import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

/**
 * Reads a variable that only has a sensible default on a developer's machine.
 *
 * In production the fallbacks below are wrong rather than convenient: an unset
 * MONGODB_URI turns into `ECONNREFUSED 127.0.0.1:27017` several seconds into
 * boot, and an unset token secret signs sessions with a value that is public in
 * this repository. Naming the missing variable at startup is the whole point.
 */
const required = (name, devFallback) => {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(
      `[config] ${name} is not set. Add it to the hosting environment (Render > your service > Environment) and redeploy.`,
    );
  }
  return devFallback;
};

export const config = {
  port: Number(process.env.PORT || 5050),
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/tms-maintenance"),
  accessSecret: required("ACCESS_TOKEN_SECRET", "dev-access-secret"),
  refreshSecret: required("REFRESH_TOKEN_SECRET", "dev-refresh-secret"),
  accessTtl: process.env.ACCESS_TOKEN_TTL || "15m",
  refreshTtl: process.env.REFRESH_TOKEN_TTL || "7d",
  /** Comma-separated when more than one frontend talks to this API. */
  clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  /**
   * A refresh cookie only survives a cross-site request as `SameSite=None;
   * Secure`. Left as `lax`/insecure for local development, where the frontend
   * and the API share an origin and the connection is plain http.
   */
  cookieSameSite: process.env.COOKIE_SAMESITE || "lax",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  /** The frontend reads the refresh token from this cookie (SESSION_COOKIE_NAME). */
  cookieName: "jwt",
};
