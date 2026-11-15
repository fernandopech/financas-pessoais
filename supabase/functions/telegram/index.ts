// Webhook do bot do Telegram (proposta em supabase/proposta-telegram.md, aprovada em 15/11/2026).
// Recebe os cliques nos botões das mensagens de lançamento e os comandos (/start, /semana, /hoje, /mes).
// Lê tudo do banco na hora (limites em `orcamentos`, gastos nas views): o que for decidido nas sessões e gravado lá aparece aqui.
// verify_jwt = false: a função faz a própria checagem (segredo do webhook + chat do usuário).
// Só mexe em transações origem='notificacao' ligadas à notificação do botão. Cada gravação é condicional ao estado esperado.
import {
  avisar, brl, carregar, CATS, CHAT_ID, hojeSP, iguais, rest, restJson, tecladoDesfazer, tecladoInicial, tecladoMenu,
  textoMensagem, tg,
} from "../_shared/telegram.ts";

const SEGREDO = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
const NOTA = "automático: lido da notificação do celular";
const ok = () => new Response("ok");

Deno.serve(async (req: Request) => {
  if (SEGREDO.length < 16) return new Response("segredo não configurado", { status: 503 });
  if (req.method !== "POST") return new Response("use POST", { status: 405 });
  if (!iguais(req.headers.get("x-telegram-bot-api-secret-token") ?? "", SEGREDO)) return new Response("não autorizado", { status: 401 });

  let u: Record<string, any>;
  try { u = await req.json(); } catch { return ok(); }
  try {
    if (u.message) await mensagem(u.message);
    else if (u.callback_query) await clique(u.callback_query);
  } catch (_e) { /* responde 200 para o Telegram não reenviar sem parar */ }
  return ok();
});

// ---------- comandos ----------
async function mensagem(m: Record<string, any>) {
  const chat = String(m.chat?.id ?? "");
  const texto = String(m.text ?? "").trim();
  if (!CHAT_ID) {
    // ainda não configurado: só o /start responde, dizendo o número do chat
    if (texto.startsWith("/start")) {
      await tg("sendMessage", { chat_id: chat, text: `Número deste chat: ${chat}\nColoque em TELEGRAM_CHAT_ID nos segredos do Supabase e mande /start de novo.` });
    }
    return;
  }
  if (chat !== CHAT_ID) return; // qualquer outro chat: silêncio
  if (texto.startsWith("/start")) return await inicio();
  if (texto.startsWith("/semana")) return await semana();
  if (texto.startsWith("/hoje")) return await hoje();
  if (texto.startsWith("/mes") || texto.startsWith("/mês")) return await mes();
  await tg("sendMessage", { chat_id: CHAT_ID, text: AJUDA });
}

// lista que aparece ao digitar "/" (registrada no Telegram a cada /start)
const COMANDOS = [
  { command: "semana", description: "Gasto da semana × limite" },
  { command: "hoje", description: "O que entrou hoje" },
  { command: "mes", description: "Gasto do mês por categoria" },
];
const AJUDA = "Comandos: /semana · /hoje · /mes";
const EMOJI: Record<string, string> = {
  "Alimentação": "🍽️", "Transporte": "🚌", "Saúde": "💊", "Compras": "🛍️", "Lazer": "🎉", "Moradia": "🏠",
  "Educação": "📚", "Assinaturas": "📺", "Cuidados pessoais": "💈", "Presentes": "🎁", "Outros gastos": "📦",
};
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const linhaCat = (c: string, v: number) => `${EMOJI[c] ?? "•"} ${c}: ${brl(v)}`;
const pendTxt = (n: number) => (n ? `\n\n⏳ ${n} ainda a confirmar` : "");

async function inicio() {
  await tg("setMyCommands", { commands: COMANDOS }).catch(() => {});
  const pend = await restJson(
    "notificacoes?select=id,transacoes!notificacoes_transacao_id_fkey!inner(status,origem)&telegram_msg_id=is.null&decisao=is.null" +
      "&transacoes.status=eq.a_confirmar&transacoes.origem=eq.notificacao&order=recebida_em.asc",
  );
  await tg("sendMessage", {
    chat_id: CHAT_ID,
    text: `Bot ligado ✅ Cada notificação dos bancos chega aqui para você confirmar.\n${AJUDA}${pend.length ? `\nMandando ${pend.length} que estavam esperando:` : ""}`,
  });
  for (const p of pend) await avisar(p.id);
}

async function semana() {
  const hojeD = new Date(hojeSP() + "T12:00:00Z");
  const seg = new Date(hojeD.getTime() - ((hojeD.getUTCDay() + 6) % 7) * 86400000);
  const ini = seg.toISOString().slice(0, 10), fim = new Date(seg.getTime() + 6 * 86400000).toISOString().slice(0, 10);
  const linhas: { categoria: string; gasto: number; gasto_semana: number; limite_semanal: number | null }[] =
    await restJson(`v_semana?semana=eq.${ini}&select=categoria,gasto,gasto_semana,limite_semanal&order=gasto.desc`);
  const pend = await restJson(`v_gastos?select=id&data=gte.${ini}&data=lte.${fim}&status=in.(a_confirmar,revisar)`);
  const total = Number(linhas[0]?.gasto_semana ?? 0);
  const lim = linhas[0]?.limite_semanal == null ? null : Number(linhas[0].limite_semanal);
  let txt = `📊 Semana ${dm(ini)} – ${dm(fim)}\n`;
  if (lim == null) txt += `Gastei ${brl(total)}\n(sem limite cadastrado)`;
  else txt += `Gastei ${brl(total)} de ${brl(lim)}\n${total <= lim ? `Sobram ${brl(lim - total)}` : `${brl(total - lim)} acima do limite`}`;
  if (linhas.length) txt += "\n\n" + linhas.map((l) => linhaCat(l.categoria, Number(l.gasto))).join("\n");
  await tg("sendMessage", { chat_id: CHAT_ID, text: txt + pendTxt(pend.length) });
}

async function hoje() {
  const d = hojeSP();
  const ts: { valor: number; direcao: string; estabelecimento: string | null; descricao: string | null; status: string; categorias: { nome: string; natureza: string } }[] =
    await restJson(`transacoes?data=eq.${d}&select=valor,direcao,estabelecimento,descricao,status,categorias(nome,natureza)&order=criado_em.asc`);
  let txt = `📅 Hoje, ${dm(d)}\n`;
  if (!ts.length) return await tg("sendMessage", { chat_id: CHAT_ID, text: txt + "Nada entrou hoje." });
  const gasto = ts.filter((t) => t.categorias?.natureza === "gasto").reduce((s, t) => s + (t.direcao === "saida" ? 1 : -1) * Number(t.valor), 0);
  txt += `Gastei ${brl(gasto)}\n\n`;
  txt += ts.map((t) => {
    const nat = t.categorias?.natureza;
    const em = nat === "gasto" ? (t.direcao === "saida" ? EMOJI[t.categorias.nome] ?? "🛒" : "↩️") : nat === "transferencia" ? "🔁" : nat === "investimento" ? "📈" : t.direcao === "entrada" ? "💰" : "•";
    const lugar = (t.estabelecimento ?? t.descricao ?? "").replace(/\s+/g, " ").slice(0, 30);
    return `${em} ${brl(Number(t.valor))} · ${lugar}${t.status !== "confirmada" ? " ⏳" : ""}`;
  }).join("\n");
  const n = ts.filter((t) => t.status !== "confirmada").length;
  await tg("sendMessage", { chat_id: CHAT_ID, text: txt + pendTxt(n) });
}

async function mes() {
  const d = hojeSP(), ini = d.slice(0, 8) + "01";
  const linhas: { categoria: string; gasto: number; orcado: number | null }[] =
    await restJson(`v_mes?mes=eq.${ini}&select=categoria,gasto,orcado&order=gasto.desc`);
  const pend = await restJson(`v_gastos?select=id&data=gte.${ini}&data=lte.${d}&status=in.(a_confirmar,revisar)`);
  const total = linhas.reduce((s, l) => s + Number(l.gasto), 0);
  let txt = `🗓️ ${MESES[Number(d.slice(5, 7)) - 1]}/${d.slice(0, 4)} (até ${dm(d)})\nGastei ${brl(total)}`;
  if (linhas.length) {
    txt += "\n\n" + linhas.map((l) => linhaCat(l.categoria, Number(l.gasto)) + (l.orcado != null ? ` de ${brl(Number(l.orcado))}` : "")).join("\n");
  }
  await tg("sendMessage", { chat_id: CHAT_ID, text: txt + pendTxt(pend.length) });
}

// ---------- cliques ----------
async function clique(q: Record<string, any>) {
  const resp = (text?: string) => tg("answerCallbackQuery", { callback_query_id: q.id, ...(text ? { text } : {}) }).catch(() => {});
  if (String(q.message?.chat?.id ?? "") !== CHAT_ID || !CHAT_ID) return;
  const msgId = q.message.message_id;
  const partes = String(q.data ?? "").split(":");
  const acao = partes[0], nid = partes[partes.length - 1];
  const k = acao === "k" ? Number(partes[1]) : -1;

  const { n, t } = await carregar(nid);
  if (!n || !t || t.origem !== "notificacao") {
    await tg("editMessageReplyMarkup", { chat_id: CHAT_ID, message_id: msgId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    return await resp("Já resolvido (o lançamento foi substituído pelo extrato).");
  }

  // só muda os botões
  if (acao === "e" || acao === "v") {
    if (n.decisao) return await resp("Já resolvido.");
    await tg("editMessageReplyMarkup", { chat_id: CHAT_ID, message_id: msgId, reply_markup: acao === "e" ? tecladoMenu(nid, t.direcao) : tecladoInicial(nid) });
    return await resp();
  }

  let decisao: string | null, mudanca: Record<string, unknown>;
  if (acao === "c") { decisao = "confirmada"; mudanca = { status: "confirmada" }; }
  else if (acao === "k" && CATS[k]) { decisao = "corrigida"; mudanca = { status: "confirmada", categoria_id: CATS[k][0] }; }
  else if (acao === "x") { decisao = "descartada"; mudanca = { status: "confirmada", categoria_id: "cat-ajuste", notas: `${NOTA} · descartado pelo usuário no Telegram` }; }
  else if (acao === "r") { decisao = "revisar"; mudanca = { status: "revisar" }; }
  else if (acao === "u") { decisao = null; mudanca = { status: "a_confirmar", categoria_id: n.categoria_lida ?? t.categoria_id, notas: NOTA }; }
  else return await resp();

  // trava: grava a decisão só se o estado for o esperado (toque duplo não grava duas vezes)
  const filtro = decisao === null ? "decisao=not.is.null" : "decisao=is.null";
  const trava = await restJson(`notificacoes?id=eq.${nid}&${filtro}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ decisao, decidida_em: decisao ? new Date().toISOString() : null }),
  });
  if (!trava.length) return await resp("Já resolvido.");

  const r = await rest(`transacoes?id=eq.${t.id}&origem=eq.notificacao`, { method: "PATCH", body: JSON.stringify(mudanca) });
  if (!r.ok) {
    // desfaz a trava para poder tentar de novo
    await rest(`notificacoes?id=eq.${nid}`, { method: "PATCH", body: JSON.stringify({ decisao: n.decisao, decidida_em: null }) });
    return await resp("Não consegui gravar. Tente de novo.");
  }

  const novo = await carregar(nid);
  if (novo.n && novo.t) {
    await tg("editMessageText", {
      chat_id: CHAT_ID, message_id: msgId, text: textoMensagem(novo.n, novo.t, novo.cat),
      reply_markup: decisao === null ? tecladoInicial(nid) : tecladoDesfazer(nid),
    });
  }
  await resp(decisao === null ? "Desfeito." : "Gravado ✅");
}
