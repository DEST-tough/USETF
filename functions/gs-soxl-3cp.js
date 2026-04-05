// Cloudflare Pages Function: functions/gs-soxl-3cp.js
// 기존 gs.js와 완전히 독립 — GS_URL_SOXL_3CP 환경변수 사용
// Cloudflare Pages → Settings → Environment variables → GS_URL_SOXL_3CP 추가

export async function onRequest(context) {
  const GS_URL = context.env.GS_URL_SOXL_3CP;

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
      JSON.stringify({ ok: false, error: 'GS_URL_SOXL_3CP not configured' }),
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
      targetUrl = GS_URL;
    } else {
      const params = reqUrl.searchParams.toString();
      targetUrl = params ? `${GS_URL}?${params}` : GS_URL;
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
