// 수리 실패 기록을 받아 정책 브리프 초안을 작성한다.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 허용됩니다" });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다" });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "내용이 비어 있습니다" });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: String(prompt).slice(0, 8000) }]
      })
    });

    const data = await r.json();
    if (!r.ok || !data.content) {
      const why = data && data.error && data.error.message ? data.error.message : "응답 코드 " + r.status;
      return res.status(502).json({ error: why });
    }

    const text = data.content.filter(c => c.type === "text").map(c => c.text).join("\n");
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message || "알 수 없는 오류" });
  }
}
