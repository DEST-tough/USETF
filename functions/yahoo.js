// Cloudflare Pages Function: functions/yahoo.js
export async function onRequest(context) {
  const url    = new URL(context.request.url);
  let symbol   = url.searchParams.get('symbol') || '';
  const range    = url.searchParams.get('range')    || '1y';
  const interval = url.searchParams.get('interval') || '1d';

  // %5E → ^ 변환 (브라우저가 ^를 자동으로 %5E로 인코딩하는 문제 대응)
  symbol = symbol.replace(/%5E/gi, '^');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!symbol) {
    return new Response(JSON.stringify({ error: 'symbol required' }), {
      status: 400, headers: corsHeaders,
    });
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includeAdjustedClose=true`;

  try {
    const res = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
      },
    });

    const data = await res.text();
    return new Response(data, {
      headers: {
        ...corsHeaders,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: corsHeaders,
    });
  }
}
