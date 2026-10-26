import path from "node:path";

// In development, localhost and 127.0.0.1 are the same machine but different browser origins.
// Accept both so the app works whichever one is typed in the address bar.
const withLoopbackTwins = (origins, isProd) => {
  if (isProd) return origins;
  const out = new Set(origins);
  for (const o of origins) {
    out.add(o.replace("//localhost", "//127.0.0.1"));
    out.add(o.replace("//127.0.0.1", "//localhost"));
  }
  return [...out];
};

const int = (v, d) => (v === undefined || v === "" ? d : Number.parseInt(v, 10));

// Pure function so it can be tested. The running server uses env.js.
export function loadConfig(env) {
  const isProd = env.NODE_ENV === "production";
  const problems = [];

  const jwtSecret = env.JWT_SECRET || "";
  if (jwtSecret.length < 32) problems.push("JWT_SECRET must be set and at least 32 characters long.");

  const mongoUri = env.MONGO_URI || (isProd ? "" : "mongodb://127.0.0.1:27017/servicedesk");
  if (!mongoUri) problems.push("MONGO_URI is required in production.");

  const devEcho = env.OTP_DEV_ECHO === "true";
  const provider = env.NOTIFY_PROVIDER || "console";
  if (!["console", "smtp", "resend"].includes(provider)) problems.push("NOTIFY_PROVIDER must be console, smtp or resend.");
  if (isProd && devEcho) problems.push("OTP_DEV_ECHO must not be true in production (it returns the OTP to the caller).");
  if (isProd && provider === "console") problems.push("NOTIFY_PROVIDER=console only prints OTPs in the log. Use smtp or resend in production.");
  if (provider === "smtp" && !env.SMTP_HOST) problems.push("SMTP_HOST is required when NOTIFY_PROVIDER=smtp.");
  if (provider === "resend") {
    if (!env.RESEND_API_KEY) problems.push("RESEND_API_KEY is required when NOTIFY_PROVIDER=resend.");
    if (!env.MAIL_FROM) problems.push("MAIL_FROM is required when NOTIFY_PROVIDER=resend (example: Qtech Service Desk <noreply@YOUR-VERIFIED-DOMAIN>).");
  }

  const storageDriver = env.STORAGE_DRIVER || (isProd ? "gridfs" : "disk");
  if (!["disk", "gridfs"].includes(storageDriver)) problems.push("STORAGE_DRIVER must be disk or gridfs.");

  if (problems.length) throw new Error("Invalid configuration:\n- " + problems.join("\n- "));

  return {
    isProd,
    port: int(env.PORT, 5000),
    mongoUri,
    jwtSecret,
    tokenHours: 8,
    clientOrigins: withLoopbackTwins((env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean), isProd),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : isProd,
    storageDriver,
    uploadDir: path.resolve(env.UPLOAD_DIR || "./uploads"),
    staticDir: env.STATIC_DIR ? path.resolve(env.STATIC_DIR) : "",
    tz: env.TZ_NAME || "Asia/Kolkata",
    trustProxy: env.TRUST_PROXY !== undefined && env.TRUST_PROXY !== "" ? int(env.TRUST_PROXY, 1) : isProd ? 1 : 0,
    bcryptRounds: int(env.BCRYPT_ROUNDS, 12),
    loginRateMax: int(env.LOGIN_RATE_MAX, 10),
    otp: {
      length: int(env.OTP_LENGTH, 6),
      ttlMinutes: int(env.OTP_TTL_MINUTES, 10),
      maxAttempts: int(env.OTP_MAX_ATTEMPTS, 5),
      resendSeconds: int(env.OTP_RESEND_SECONDS, 30),
      maxPerHour: int(env.OTP_MAX_PER_HOUR, 5),
      devEcho,
    },
    notify: {
      provider,
      smtp: {
        host: env.SMTP_HOST,
        port: int(env.SMTP_PORT, 587),
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.SMTP_FROM || "Qtech Service Desk <no-reply@localhost>",
      },
      resend: {
        apiKey: env.RESEND_API_KEY || "",
        from: env.MAIL_FROM || "",
      },
    },
  };
}
