// Cloudflare Pages Function: functions/dongpa_gs.js
// 환경변수: DONGPA_GS_URL (Cloudflare Pages → Settings → Environment variables)

export async function onRequest(context) {
  const GS_URL = context.env.DONGPA_GS_URL;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!GS_URL) {
    return new Response(
      JSON.stringify({ ok: false, error: 'DONGPA_GS_URL not set' }),
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const reqUrl = new URL(context.request.url);
    const method = context.request.method;

    let targetUrl;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
    };

    if (method === 'POST') {
      options.body = await context.request.text();
      targetUrl    = GS_URL;
    } else {
      const params = reqUrl.searchParams.toString();
      targetUrl    = params ? `${GS_URL}?${params}` : GS_URL;
    }

    const res  = await fetch(targetUrl, options);
    const text = await res.text();
    return new Response(text, { headers: corsHeaders });

  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}
