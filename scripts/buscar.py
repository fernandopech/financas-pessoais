#!/usr/bin/env python3
"""Busca por relevância (BM25) no texto das fontes.

Uso:
  python3 scripts/buscar.py "sleep restriction bedtime"         # 8 melhores trechos
  python3 scripts/buscar.py "habit context cue" --fonte wood-2019 --n 5
  python3 scripts/buscar.py "dopamine fast" --notas               # inclui as notas de fim de livro

Divide cada arquivo de fontes/ em trechos de ~250 palavras (com sobreposição) —
o mesmo recorte que vai para a base vetorial quando ela existir (ver fontes/README.md).
Busque em inglês para livros em inglês. Sem dependências externas.
"""
import argparse
import math
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAM, PASSO = 250, 200
PALAVRA = re.compile(r"[a-zà-ÿ0-9]+")
VAZIAS = set("""a an and are as at be but by for from has have he her his i if in into is it its
of on or our she so that the their them there they this to was we were what when which who will with
you your not do does did can could would should than then these those been being o os as um uma de da do
das dos e é em no na nos nas para por que com se ao à""".split())


def tokens(t):
    return [w for w in PALAVRA.findall(t.lower()) if w not in VAZIAS and len(w) > 1]


def cabecalho(texto):
    meta, corpo = {}, texto
    if texto.startswith("---\n"):
        fim = texto.index("\n---\n", 4)
        for linha in texto[4:fim].splitlines():
            k, _, v = linha.partition(": ")
            meta[k] = v
        corpo = texto[fim + 5:]
    return meta, corpo


def trechos(arquivo):
    meta, corpo = cabecalho(arquivo.read_text(encoding="utf-8"))
    palavras = corpo.split()
    for i in range(0, max(len(palavras) - TAM + PASSO, 1), PASSO):
        yield {"arquivo": str(arquivo.relative_to(ROOT)), "meta": meta, "inicio": i,
               "texto": " ".join(palavras[i:i + TAM])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("consulta")
    ap.add_argument("--fonte", help="slug da fonte, ex.: wood-2019")
    ap.add_argument("--n", type=int, default=8)
    ap.add_argument("--notas", action="store_true", help="incluir notas/bibliografia")
    a = ap.parse_args()

    base = ROOT / "fontes" / a.fonte if a.fonte else ROOT / "fontes"
    arquivos = [f for f in sorted(base.rglob("*.md")) if f.name != "README.md"
                and (a.notas or "/notas/" not in str(f))]
    docs = [t for f in arquivos for t in trechos(f)]
    tf = [Counter(tokens(d["texto"])) for d in docs]
    df = Counter(w for c in tf for w in c)
    n, media = len(docs), sum(sum(c.values()) for c in tf) / max(len(docs), 1)
    q = tokens(a.consulta)
    k1, b = 1.5, 0.75

    def score(c):
        tam = sum(c.values())
        s = 0.0
        for w in q:
            if w in c:
                idf = math.log(1 + (n - df[w] + 0.5) / (df[w] + 0.5))
                s += idf * c[w] * (k1 + 1) / (c[w] + k1 * (1 - b + b * tam / media))
        return s

    melhores = sorted(range(n), key=lambda i: score(tf[i]), reverse=True)[:a.n]
    for i in melhores:
        d = docs[i]
        m = d["meta"]
        print(f"## {m.get('autor', '?')} — {m.get('titulo_livro', '?')}, {m.get('titulo_secao', '?')}"
              f"  [{d['arquivo']} · palavra {d['inicio']}] score={score(tf[i]):.1f}")
        print(d["texto"][:1200] + ("…" if len(d["texto"]) > 1200 else ""))
        print()


if __name__ == "__main__":
    main()
