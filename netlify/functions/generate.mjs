import { InferenceClient } from "@huggingface/inference";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store"
};
const json = (statusCode, data) => ({
  statusCode,
  headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(data)
});

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST para gerar conteúdo." });

  const token = process.env.HF_TOKEN;
  if (!token) return json(503, { error: "Falta configurar HF_TOKEN nas variáveis de ambiente do Netlify." });

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Pedido inválido." }); }

  const prompt = String(data.prompt || "").trim().slice(0, 1200);
  const mode = data.mode === "video" ? "video" : "image";
  const style = String(data.style || "cinematic, highly detailed").slice(0, 120);
  const ratio = String(data.ratio || "portrait");
  if (!prompt) return json(400, { error: "Escreva uma descrição para gerar." });

  const client = new InferenceClient(token);
  const fullPrompt = `${prompt}. Visual style: ${style}. High quality, coherent composition.`;
  try {
    let blob;
    if (mode === "image") {
      const dims = ratio === "square" ? { width: 768, height: 768 } : ratio === "landscape" ? { width: 768, height: 432 } : { width: 576, height: 1024 };
      blob = await client.textToImage({
        model: "black-forest-labs/FLUX.1-schnell",
        inputs: fullPrompt,
        parameters: { width: dims.width, height: dims.height }
      });
    } else {
      blob = await client.textToVideo({
        model: "Lightricks/LTX-Video",
        inputs: fullPrompt,
        parameters: { num_frames: 25 }
      });
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (!buffer.length) return json(502, { error: "O provedor retornou um arquivo vazio. Tente novamente." });
    return {
      statusCode: 200,
      headers: {
        ...cors,
        "Content-Type": mode === "video" ? "video/mp4" : "image/png",
        "Content-Disposition": `inline; filename="th-aegis-${mode}.${mode === "video" ? "mp4" : "png"}"`
      },
      isBase64Encoded: true,
      body: buffer.toString("base64")
    };
  } catch (err) {
    const message = String(err?.message || "");
    let userMessage = "A geração falhou. Tente novamente em instantes.";
    if (/unauthorized|invalid token|authentication|401|403/i.test(message)) userMessage = "Token HF_TOKEN inválido ou sem permissão de inferência. Confira a chave no Netlify.";
    else if (/402|payment|credit|quota|billing/i.test(message)) userMessage = "A cota gratuita do provedor pode ter acabado ou esse modelo pode exigir créditos.";
    else if (/not found|404|model/i.test(message)) userMessage = "O modelo não está disponível no provedor selecionado. Tente mais tarde ou escolha outro modelo compatível.";
    else if (/timeout|timed out|504/i.test(message)) userMessage = "A geração demorou demais e expirou. Tente um prompt mais curto ou tente novamente.";
    return json(502, { error: userMessage, detail: message.slice(0, 240) });
  }
};
