const crypto = require('crypto');

exports.webhook = async (req, res) => {
  const s = process.env.LINE_CHANNEL_SECRET || '';
  const h = req.get('x-line-signature') || '';
  if (!s || !h) {
    console.log("🟥 Return 403: missing secret or signature");
    return res.status(403).send('signature invalid');
  }

  // 署名 = HMAC-SHA256(生ボディ, channel secret)をBase64にして比較
  const calc = crypto.createHmac('sha256', s)
                     .update(req.rawBody || Buffer.alloc(0))
                     .digest('base64');

  if (!(h.length === calc.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(calc)))) {
    console.log("🟥 Return 403: signature mismatch");
    return res.status(403).send('signature invalid');
  }

  // LINEの推奨：2秒以内に200（以降は非同期でOK）
  console.log("🟩 Return 200: signature verified");
  res.status(200).send('OK');

  const gasUrl = process.env.GAS_WEBHOOK_URL;
  if (!gasUrl) return;

  const relayKey = process.env.RELAY_SECRET || '';
  const rawBase64 = Buffer.from(req.rawBody).toString("base64");
  const relaySignature = crypto
    .createHmac("sha256", relayKey)
    .update(req.rawBody)  // バイトそのまま
    .digest("base64");
  try {
    await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw: rawBase64,
        meta: {
          relaySignature,
          receivedAt: new Date().toISOString(),
        },
      }),
    });
    console.log("relay OK");
  } catch (e) {
    console.error('relay failed:', e);
  }
};
