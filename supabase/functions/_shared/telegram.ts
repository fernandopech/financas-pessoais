// Bot do Telegram que confirma os lançamentos lidos das notificações (proposta em supabase/proposta-telegram.md).
// Usado pela função `notificacao` (manda a mensagem) e pela função `telegram` (recebe cliques e comandos).
// Segredos no painel do Supabase: TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CHAT_ID. Nunca no repositório.

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
export const TG_TOKEN = Deno.env.get("TELEGRAM_TOKEN") ?? "";
export const CHAT_ID = (Deno.env.get("TELEGRAM_CHAT_ID") ?? "").trim();

export async function rest(path: string, init: RequestInit = {}) {
  return await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
}
export async function restJson(path: string, init: RequestInit = {}) {
  const r = await rest(path, init);
  return r.ok ? await r.json() : [];
}

export async function tg(metodo: string, payload: Record<string, unknown>) {
  if (TG_TOKEN.length < 20) throw new Error("TELEGRAM_TOKEN não configurado");
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  const j = await r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }));
  if (!j.ok) throw new Error(String(j.description ?? "erro do Telegram").slice(0, 300));
  return j.result;
}

// ---------- categorias dos menus (o índice vai no botão; nunca mudar a ordem, só acrescentar no fim) ----------
export const CATS: [string, string][] = [
  ["cat-alimentacao", "Alimentação"], ["cat-transporte", "Transporte"], ["cat-saude", "Saúde"],
  ["cat-compras", "Compras"], ["cat-lazer", "Lazer"], ["cat-moradia", "Moradia"],
  ["cat-educacao", "Educação"], ["cat-assinaturas", "Assinaturas"], ["cat-cuidados", "Cuidados pessoais"],
  ["cat-presentes", "Presentes"], ["cat-outros-gasto", "Outros gastos"],
  ["cat-familia", "Família"], ["cat-outras-receitas", "Outras receitas"], ["cat-salario", "Salário"],
  ["cat-rendimentos", "Rendimentos"], ["cat-transferencia", "Transferência minha"],
];
const MENU_SAIDA = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15];
const MENU_ENTRADA = [11, 12, 13, 14, 15];

const CONTA: Record<string, string> = {
  "conta-principal": "C6", "conta-beneficio": "Flash", "cartao-1": "Mercado Pago", "conta-carteira": "Mercado Pago",
  "conta-salario": "Santander", "cartao-2": "Santander Free",
};
const CREDITO = new Set(["cartao-1", "cartao-2"]);

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const brl = (v: number) =>
  "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// data e hora no fuso America/Sao_Paulo (UTC-3, sem horário de verão)
const sp = (d: Date) => new Date(d.getTime() - 3 * 3600 * 1000);
export const hojeSP = () => sp(new Date()).toISOString().slice(0, 10);
function quando(iso: string): string {
  const d = sp(new Date(iso));
  const dia = d.toISOString().slice(0, 10);
  const hora = d.toISOString().slice(11, 16);
  const hoje = hojeSP();
  const ontem = sp(new Date(Date.now() - 86400000)).toISOString().slice(0, 10);
  if (dia === hoje) return `hoje ${hora}`;
  if (dia === ontem) return `ontem ${hora}`;
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)} ${hora}`;
}

function forma(conta_id: string, texto: string): string {
  const t = semAcento(texto);
  if (conta_id === "conta-beneficio") return "";
  if (/\bpix\b/.test(t)) return "Pix";
  if (CREDITO.has(conta_id) || /credito/.test(t)) return "crédito";
  if (/debito/.test(t)) return "débito";
  return "";
}

type Notif = { id: string; recebida_em: string; app: string; titulo: string | null; texto: string; transacao_id: string | null; decisao: string | null; categoria_lida: string | null; telegram_msg_id: number | null };
type Trans = { id: string; valor: number; direcao: string; categoria_id: string; estabelecimento: string | null; conta_id: string; status: string; origem: string };

export async function carregar(nid: string): Promise<{ n: Notif | null; t: Trans | null; cat: { nome: string; natureza: string } | null }> {
  const [n] = await restJson(`notificacoes?id=eq.${encodeURIComponent(nid)}&select=id,recebida_em,app,titulo,texto,transacao_id,decisao,categoria_lida,telegram_msg_id`);
  if (!n || !n.transacao_id) return { n: n ?? null, t: null, cat: null };
  const [t] = await restJson(`transacoes?id=eq.${encodeURIComponent(n.transacao_id)}&select=id,valor,direcao,categoria_id,estabelecimento,conta_id,status,origem`);
  if (!t) return { n, t: null, cat: null };
  const [cat] = await restJson(`categorias?id=eq.${encodeURIComponent(t.categoria_id)}&select=nome,natureza,pai:pai_id(nome)`);
  const nome = cat?.pai?.nome ?? cat?.nome ?? t.categoria_id;
  return { n, t, cat: cat ? { nome, natureza: cat.natureza } : null };
}

// as duas linhas da mensagem
export function linhas(n: Notif, t: Trans, cat: { nome: string; natureza: string } | null): [string, string, string] {
  const nat = cat?.natureza ?? "gasto";
  const lugar = t.estabelecimento?.trim() || (n.titulo ?? "").trim() || n.app;
  const contaTxt = [CONTA[t.conta_id] ?? n.app, forma(t.conta_id, `${n.titulo ?? ""} ${n.texto}`)].filter(Boolean).join(" ");
  let emoji = "🛒", l1 = `${brl(t.valor)} · ${lugar}`, catTxt = cat?.nome ?? "";
  if (nat === "transferencia") { emoji = "🔁"; l1 = `${brl(t.valor)} · entre suas contas`; catTxt = "Transferência (não conta como gasto)"; }
  else if (nat === "investimento") emoji = "📈";
  else if (nat === "ajuste") { emoji = "🗑️"; catTxt = "descartado"; }
  else if (t.direcao === "entrada" && nat === "gasto") { emoji = "↩️"; catTxt = `Estorno em ${cat?.nome}`; }
  else if (t.direcao === "entrada") emoji = "💰";
  return [emoji, l1, `${contaTxt} · ${catTxt} · ${quando(n.recebida_em)}`];
}

const bt = (text: string, data: string) => ({ text, callback_data: data });
export const tecladoInicial = (nid: string) => ({ inline_keyboard: [[bt("✅ Confirmar", `c:${nid}`), bt("⚠️ Algo errado", `e:${nid}`)]] });
export const tecladoDesfazer = (nid: string) => ({ inline_keyboard: [[bt("↩ Desfazer", `u:${nid}`)]] });
export function tecladoMenu(nid: string, direcao: string) {
  const idx = direcao === "entrada" ? MENU_ENTRADA : MENU_SAIDA;
  const rows: unknown[][] = [];
  for (let i = 0; i < idx.length; i += 3) rows.push(idx.slice(i, i + 3).map((k) => bt(CATS[k][1], `k:${k}:${nid}`)));
  rows.push([bt(direcao === "entrada" ? "Não é entrada" : "Não é gasto", `x:${nid}`), bt("Valor errado", `r:${nid}`)]);
  rows.push([bt("↩ Voltar", `v:${nid}`)]);
  return { inline_keyboard: rows };
}

// texto da mensagem conforme a decisão
export function textoMensagem(n: Notif, t: Trans, cat: { nome: string; natureza: string } | null): string {
  const [emoji, l1, l2] = linhas(n, t, cat);
  switch (n.decisao) {
    case "confirmada": return `✅ ${l1} · confirmado\n${l2}`;
    case "corrigida": return `✏️ ${l1} · ${cat?.nome} · confirmado\n${l2}`;
    case "descartada": return `🗑️ ${l1} · descartado\n${l2}`;
    case "revisar": return `🔎 ${l1} · fica para revisar na sessão\n${l2}`;
    default: return `${emoji} ${l1}\n${l2}`;
  }
}

// manda (ou não) a mensagem de uma notificação já processada; guarda o message_id ou o erro
export async function avisar(nid: string, ignorada?: { motivo: string; app: string }) {
  if (!CHAT_ID) return;
  try {
    if (ignorada) {
      const m = /negada|cancelada/.test(ignorada.motivo) ? "compra negada ou cancelada"
        : /fatura/.test(ignorada.motivo) ? "pagamento de fatura (vem pelo extrato)" : null;
      if (!m) return; // sem valor, propaganda, Uber, app não mapeado: nada
      await tg("sendMessage", { chat_id: CHAT_ID, text: `🔕 Ignorei: ${m} · ${ignorada.app}`, disable_notification: true });
      return;
    }
    const { n, t, cat } = await carregar(nid);
    if (!n || !t || t.origem !== "notificacao" || n.telegram_msg_id) return;
    const msg = await tg("sendMessage", { chat_id: CHAT_ID, text: textoMensagem(n, t, cat), reply_markup: tecladoInicial(nid) });
    await rest(`notificacoes?id=eq.${nid}`, { method: "PATCH", body: JSON.stringify({ telegram_msg_id: msg.message_id, telegram_erro: null }) });
  } catch (e) {
    await rest(`notificacoes?id=eq.${nid}`, { method: "PATCH", body: JSON.stringify({ telegram_erro: String(e).slice(0, 300) }) });
  }
}

// comparação em tempo constante
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
