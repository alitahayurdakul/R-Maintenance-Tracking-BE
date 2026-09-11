import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";

import { audit, LOG_ACTIONS } from "../lib/audit.js";
import { config } from "../config.js";
import { asyncHandler, badRequest, HttpError } from "../lib/http.js";
import { userOut } from "../lib/serialize.js";
import {
  clearRefreshCookie,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
} from "../middleware/auth.js";
import { Role, User } from "../models/index.js";

export const authRouter = Router();

/**
 * POST /auth — the login form posts `{ email, pwd }` and reads `accessToken`.
 *
 * The field is `pwd`, not `password`: LoginCard sends `{ email, pwd }` and the
 * Next route forwards the body untouched. `password` is accepted too, so a
 * hand-made request still works.
 */
authRouter.post(
  "/auth",
  asyncHandler(async (req, res) => {
    const { email } = req.body ?? {};
    const password = req.body?.pwd ?? req.body?.password;
    if (!email || !password) throw badRequest("Email and password are required");

    const user = await User.findOne({ email: String(email).toLowerCase() }).populate("role");
    if (!user || !user.isActive) throw new HttpError(401, "Invalid credentials");

    const matches = await bcrypt.compare(String(password), user.password);
    if (!matches) throw new HttpError(401, "Invalid credentials");

    setRefreshCookie(res, signRefreshToken(user));
    // The caller is not authenticated yet, so the actor comes from the record.
    audit(req, LOG_ACTIONS.AUTH_LOGIN, { userId: String(user._id), fullname: user.fullname });
    res.json({ accessToken: signAccessToken(user), user: userOut(user) });
  }),
);

/** GET /refresh — reads the httpOnly cookie, hands back a fresh access token. */
authRouter.get(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[config.cookieName];
    if (!token) throw new HttpError(401, "No session");

    let payload;
    try {
      payload = jwt.verify(token, config.refreshSecret);
    } catch {
      throw new HttpError(401, "Session expired");
    }

    const user = await User.findById(payload.id).populate("role");
    if (!user || !user.isActive) throw new HttpError(401, "No session");

    res.json({ accessToken: signAccessToken(user) });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    clearRefreshCookie(res);
    audit(req, LOG_ACTIONS.AUTH_LOGOUT);
    res.status(204).end();
  }),
);

/**
 * POST /register — the user-management form creates accounts through here, and
 * sends the password as `pwd` the same way the login form does.
 */
authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { fullname, email, phone, department, role, creator } = req.body ?? {};
    const password = req.body?.pwd ?? req.body?.password;
    if (!fullname || !email || !password) {
      throw badRequest("fullname, email and password are required");
    }

    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) throw badRequest("A user with this email already exists");

    const roleDoc = role ? await Role.findById(role) : null;

    const user = await User.create({
      fullname,
      email: String(email).toLowerCase(),
      password: await bcrypt.hash(String(password), 10),
      phone: phone ?? "",
      department: department ?? "",
      role: roleDoc?._id ?? null,
      creator: creator ?? "",
    });

    audit(req, LOG_ACTIONS.USER_CREATE, { userId: String(user._id), fullname: user.fullname });
    res.status(201).json({ success: true, data: userOut(user) });
  }),
);

/* ------------------------------------------------- forgot-password flow ---- */

authRouter.post(
  "/auth/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = req.body ?? {};
    const user = await User.findOne({ email: String(email ?? "").toLowerCase() });

    // Always 200: telling a caller which addresses exist is an account oracle.
    if (user) {
      user.resetCode = String(Math.floor(100000 + Math.random() * 900000));
      user.resetCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      console.log(`[auth] reset code for ${user.email}: ${user.resetCode}`);
    }

    res.json({ success: true, message: "If the address exists, a code was sent" });
  }),
);

authRouter.post(
  "/auth/verify-reset-code",
  asyncHandler(async (req, res) => {
    const { email, code } = req.body ?? {};
    const user = await User.findOne({ email: String(email ?? "").toLowerCase() });

    if (
      !user ||
      !user.resetCode ||
      user.resetCode !== String(code) ||
      !user.resetCodeExpiresAt ||
      user.resetCodeExpiresAt < new Date()
    ) {
      throw badRequest("The code is invalid or has expired");
    }

    const resetToken = jwt.sign({ id: String(user._id) }, config.accessSecret, {
      expiresIn: "15m",
    });

    res.json({ success: true, resetToken });
  }),
);

authRouter.post(
  "/auth/reset-password",
  asyncHandler(async (req, res) => {
    const { resetToken, newPassword } = req.body ?? {};
    if (!resetToken || !newPassword) throw badRequest("Missing reset payload");

    let payload;
    try {
      payload = jwt.verify(resetToken, config.accessSecret);
    } catch {
      throw badRequest("The reset link is invalid or has expired");
    }

    const user = await User.findById(payload.id);
    if (!user) throw badRequest("The reset link is invalid or has expired");

    user.password = await bcrypt.hash(String(newPassword), 10);
    user.resetCode = undefined;
    user.resetCodeExpiresAt = undefined;
    await user.save();

    res.json({ success: true });
  }),
);
