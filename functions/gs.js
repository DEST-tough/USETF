// Cloudflare Pages Function: functions/gs.js
// Netlify Functions의 gs.js를 Cloudflare Workers 형식으로 변환
// 환경변수 GS_URL은 Cloudflare Pages → Settings → Environment variables에서 설정

export async function onRequest(context) {
  const GS_URL = context.env.GS_URL;

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
      JSON.stringify({ ok: false, error: 'GS_URL not set' }),
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const reqUrl  = new URL(context.request.url);
    const method  = context.request.method;

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
