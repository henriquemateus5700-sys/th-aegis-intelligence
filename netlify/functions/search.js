
exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };

  const respond = (statusCode, body) => ({
    statusCode,
    headers,
    body: JSON.stringify(body)
  });

  const q = (event.queryStringParameters?.q || "")
    .trim()
    .slice(0, 180);

  if (!q) {
    return respond(400, { error: "Digite um tema para pesquisar." });
  }

  const key = process.env.LANGSEARCH_API_KEY;

  if (!key) {
    return respond(503, {
      error: "Configure LANGSEARCH_API_KEY no Netlify."
    });
  }

  try {
    const response = await fetch(
      "https://api.langsearch.com/v1/web-search",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: `site:chat.whatsapp.com ${q}`,
          count: 10
        })
      }
    );

    if (!response.ok) {
      return respond(502, {
        error: `Erro no serviço de busca: HTTP ${response.status}.`
      });
    }

    const payload = await response.json();

    if (String(payload.code) !== "200") {
      return respond(502, {
        error: "A LangSearch não conseguiu concluir a pesquisa."
      });
    }

    const pages = payload.data?.webPages?.value || [];
    const seen = new Set();

    const results = pages
      .map(item => {
        let url;

        try {
          url = new URL(item.url);
        } catch {
          return null;
        }

        if (
          url.protocol !== "https:" ||
          url.hostname.toLowerCase() !== "chat.whatsapp.com"
        ) {
          return null;
        }

        const link = url.href.replace(/\/+$/, "");

        if (seen.has(link)) return null;
        seen.add(link);

        return {
          title: String(item.name || "Grupo do WhatsApp").slice(0, 180),
          description: String(item.snippet || item.text || "").slice(0, 450),
          url: link
        };
      })
      .filter(Boolean);

    return respond(200, { query: q, results });

  } catch (error) {
    return respond(500, {
      error: "Falha na pesquisa. Tente novamente."
    });
  }
};
