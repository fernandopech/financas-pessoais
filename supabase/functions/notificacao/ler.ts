// Lê uma notificação de banco e diz o que ela é: um lançamento (conta, valor, direção, categoria) ou algo a ignorar.
// Regras simples e conservadoras: tudo o que vira lançamento entra como "a_confirmar" e é revisado no domingo.
// Ajustar as regras quando chegarem exemplos reais de cada app (Flash, Mercado Pago, Santander).

export type Lancamento = {
  conta_id: string; data: string; valor: number; direcao: "entrada" | "saida";
  categoria_id: string; descricao: string; estabelecimento: string | null;
};
export type Leitura = { acao: "lancar"; motivo: string; lancamento: Lancamento } | { acao: "ignorar"; motivo: string };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function conta(app: string, t: string): string | null {
  const a = semAcento(app);
  if (a.includes("c6")) return "conta-principal";
  if (a.includes("flash")) return "conta-beneficio";
  if (a.includes("mercado pago")) return /credito|cartao/.test(t) ? "cartao-1" : "conta-carteira";
  if (a.includes("santander")) return /credito|cartao/.test(t) ? "cartao-2" : "conta-salario";
  return null;
}

function categoriaGasto(t: string): string {
  if (/uber|\b99\b|cabify|catsul|catamar/.test(t)) return "cat-transporte";
  if (/food|ifood|ifd\*|restaur|sushi|poke|mc ?donald|burger|pizza|cafe|armazem|padaria|mercadinho|supermerc|marmita|lanche/.test(t)) return "cat-alimentacao";
  if (/farmac|panvel|drogar/.test(t)) return "cat-saude";
  return "cat-outros-gasto";
}

function lugar(texto: string): string | null {
  const i = texto.search(/R\$\s*\d/);
  const depois = i >= 0 ? texto.slice(i).replace(/^R\$\s*\d[\d.]*(?:,\d{1,2})?/, "") : texto;
  const m = depois.match(/(?:\bem|\bno|\bna|\bpara|\bde)\s+([A-Za-zÀ-ú0-9*][^,.;\n]{1,50}?)(?:,|\.|;|\s+em\s+\d|\s+foi\b|\s+aprovad|\s+realizad|$)/);
  if (!m) return null;
  const s = m[1].replace(/\s+/g, " ").replace(/ (PORTO ALEGRE|SAO PAULO|BRA)\b/gi, "").trim();
  return /^\d{2}\/\d{2}/.test(s) ? null : s;
}

// O Flash informa o saldo na notificação ("Seu saldo em Flexível é R$ 120,00"): vira saldo real do dia.
export function saldoFlash(app: string, texto: string): number | null {
  if (!semAcento(app).includes("flash")) return null;
  const m = texto.match(/saldo[^R]*R\$\s*([\d.]+,\d{2})/i);
  return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : null;
}

// Nomes ficam nos segredos da função, nunca no código (sem acento, minúsculas; regex com |).
const rx = (v?: string) => (v ? new RegExp(v) : null);
const TITULAR = rx(Deno.env.get("NOME_TITULAR"));
const FAMILIA = rx(Deno.env.get("NOMES_FAMILIA"));

export function ler(app: string, titulo: string | null, texto: string, recebidaEm: Date): Leitura {
  const bruto = `${titulo ?? ""} ${texto}`;
  const t = semAcento(bruto);
  if (semAcento(app).includes("uber")) return { acao: "ignorar", motivo: "app do Uber: a cobrança vem pelo banco" };
  const v = bruto.match(/R\$\s*(\d[\d.]*(?:,\d{1,2})?)/);
  if (!v) return { acao: "ignorar", motivo: "sem valor" };
  if (/negad|recusad|nao aprovad|nao autorizad|cancelad|nao foi possivel/.test(t)) return { acao: "ignorar", motivo: "negada ou cancelada" };
  if (/fatura/.test(t)) return { acao: "ignorar", motivo: "pagamento de fatura (vem pelo extrato)" };
  const c = conta(app, t);
  if (!c) return { acao: "ignorar", motivo: `app não mapeado: ${app}` };
  const valor = Number(v[1].replace(/\./g, "").replace(",", "."));
  if (!(valor > 0)) return { acao: "ignorar", motivo: "valor zero" };
  const data = new Date(recebidaEm.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10); // America/Sao_Paulo (UTC-3)
  const entrada = /recebeu|recebid|estorno|estornad|devolvid|devolucao|reembols|cashback/.test(t);
  let categoria_id: string;
  if (TITULAR && TITULAR.test(t)) categoria_id = "cat-transferencia";
  else if (entrada && FAMILIA && FAMILIA.test(t)) categoria_id = "cat-familia";
  else if (/resgat/.test(t)) categoria_id = "cat-resgate";
  else if (/aplicac|investiment|\bcdb\b/.test(t)) categoria_id = "cat-aplicacao";
  else if (entrada) categoria_id = /estorno|estornad|devolvid|devolucao|reembols/.test(t) ? categoriaGasto(t) : "cat-outras-receitas";
  else categoria_id = categoriaGasto(t);
  const direcao = categoria_id === "cat-resgate" ? "entrada" : categoria_id === "cat-aplicacao" ? "saida" : entrada ? "entrada" : "saida";
  return {
    acao: "lancar",
    motivo: "lido da notificação",
    lancamento: { conta_id: c, data, valor, direcao, categoria_id, descricao: bruto.trim().slice(0, 200), estabelecimento: lugar(texto) },
  };
}
