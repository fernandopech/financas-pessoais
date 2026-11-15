#!/usr/bin/env python3
"""Briefing do planejador (início da sessão).

Lê só arquivos do repositório: status da entrevista, orçamento do mês,
desejos em espera, revisões do diário de investimentos vencidas e a revisão
mais recente. Os números do dinheiro (saldo, gasto da semana, contas que vencem)
estão no banco: consultar pelas views (ver supabase/README.md), nunca de cabeça.
"""
from datetime import datetime, date
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
HOJE = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def ler(nome):
    p = ROOT / nome
    return p.read_text(encoding="utf-8") if p.exists() else ""


def linhas_tabela(texto):
    for l in texto.splitlines():
        s = l.strip()
        if s.startswith("|") and not set(s) <= set("|-: "):
            yield [c.strip() for c in s.strip("|").split("|")]


def data_br(txt):
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(txt, fmt).date()
        except ValueError:
            pass
    return None


def main():
    print(f"Hoje: {HOJE:%d/%m/%Y} ({DIAS[HOJE.weekday()]})")
    if "status: confirmado" not in ler("profile.md"):
        print("⚠️  profile.md: entrevista pendente (skill planejador, Parte A)")

    orc = ler("orcamento.md")
    for l in orc.splitlines():
        if l.startswith("## Mês atual"):
            print("Orçamento:", l[3:].strip())
            break

    desejos = [c for c in linhas_tabela(ler("desejos.md")) if c[0] != "Data" and len(c) >= 6 and not c[5]]
    if desejos:
        print(f"Desejos em espera: {len(desejos)}")
        for c in desejos:
            rever = data_br(c[4])
            aviso = " ← rever hoje" if rever and rever <= HOJE else ""
            print(f"  {c[1]} (R$ {c[2]}){aviso}")

    vencidas = []
    for c in linhas_tabela(ler("investimentos/diario.md")):
        if c[0] == "Data" or len(c) < 9:
            continue
        rever = data_br(c[7])
        if rever and rever <= HOJE and not c[8]:
            vencidas.append(f"{c[2]} (revisar em {c[7]})")
    if vencidas:
        print("Investimentos para revisar:", "; ".join(vencidas))

    revs = sorted(p.name for p in (ROOT / "revisoes").glob("20*.md"))
    print("Última revisão:", revs[-1][:-3] if revs else "nenhuma")
    if HOJE.weekday() == 6:
        print("Domingo: fechamento da semana (skill planejador).")
    print("Números do mês: consultar o banco (supabase/README.md).")


if __name__ == "__main__":
    main()
