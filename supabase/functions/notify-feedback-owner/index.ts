/**
 * Supabase Edge Function: send email via Resend when a row is inserted into `feedback_pins`.
 *
 * Configure Database Webhooks (Dashboard → Database → Webhooks) on `feedback_pins` INSERT
 * to POST to this function URL with service authentication, OR invoke manually with a JSON body.
 *
 * Secrets: RESEND_API_KEY, NOTIFY_TO_EMAIL, RESEND_FROM_EMAIL (optional, default onboarding@resend.dev)
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const NOTIFY_TO = Deno.env.get('NOTIFY_TO_EMAIL');
const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';

type PinRecord = {
  id?: string;
  project_id?: string;
  prototype_url?: string | null;
  comment_text?: string;
  author_name?: string | null;
  created_at?: string;
};

function extractRecord(body: unknown): PinRecord | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const o = body as Record<string, unknown>;
  if (o.record && typeof o.record === 'object') {
    return o.record as PinRecord;
  }
  if (o.type === 'INSERT' && o.record && typeof o.record === 'object') {
    return (o as { record: PinRecord }).record;
  }
  if (typeof o.project_id === 'string') {
    return o as PinRecord;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!RESEND_API_KEY || !NOTIFY_TO) {
    console.error('notify-feedback-owner: missing RESEND_API_KEY or NOTIFY_TO_EMAIL');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const record = extractRecord(payload);
  if (!record?.project_id) {
    return new Response(JSON.stringify({ error: 'No record in payload' }), { status: 400 });
  }

  const directUrl =
    record.prototype_url && record.prototype_url.startsWith('http')
      ? record.prototype_url
      : record.project_id.startsWith('http')
        ? record.project_id
        : `https://${record.project_id}`;

  const subject = `[ExP-Lab] Feedback on ${record.project_id}`;
  const text = [
    `New feedback on prototype scope: ${record.project_id}`,
    '',
    `Author: ${record.author_name ?? 'Guest'}`,
    '',
    record.comment_text ?? '',
    '',
    `Open: ${directUrl}`,
    '',
    `Pin id: ${record.id ?? '—'} · ${record.created_at ?? ''}`,
  ].join('\n');

  const html = `
    <p><strong>Prototype</strong> ${escapeHtml(record.project_id)}</p>
    <p><strong>Author</strong> ${escapeHtml(record.author_name ?? 'Guest')}</p>
    <p><strong>Comment</strong></p>
    <pre style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(record.comment_text ?? '')}</pre>
    <p><a href="${escapeHtml(directUrl)}">Open prototype</a></p>
  `;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [NOTIFY_TO],
      subject,
      text,
      html,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error('Resend error', resendRes.status, errText);
    return new Response(JSON.stringify({ error: 'Resend failed', detail: errText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resendJson = await resendRes.json();
  return new Response(JSON.stringify({ ok: true, resend: resendJson }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
