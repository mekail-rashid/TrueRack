const GEMINI_MODEL_TRYLIST = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];

exports.handler = async function(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Gemini API key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { parts, jsonMode } = body;
  if (!parts || !Array.isArray(parts)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing parts array' }) };
  }

  const bodyObj = { contents: [{ parts }] };
  if (jsonMode) {
    bodyObj.generationConfig = { responseMimeType: 'application/json' };
  }

  let lastError = 'No response from Gemini.';

  for (let t = 0; t < GEMINI_MODEL_TRYLIST.length; t++) {
    const model = GEMINI_MODEL_TRYLIST[t];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let res, data;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj)
      });
      data = await res.json();
    } catch (err) {
      lastError = err.message || 'Network error reaching Gemini.';
      if (t < GEMINI_MODEL_TRYLIST.length - 1) continue;
      return { statusCode: 502, body: JSON.stringify({ error: lastError }) };
    }

    // Extract text from response
    const text = extractText(data);
    if (text) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim().replace(/```json|```/g, '').trim() })
      };
    }

    // Check if we should retry with another model
    if (data.error) {
      lastError = data.error.message || 'Gemini error.';
      if (shouldRetry(res.status, data) && t < GEMINI_MODEL_TRYLIST.length - 1) continue;
      return { statusCode: res.status >= 400 ? res.status : 500, body: JSON.stringify({ error: lastError }) };
    }

    lastError = 'No text in Gemini response. Try pasting the chart as text or another photo.';
    if (t < GEMINI_MODEL_TRYLIST.length - 1) continue;
  }

  return { statusCode: 500, body: JSON.stringify({ error: lastError }) };
};

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
