exports.handler = async function(event) {
  var GS_URL = process.env.GS_URL;
  if (!GS_URL) return { statusCode: 500, body: JSON.stringify({ ok: false, error: "GS_URL not set" }) };

  try {
    var options = {
      method: event.httpMethod === "POST" ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      redirect: "follow",
    };
    if (event.httpMethod === "POST") {
      options.body = event.body;
    }

    var url = event.httpMethod === "GET"
      ? GS_URL + "?" + new URLSearchParams(event.queryStringParameters || {}).toString()
      : GS_URL;

    var res = await fetch(url, options);
    var text = await res.text();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: text,
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};
