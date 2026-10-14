// TH AEGIS - Netlify Function. Keep API key server-side.
exports.handler = async function(event) {
  const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"};
  const respond=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)});
  const q=(event.queryStringParameters&&event.queryStringParameters.q||"").trim().slice(0,180);
  if(!q)return respond(400,{error:"Digite um tema para pesquisar."});
  const key=process.env.BRAVE_SEARCH_API_KEY;
  if(!key)return respond(503,{error:"A busca automática ainda não foi conectada. Configure BRAVE_SEARCH_API_KEY no Netlify."});
  try{
    const apiUrl="https://api.search.brave.com/res/v1/web/search?q="+encodeURIComponent("site:chat.whatsapp.com "+q)+"&count=20&country=BR&search_lang=pt-br";
    const sr=await fetch(apiUrl,{headers:{"Accept":"application/json","X-Subscription-Token":key}});
    if(!sr.ok)return respond(502,{error:"O serviço de busca retornou erro ("+sr.status+"). Confira sua chave e o plano do provedor."});
    const payload=await sr.json(),seen=new Set();
    const candidates=(payload.web&&payload.web.results||[]).map(x=>({title:String(x.title||"Convite de grupo WhatsApp").slice(0,180),description:String(x.description||"").slice(0,450),url:String(x.url||"")})).filter(x=>{
      try{const u=new URL(x.url);if(u.protocol!=="https:"||u.hostname.toLowerCase()!=="chat.whatsapp.com")return false;const k=u.href.replace(/\/+$/,"");if(seen.has(k))return false;seen.add(k);x.url=k;return true}catch{return false}
    }).slice(0,10);
    const results=await Promise.all(candidates.map(async item=>{
      try{
        const resp=await fetch(item.url,{method:"GET",redirect:"follow",signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0 (compatible; THLinkCheck/2.0)","Range":"bytes=0-1024"}});
        if(resp.body&&resp.body.cancel)await resp.body.cancel().catch(()=>{});
        if(resp.status>=200&&resp.status<400)return {...item,check:"reachable",checkMessage:"O endereço respondeu à checagem HTTP. Isso não comprova que o grupo esteja ativo ou aceite participantes."};
        return {...item,check:"unreachable",checkMessage:"A checagem recebeu HTTP "+resp.status+". O destino pode estar indisponível ou bloquear verificações."};
      }catch{return {...item,check:"unknown",checkMessage:"Não foi possível confirmar: o WhatsApp pode bloquear verificações automáticas ou a consulta expirou."}}
    }));
    return respond(200,{query:q,results});
  }catch{return respond(500,{error:"Falha na pesquisa. Tente novamente mais tarde."})}
};
