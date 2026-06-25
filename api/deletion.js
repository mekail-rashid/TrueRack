export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!resendKey) return res.status(500).json({ error: 'Resend API key not configured' });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const { user_id, email, username, deletion_type, note } = req.body;
  if (!user_id || !deletion_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/deletion_requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ user_id, email, username, deletion_type, note })
    });
    if (!dbRes.ok) {
      const err = await dbRes.text();
      console.error('Supabase error:', err);
      return res.status(500).json({ error: 'Failed to save request' });
    }
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach database' });
  }

  try {
    const emailBody = `
<h2>New TrueRack Deletion Request</h2>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
  <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">User ID</td><td style="padding:6px 12px;">${user_id}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Email</td><td style="padding:6px 12px;">${email || '—'}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Username</td><td style="padding:6px 12px;">${username || '—'}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Deletion Type</td><td style="padding:6px 12px;">${deletion_type}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Note</td><td style="padding:6px 12px;">${note || '—'}</td></tr>
</table>
<p style="margin-top:16px;font-size:12px;color:#999;">Review in your <a href="https://supabase.com">Supabase dashboard</a> → deletion_requests table.</p>
    `.trim();

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`
      },
      body: JSON.stringify({
        from: 'TrueRack Requests <onboarding@resend.dev>',
        to: 'rashid.mekail@gmail.com',
        subject: `[TrueRack] Deletion Request: ${deletion_type} — ${username || email}`,
        html: emailBody
      })
    });
  } catch (e) {
    console.error('Resend error:', e.message);
  }

  return res.status(200).json({ success: true });
}