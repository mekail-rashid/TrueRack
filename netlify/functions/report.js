exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const resendKey = process.env.RESEND_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!resendKey) return { statusCode: 500, body: JSON.stringify({ error: 'Resend API key not configured' }) };
  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase not configured:', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    console.error('Failed to parse event body');
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { brand_name, product_name, reason, note, reported_by } = body;
  if (!brand_name || !reason) {
    console.error('Missing required fields - brand_name:', brand_name, 'reason:', reason);
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  console.log('[Report] Received:', { brand_name, product_name, reason, from: reported_by });

  // Save to Supabase
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
      console.error('[Report] Supabase failed:', { status: dbRes.status, error: err });
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save report' }) };
    }
    console.log('[Report] Saved to Supabase');
  } catch (e) {
    console.error('[Report] Supabase connection failed:', e.message);
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not reach database' }) };
  }

  // Send email via Resend
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
<p style="margin-top:16px;font-size:12px;color:#999;">Review in your <a href="https://supabase.com">Supabase dashboard</a> → reports table.</p>
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
    console.log('[Report] Email sent');
  } catch (e) {
    console.warn('[Report] Email failed (non-fatal):', e.message);
    // Email failure is non-fatal — report was already saved
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
};
