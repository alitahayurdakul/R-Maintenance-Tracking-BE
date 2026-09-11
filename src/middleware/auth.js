import jwt from "jsonwebtoken";

import { config } from "../config.js";
import { HttpError } from "../lib/http.js";

/**
 * The access token's payload is read straight out of the JWT by the frontend
 * (`decodeJwtPayload` in authSlice), so `UserInfo` and its `role.permissions`
 * have to sit exactly here — the sidebar and every RoleWrapper depend on them.
 */
export const signAccessToken = (user) =>
  jwt.sign(
    {
      UserInfo: {
        id: String(user._id),
        email: user.email,
        fullname: user.fullname,
        role: {
          roleName: user.role?.roleName ?? "",
          permissions: user.role?.permissions ?? [],
        },
      },
    },
    config.accessSecret,
    { expiresIn: config.accessTtl },
  );

export const signRefreshToken = (user) =>
  jwt.sign({ id: String(user._id) }, config.refreshSecret, {
    expiresIn: config.refreshTtl,
  });

export const setRefreshCookie = (res, token) => {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const clearRefreshCookie = (res) => {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
  });
};

/**
 * Guards every /api route.
 *
 * Answering 403 on an expired token is deliberate: axiosInstance refreshes and
 * retries on 401 *and* 403, and the rest of the app was built against a backend
 * that used 403 here.
 */
export const requireAuth = (req, _res, next) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return next(new HttpError(401, "Authorization header missing"));
  }

  try {
    req.user = jwt.verify(token, config.accessSecret).UserInfo;
    return next();
  } catch (err) {
    const status = err.name === "TokenExpiredError" ? 403 : 401;
    return next(new HttpError(status, "Invalid or expired token"));
  }
};
