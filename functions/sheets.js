/**
 * Cloudflare Pages Function: functions/sheets.js
 * Google Sheets CSV CORS 프록시
 *
 * 사용법: /sheets?url=<encoded_sheets_csv_url>
 */

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type':                 'text/csv; charset=utf-8',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const params = new URL(context.request.url).searchParams;
  const target = params.get('url');

  if (!target) {
    return new Response('url 파라미터 필요', { status: 400, headers: corsHeaders });
  }

  // 구글 시트만 허용
  let decoded;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return new Response('잘못된 URL', { status: 400, headers: corsHeaders });
  }

  if (!decoded.includes('docs.google.com/spreadsheets')) {
    return new Response('Google Sheets URL만 허용됩니다', { status: 403, headers: corsHeaders });
  }

  try {
    const res = await fetch(decoded, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FLOW-Dashboard/2.4)',
        'Accept':     'text/csv, text/plain, */*',
      },
    });

    const text = await res.text();

    return new Response(text, {
      status: res.status,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'public, max-age=60',  // 1분 캐시
      },
    });
  } catch (e) {
    return new Response('프록시 오류: ' + e.message, { status: 502, headers: corsHeaders });
  }
}
