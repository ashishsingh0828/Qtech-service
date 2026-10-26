// Usage: npm run test:mail -- someone@example.com
import { config } from "../src/env.js";
import { sendTestEmail } from "../src/services/notifier.js";

const to = (process.argv[2] || "").trim();
if (!to || !to.includes("@")) {
  console.error("Usage: npm run test:mail -- someone@example.com");
  process.exit(1);
}

try {
  await sendTestEmail(config.notify, { to });
  console.log(`Sent a test email to ${to} using NOTIFY_PROVIDER=${config.notify.provider}.`);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
