export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Miro AI is not configured yet." });

  try {
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length || messages.length > 30) {
      return res.status(400).json({ error: "Send between 1 and 30 messages." });
    }

    const clean = messages
      .filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string")
      .map(m => ({ role: m.role, content: m.content.slice(0, 6000) }));

    if (!clean.length || clean[clean.length - 1].role !== "user") {
      return res.status(400).json({ error: "A user message is required." });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions: [
          "You are Miro, the friendly personal AI assistant inside the Shoplix app.",
          "Understand and reply naturally in the language used by the user, including Moroccan Darija written in Latin or Arabic script, Modern Standard Arabic, French, and English.",
          "Be warm, clear, concise, and conversational. Understand typos and informal spelling.",
          "You may explain how to use Shoplix, but do not claim you changed tasks, alarms, sleep settings, or app data unless the app explicitly provides and confirms that action through tools.",
          "If the user asks you to perform an app action that is not available to you, explain that clearly and guide them rather than pretending it was done.",
          "Never reveal secrets, API keys, or server configuration."
        ].join(" "),
        input: clean
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: data?.error?.message || "The AI service could not complete the request."
      });
    }

    const answer = (data.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n")
      .trim();

    return res.status(200).json({ reply: answer || "سمح ليا، ما قدرتش نوجد جواب دابا." });
  } catch (error) {
    return res.status(500).json({ error: "Unexpected server error." });
  }
}
