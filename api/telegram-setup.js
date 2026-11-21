function reply(res, status, body) {
  res.status(status).json(body);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && require("crypto").timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(res, 405, { error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const setupKey = process.env.TELEGRAM_SETUP_KEY;
  const suppliedKey = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

  if (!setupKey || !safeEqual(suppliedKey, setupKey)) return reply(res, 401, { error: "Unauthorized" });
  if (!token || !webhookSecret) return reply(res, 503, { error: "Missing Telegram server configuration." });

  const baseUrl = process.env.SHOPLIX_PUBLIC_URL
    ? process.env.SHOPLIX_PUBLIC_URL.replace(/\/$/, "")
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!baseUrl || !/^https:\/\//i.test(baseUrl)) {
    return reply(res, 400, { error: "Set SHOPLIX_PUBLIC_URL to the deployed HTTPS website URL." });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${baseUrl}/api/telegram-webhook`,
        secret_token: webhookSecret,
        allowed_updates: ["message"],
        drop_pending_updates: true
      })
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      return reply(res, 502, { error: data.description || "Telegram could not set the webhook." });
    }

    return reply(res, 200, { ok: true, message: "Telegram webhook configured.", bot: data.result || true });
  } catch (error) {
    return reply(res, 502, { error: "Could not reach Telegram Bot API." });
  }
}
