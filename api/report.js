export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!resendKey) return res.status(500).json({ error: 'Resend API key not configured' });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const { brand_name, product_name, reason, note, reported_by } = req.body;
  if (!brand_name || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ brand_name, product_name, reason, note, reported_by })
    });
    if (!dbRes.ok) {
      const err = await dbRes.text();
      console.error('Supabase error:', err);
      return res.status(500).json({ error: 'Failed to save report' });
    }
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach database' });
  }

  try {
    const emailBody = `
<h2>New TrueRack Report</h2>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
  <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Brand</td><td style="padding:6px 12px;">${brand_name}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Product</td><td style="padding:6px 12px;">${product_name || '—'}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Reason</td><td style="padding:6px 12px;">${reason}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Note</td><td style="padding:6px 12px;">${note || '—'}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Reported by</td><td style="padding:6px 12px;">${reported_by || 'anonymous'}</td></tr>
</table>
    `.trim();

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`
      },
      body: JSON.stringify({
        from: 'TrueRack Reports <onboarding@resend.dev>',
        to: 'rashid.mekail@gmail.com',
        subject: `[TrueRack] Report: ${brand_name}${product_name ? ' — ' + product_name : ''}`,
        html: emailBody
      })
    });
  } catch (e) {
    console.error('Resend error:', e.message);
  }

  return res.status(200).json({ success: true });
}