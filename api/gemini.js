const GEMINI_MODEL_TRYLIST = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  const { parts, jsonMode } = req.body;
  if (!parts || !Array.isArray(parts)) {
    return res.status(400).json({ error: 'Missing parts array' });
  }

  const bodyObj = { contents: [{ parts }] };
  if (jsonMode) {
    bodyObj.generationConfig = { responseMimeType: 'application/json' };
  }

  let lastError = 'No response from Gemini.';

  for (let t = 0; t < GEMINI_MODEL_TRYLIST.length; t++) {
    const model = GEMINI_MODEL_TRYLIST[t];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let response, data;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj)
      });
      data = await response.json();
    } catch (err) {
      lastError = err.message || 'Network error reaching Gemini.';
      if (t < GEMINI_MODEL_TRYLIST.length - 1) continue;
      return res.status(502).json({ error: lastError });
    }

    const text = extractText(data);
    if (text) {
      return res.status(200).json({ text: text.trim().replace(/```json|```/g, '').trim() });
    }

    if (data.error) {
      lastError = data.error.message || 'Gemini error.';
      if (shouldRetry(response.status, data) && t < GEMINI_MODEL_TRYLIST.length - 1) continue;
      return res.status(response.status >= 400 ? response.status : 500).json({ error: lastError });
    }

    lastError = 'No text in Gemini response. Try pasting the chart as text or another photo.';
    if (t < GEMINI_MODEL_TRYLIST.length - 1) continue;
  }

  return res.status(500).json({ error: lastError });
}

function extractText(data) {
  if (!data?.candidates?.[0]?.content?.parts) return null;
  return data.candidates[0].content.parts.map(p => p.text || '').join('') || null;
}

function shouldRetry(status, data) {
  if (status === 429 || status === 404) return true;
  const m = (data?.error?.message || '').toLowerCase();
  return m.includes('quota') || m.includes('exhausted') || m.includes('resource_exhausted') ||
         m.includes('rate limit') || m.includes('free_tier');
}