#!/usr/bin/env python3
"""Converte um PDF (ou página HTML de lei/norma) em markdown, em fontes/<slug>/.

Uso:
  python3 scripts/extrair_pdf.py arq.pdf <slug> "<Autor>" "<Título>" <ano> [opções]

Opções:
  --url URL             link oficial do original (vai para o cabeçalho)
  --titulos REGEX       linhas que abrem seção (ex.: '^\\d+\\. [A-ZÁÉ]'); sem isso,
                        divide em blocos de páginas de ~--tam palavras
  --paginas A-B         só essas páginas do PDF (ex.: 15-400)
  --tam N               palavras por bloco quando não há títulos (padrão 2500)
  --min N               seção menor que isso sempre entra na anterior (padrão 300)

Seções vizinhas são juntadas até ~--tam palavras; os títulos que entraram vão em
`subtitulos`. Blocos sem título recebem "Páginas X–Y".

Mesmo cabeçalho do extrair_epub.py (fonte, autor, titulo_livro, ano, secao,
titulo_secao, tipo, palavras) + paginas, subtitulos e url. Precisa de pdftotext (poppler).
Para HTML (.htm/.html) o texto vem da página e não há páginas.
"""
import argparse
import html
import re
import subprocess
import unicodedata
from collections import Counter
from pathlib import Path

from extrair_epub import eh_notas, slugify

ROOT = Path(__file__).resolve().parent.parent
NOTAS = re.compile(r"^\s*(references|refer[eê]ncias|bibliography|bibliografia|notes|notas)\s*$", re.I)


def sem_acento(t):
    return unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()


def paginas_pdf(arq, faixa):
    args = ["pdftotext", "-enc", "UTF-8"]
    if faixa:
        a, b = faixa.split("-")
        args += ["-f", a, "-l", b]
    txt = subprocess.run(args + [str(arq), "-"], capture_output=True, text=True, check=True).stdout
    inicio = int(faixa.split("-")[0]) if faixa else 1
    return [(inicio + i, p) for i, p in enumerate(txt.split("\f")) if p.strip()]


def paginas_html(arq):
    t = Path(arq).read_text(encoding="utf-8", errors="replace")
    t = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", "", t)
    t = re.sub(r"\s+", " ", t)  # quebra de linha do código-fonte não é parágrafo
    t = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</h\d>|</li>|</tr>", "\n", t)
    t = html.unescape(re.sub(r"<[^>]+>", "", t))
    return [(None, t)]


def limpar(paginas):
    """Tira cabeçalho/rodapé repetido e números de página; junta linhas em parágrafos."""
    linhas_pag = [[l.strip() for l in p.replace("\xa0", " ").split("\n")] for _, p in paginas]
    freq = Counter(l for ls in linhas_pag for l in set(ls) if l and len(l) < 80)
    lim = max(4, len(paginas) * 0.3)
    repetidas = {l for l, n in freq.items() if n >= lim}
    out = []
    for (num, _), ls in zip(paginas, linhas_pag):
        ls = [l for l in ls if l not in repetidas and not re.fullmatch(r"\d{1,4}", l)]
        out.append((num, ls))
    return out


def paragrafos(linhas):
    paras, atual = [], ""
    for l in linhas + [""]:
        l = re.sub(r"[ \t]+", " ", l.replace("\u00ad", "\x00")).strip()
        if not l:
            if atual:
                paras.append(atual)
            atual = ""
            continue
        if not atual:
            atual = l
        elif atual.endswith("-") and l[:1].islower():
            atual = atual[:-1] + l
        elif re.search(r"[.:;!?]$", atual) and (l[:1].isupper() or l[:1].isdigit()):
            paras.append(atual)
            atual = l
        else:
            atual += " " + l
    return [re.sub(r"\x00\s*", "", x) for x in paras]  # hífen invisível de fim de linha


def secoes(paginas, regex):
    """Lista de (titulo, pag_ini, pag_fim, linhas)."""
    if not regex:
        return [(None, n, n, ls) for n, ls in paginas]
    pat = re.compile(regex)
    out, atual = [], ["Início", paginas[0][0], paginas[0][0], []]
    for n, ls in paginas:
        for l in ls:
            if pat.search(l):
                if atual[3]:
                    out.append(tuple(atual))
                atual = [l[:100], n, n, []]
            atual[3].append(l)
            atual[2] = n
    out.append(tuple(atual))
    return out


def juntar(secs, tam, minimo):
    """Junta seções vizinhas até ~tam palavras (a menor que `minimo` sempre entra na anterior)
    e corta as maiores que 2×tam. Guarda os títulos que entraram em cada bloco."""
    contar = lambda ls: sum(len(l.split()) for l in ls)
    blocos = []  # [titulos, pag_ini, pag_fim, linhas]
    for tit, a, b, ls in secs:
        n = contar(ls)
        if blocos and (n < minimo or contar(blocos[-1][3]) + n <= tam):
            blocos[-1][0] += [tit] if tit else []
            blocos[-1][2] = b
            blocos[-1][3] += ls
        else:
            blocos.append([[tit] if tit else [], a, b, list(ls)])
    final = []
    for tits, a, b, ls in blocos:
        if contar(ls) <= tam * 2:
            final.append((tits, a, b, ls))
            continue
        parte, k = [], 1
        for l in ls:
            parte.append(l)
            if contar(parte) >= tam:
                final.append(([f"{tits[0]} (parte {k})"] if tits else [], a, b, parte))
                parte, k = [], k + 1
        if parte:
            final.append(([f"{tits[0]} (parte {k})"] if tits else [], a, b, parte))
    return final


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("arquivo")
    ap.add_argument("slug")
    ap.add_argument("autor")
    ap.add_argument("titulo")
    ap.add_argument("ano")
    ap.add_argument("--url", default="")
    ap.add_argument("--titulos")
    ap.add_argument("--paginas")
    ap.add_argument("--tam", type=int, default=2500)
    ap.add_argument("--min", type=int, default=300)
    a = ap.parse_args()

    eh_html = a.arquivo.lower().endswith((".htm", ".html"))
    pags = paginas_html(a.arquivo) if eh_html else paginas_pdf(a.arquivo, a.paginas)
    pags = limpar(pags)
    blocos = juntar(secoes(pags, a.titulos), a.tam, a.min)

    destino = ROOT / "fontes" / a.slug
    destino.mkdir(parents=True, exist_ok=True)
    for velho in destino.rglob("*.md"):
        velho.unlink()
    n = 0
    for tits, ini, fim, ls in blocos:
        corpo = "\n\n".join(paragrafos(ls))
        palavras = len(corpo.split())
        if palavras < 50:
            continue
        n += 1
        if tits:
            tit = tits[0]
        elif ini is not None:
            tit = f"Páginas {ini}–{fim}" if ini != fim else f"Página {ini}"
        else:
            tit = f"Parte {n}"
        subs = "; ".join(t for t in tits[1:] if t)[:600]
        tipo = "notas" if NOTAS.match(tit) or eh_notas(corpo) else "texto"
        pag = "" if ini is None else f"paginas: {ini}-{fim}\n"
        cab = (f"---\nfonte: {a.slug}\nautor: {a.autor}\ntitulo_livro: {a.titulo}\nano: {a.ano}\n"
               f"secao: {n:02d}\ntitulo_secao: {tit}\ntipo: {tipo}\npalavras: {palavras}\n{pag}"
               + (f"subtitulos: {subs}\n" if subs else "") +
               f"url: {a.url}\n---\n\n")
        pasta = destino / "notas" if tipo == "notas" else destino
        pasta.mkdir(exist_ok=True)
        (pasta / f"{n:02d}-{slugify(sem_acento(tit))}.md").write_text(cab + corpo + "\n", encoding="utf-8")
    print(f"{a.slug}: {n} seções, {sum(len(l.split()) for b in blocos for l in b[3])} palavras")


if __name__ == "__main__":
    main()
