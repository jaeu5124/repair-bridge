// 진단 요청을 받아 Claude에게 물어보고 JSON으로 돌려준다.
// API 키는 이 파일이 실행되는 서버에만 있고 브라우저로는 절대 나가지 않는다.

const PROMPT = `당신은 전자제품·의류·가구 수리 진단 전문가입니다.
사용자가 올린 고장난 물건 사진과 증상 설명을 보고 진단하세요.

반드시 아래 JSON 형식으로만 응답하세요. 마크다운 백틱, 설명, 서론 없이 JSON만 출력합니다.

{
  "item_name": "물건 이름 (한국어). 사용자가 품목을 밝혔다면 반드시 그 품목으로 적으세요",
  "category": "스마트폰|노트북|태블릿|소형가전|대형가전|의류|가구|기타 중 하나",
  "confidence": "높음|보통|낮음",
  "symptom": "사진과 설명으로 추정한 고장 원인 (2문장 이내)",
  "difficulty": "자가수리 가능|부분 수리|전문가 필요|수리 불가 중 하나",
  "steps": ["수리 단계 3~5개"],
  "tools": ["필요한 공구 2~4개"],
  "cost_min": 숫자(원),
  "cost_max": 숫자(원),
  "parts_risk": "조달 가능|단종 우려|조달 불가 중 하나",
  "parts_reason": "부품 조달 판단 근거 (1문장)",
  "safety": "감전·배터리 등 안전 경고 1문장. 없으면 빈 문자열"
}

사용자가 밝힌 품목과 다른 물건으로 진단하지 마세요.
진단이 불확실하면 confidence를 낮음으로 두되 반드시 추정값을 채우세요.
리튬배터리가 포함된 제품이면 safety에 반드시 경고를 넣으세요.`;

function extractJSON(text) {
  const t = text.replace(/```json|```/g, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("JSON 형식을 찾지 못했습니다");
  return JSON.parse(t.slice(s, e + 1));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 허용됩니다" });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다" });
  }

  try {
    const { note, image } = req.body || {};
    if (!note && !image) {
      return res.status(400).json({ error: "증상 설명이나 사진이 필요합니다" });
    }

    const content = [];
    if (image && image.data) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: image.media_type || "image/jpeg", data: image.data }
      });
    }
    content.push({
      type: "text",
      text: PROMPT +
        (image ? "" : "\n\n사진이 없습니다. 설명만으로 추정하고 confidence를 낮춰 잡으세요.") +
        "\n\n사용자 증상 설명: " + (note || "(설명 없음)")
    });

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
        messages: [{ role: "user", content }]
      })
    });

    const data = await r.json();
    if (!r.ok || !data.content) {
      const why = data && data.error && data.error.message ? data.error.message : "응답 코드 " + r.status;
      return res.status(502).json({ error: why });
    }

    const text = data.content.filter(c => c.type === "text").map(c => c.text).join("\n");
    return res.status(200).json({ result: extractJSON(text) });
  } catch (e) {
    return res.status(500).json({ error: e.message || "알 수 없는 오류" });
  }
}
