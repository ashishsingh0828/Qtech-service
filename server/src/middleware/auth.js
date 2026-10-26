import jwt from "jsonwebtoken";
import { config } from "../env.js";
import { User } from "../models/User.js";
import { HttpError, asyncHandler } from "../lib/errors.js";
import { can } from "../lib/policy.js";
import { isObjectId } from "../lib/validate.js";

export const COOKIE = "sd_token";

export function issueSession(res, user) {
  const token = jwt.sign({ sub: String(user._id) }, config.jwtSecret, { algorithm: "HS256", expiresIn: `${config.tokenHours}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true, // JavaScript in the page can never read it
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: config.tokenHours * 3600 * 1000,
    path: "/",
  });
}

export const clearSession = (res) => res.clearCookie(COOKIE, { path: "/" });

// The user is loaded from the database on every request, so a deleted user
// or a changed role takes effect immediately.
export async function userFromRequest(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const { sub, iat } = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    const user = isObjectId(sub) ? await User.findById(sub) : null;
    // A password reset ends every session that was opened before it.
    if (user?.sessionsValidFrom && iat < Math.floor(user.sessionsValidFrom.getTime() / 1000)) return null;
    return user;
  } catch {
    return null;
  }
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const user = await userFromRequest(req);
  if (!user) throw new HttpError(401, "Please sign in.");
  req.user = user;
  next();
});

export const requirePermission = (action) => (req, _res, next) =>
  can(req.user.role, action) ? next() : next(new HttpError(403, "You do not have permission to do that."));

function requestOrigin(req) {
  const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}

// Blocks cross-site form posts. Browsers always send Origin on POST/PUT/DELETE.
// Same-origin posts (the built UI served by this server on Render) are allowed.
export function originGuard(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  if (config.clientOrigins.includes(origin) || origin === requestOrigin(req)) return next();
  return next(new HttpError(403, "Request origin is not allowed."));
}
