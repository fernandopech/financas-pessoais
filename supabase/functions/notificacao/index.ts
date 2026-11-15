// Recebe as notificações dos apps de banco (MacroDroid no celular do usuário), grava o bruto em public.notificacoes
// e, quando a notificação tem valor de um app mapeado, cria um lançamento "a_confirmar" em public.transacoes (ler.ts).
// Autenticação: header "x-token" (ou ?t=) igual ao segredo NOTIF_TOKEN, criado por ele no painel do Supabase.
// O valor nunca passa pelo chat nem pelo repositório. verify_jwt = false: a função faz a própria checagem.
// Desde 15/11/2026, cada lançamento (e cada compra negada/fatura ignorada) vira mensagem no Telegram (_shared/telegram.ts).
import { ler, saldoFlash } from "./ler.ts";
import { avisar } from "../_shared/telegram.ts";

// manda a mensagem do Telegram em segundo plano: a resposta ao MacroDroid não espera o Telegram
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
function emSegundoPlano(p: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p.catch(() => {}));
  else p.catch(() => {});
}

const TOKEN = Deno.env.get("NOTIF_TOKEN") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

async function rest(path: string, init: RequestInit = {}) {
  return await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("use POST", { status: 405 });
  const q = new URL(req.url).searchParams;
  const tok = req.headers.get("x-token") ?? q.get("t") ?? "";
  if (TOKEN.length < 16) return new Response("token ainda não configurado", { status: 503 });
  if (tok !== TOKEN) return new Response("não autorizado", { status: 401 });

  const raw = await req.text();
  if (raw.length > 20000) return new Response("grande demais", { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    body = { texto: raw }; // texto com aspas pode quebrar o JSON montado no celular: guarda tudo como texto
  }
  const texto = String(body.texto ?? body.text ?? "").trim();
  if (!texto) return new Response("sem texto", { status: 400 });
  const app = String(body.app ?? q.get("app") ?? "desconhecido").slice(0, 200);
  const titulo = body.titulo == null ? null : String(body.titulo).slice(0, 500);
  if (texto.startsWith("{notification") || app.startsWith("{not_")) return new Response(JSON.stringify({ ok: true, teste: true }));

  // a mesma notificação repetida em até 10 min (o celular às vezes reenvia) não entra de novo
  const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const dup = await rest(`notificacoes?select=id&app=eq.${encodeURIComponent(app)}&texto=eq.${encodeURIComponent(texto.slice(0, 4000))}&recebida_em=gte.${desde}`);
  if (dup.ok && (await dup.json()).length > 0) return new Response(JSON.stringify({ ok: true, repetida: true }));

  const agora = new Date();
  const ins = await rest("notificacoes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ recebida_em: agora.toISOString(), app, titulo, texto: texto.slice(0, 4000), bruto: body }),
  });
  if (!ins.ok) return new Response("erro ao gravar", { status: 500 });
  const [notif] = await ins.json();

  // leitura: se falhar, a notificação fica gravada e sem processar (revisão manual)
  try {
    const l = ler(app, titulo, texto, agora);
    let transacao_id: string | null = null;
    if (l.acao === "lancar") {
      const t = await rest("transacoes", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...l.lancamento, origem: "notificacao", status: "a_confirmar",
          id_externo: `notif:${notif.id}`, notas: "automático: lido da notificação do celular",
        }),
      });
      if (t.ok) transacao_id = (await t.json())[0].id;
    }
    const saldo = saldoFlash(app, texto);
    if (saldo !== null && l.acao === "lancar") {
      await rest("saldos?on_conflict=conta_id,data", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ conta_id: "conta-beneficio", data: l.lancamento.data, valor: saldo, origem: "notificacao" }),
      });
    }
    await rest(`notificacoes?id=eq.${notif.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        processada: l.acao === "ignorar" || transacao_id !== null, transacao_id,
        categoria_lida: l.acao === "lancar" && transacao_id ? l.lancamento.categoria_id : null,
      }),
    });
    if (transacao_id) emSegundoPlano(avisar(notif.id));
    else if (l.acao === "ignorar") emSegundoPlano(avisar(notif.id, { motivo: l.motivo, app }));
    return new Response(JSON.stringify({ ok: true, leitura: l.acao, motivo: l.motivo }), { headers: { "Content-Type": "application/json" } });
  } catch (_e) {
    return new Response(JSON.stringify({ ok: true, leitura: "erro" }), { headers: { "Content-Type": "application/json" } });
  }
});
