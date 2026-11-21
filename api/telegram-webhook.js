function reply(res, status, body) {
  res.status(status).json(body);
}

async function sendTelegramMessage(token, chatId, text) {
  const chunks = [];
  let rest = String(text || "").trim();
  while (rest.length > 3900) {
    let cut = rest.lastIndexOf("\n", 3900);
    if (cut < 1800) cut = 3900;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);

  for (const chunk of chunks) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("Telegram sendMessage failed");
  }
}

function allowedUser(userId) {
  const raw = process.env.TELEGRAM_ALLOWED_USER_IDS || "";
  const ids = raw.split(",").map(value => value.trim()).filter(Boolean);
  return ids.includes(String(userId));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(res, 405, { error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !webhookSecret) return reply(res, 503, { error: "Telegram integration is not configured." });

  const receivedSecret = req.headers["x-telegram-bot-api-secret-token"] || "";
  if (receivedSecret !== webhookSecret) return reply(res, 401, { error: "Unauthorized" });

  try {
    const update = req.body || {};
    const message = update.message;
    if (!message || !message.chat || !message.from || typeof message.text !== "string") {
      return reply(res, 200, { ok: true, ignored: true });
    }

    // Keep this personal assistant private: only direct chats are accepted.
    if (message.chat.type !== "private") return reply(res, 200, { ok: true, ignored: true });

    const chatId = message.chat.id;
    const userId = message.from.id;
    const text = message.text.trim();
    if (!text) return reply(res, 200, { ok: true });

    if (/^\/(start|help)(?:@\w+)?(?:\s|$)/i.test(text)) {
      await sendTelegramMessage(token, chatId,
        "سلام! أنا Miro، المساعد ديال Shoplix. 🤖\n\nصيفط ليا رسالة بالدارجة أو العربية أو الفرنسية أو الإنجليزية وغادي نجاوبك.\nكتب /id باش تعرف رقم حساب Telegram ديالك وتفعّل الوصول الشخصي.");
      return reply(res, 200, { ok: true });
    }

    if (/^\/id(?:@\w+)?(?:\s|$)/i.test(text)) {
      await sendTelegramMessage(token, chatId, `Telegram user ID ديالك هو: ${userId}`);
      return reply(res, 200, { ok: true });
    }

    if (!allowedUser(userId)) {
      await sendTelegramMessage(token, chatId,
        "Miro باقي ما تفعّلش لهاد الحساب. كتب /id وخذ الرقم، ومن بعد خاص المالك يضيفو فإعدادات السيرفر.");
      return reply(res, 200, { ok: true });
    }

    const baseUrl = process.env.SHOPLIX_PUBLIC_URL
      ? process.env.SHOPLIX_PUBLIC_URL.replace(/\/$/, "")
      : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

    if (!baseUrl) {
      await sendTelegramMessage(token, chatId, "الخادم مازال ما تعيّنش ليه رابط الموقع.");
      return reply(res, 200, { ok: true });
    }

    const aiResponse = await fetch(`${baseUrl}/api/miro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: text.slice(0, 5000) }] })
    });

    const aiData = await aiResponse.json();
    if (!aiResponse.ok) {
      await sendTelegramMessage(token, chatId, aiData.error || "وقع مشكل فالاتصال مع Miro.");
      return reply(res, 200, { ok: true });
    }

    await sendTelegramMessage(token, chatId, aiData.reply || "ما وصلنيش جواب واضح، عاود جرب.");
    return reply(res, 200, { ok: true });
  } catch (error) {
    // Return 200 so Telegram does not endlessly retry a malformed or failed update.
    return reply(res, 200, { ok: true, handled: false });
  }
}
