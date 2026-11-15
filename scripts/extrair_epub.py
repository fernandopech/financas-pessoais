#!/usr/bin/env python3
"""Converte um EPUB em markdown, um arquivo por capítulo, em fontes/<slug>/.

Uso: python3 scripts/extrair_epub.py livro.epub <slug> "<Autor>" "<Título>" <ano>

Segue a ordem do spine do EPUB. Itens com pouco texto (capa, créditos, sumário)
são ignorados. Se o EPUB tem sumário (toc.ncx), o título da seção vem dele, e um
arquivo com vários capítulos (âncoras #id no sumário) é cortado em cada âncora. Cada arquivo começa com um cabeçalho de metadados usado pelo
buscar.py e, no futuro, pela carga na base vetorial.
"""
import re
import sys
import zipfile
import posixpath
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
MIN_PALAVRAS = 150
BLOCOS = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "br", "tr", "blockquote", "section"}


class Texto(HTMLParser):
    def __init__(self):
        super().__init__()
        self.partes, self.titulos, self._h, self._pular = [], [], None, 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._pular += 1
        if tag in ("h1", "h2", "h3"):
            self._h = []
        if tag in BLOCOS:
            self.partes.append("\n\n")
        if tag in ("h1", "h2", "h3"):
            self.partes.append("#" * int(tag[1]) + "# ")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._pular -= 1
        if tag in ("h1", "h2", "h3") and self._h is not None:
            t = " ".join("".join(self._h).split())
            if t:
                self.titulos.append(t)
            self._h = None
        if tag in BLOCOS:
            self.partes.append("\n\n")

    def handle_data(self, data):
        if self._pular:
            return
        self.partes.append(data)
        if self._h is not None:
            self._h.append(data)

    def texto(self):
        t = "".join(self.partes)
        t = re.sub(r"[ \t\xa0\r\u200b]+", " ", t)
        t = re.sub(r" *\n *", "\n", t)
        t = re.sub(r"(?m)^\S+\.qxd .*Page \d+$", "", t)  # cabeçalho de página de EPUB convertido de PDF
        return re.sub(r"\n{3,}", "\n\n", t).strip()


def spine(z):
    ns = {"c": "urn:oasis:names:tc:opendocument:xmlns:container", "o": "http://www.idpf.org/2007/opf"}
    opf = ET.fromstring(z.read("META-INF/container.xml")).find(".//c:rootfile", ns).get("full-path")
    base = posixpath.dirname(opf)
    pkg = ET.fromstring(z.read(opf))
    itens = {i.get("id"): i.get("href") for i in pkg.find("o:manifest", ns)}
    for ref in pkg.find("o:spine", ns):
        href = itens[ref.get("idref")].split("#")[0]
        yield posixpath.normpath(posixpath.join(base, href))


def sumario(z):
    """Entradas do toc.ncx em ordem: (arquivo, âncora ou None, título, profundidade)."""
    nome = next((n for n in z.namelist() if n.lower().endswith(".ncx")), None)
    if not nome:
        return []
    ns = {"n": "http://www.daisy.org/z3986/2005/ncx/"}
    base = posixpath.dirname(nome)
    out = []

    def anda(no, prof):
        for np in no.findall("n:navPoint", ns):
            txt = np.find("n:navLabel/n:text", ns)
            src = np.find("n:content", ns)
            if txt is not None and src is not None and (txt.text or "").strip():
                arq, _, ancora = src.get("src").partition("#")
                out.append((posixpath.normpath(posixpath.join(base, arq)), ancora or None,
                            " ".join(txt.text.split()), prof))
            anda(np, prof + 1)

    mapa = ET.fromstring(z.read(nome)).find("n:navMap", ns)
    if mapa is not None:
        anda(mapa, 1)
    return out


def pedacos(html_txt, ancoras):
    """Corta o HTML no começo da tag de cada âncora. Devolve [(título ou None, html)]."""
    cortes = []
    for anc, tit in ancoras:
        m = re.search(r'id=["\']%s["\']' % re.escape(anc), html_txt)
        if m:
            cortes.append((html_txt.rfind("<", 0, m.start()), tit))
    cortes.sort()
    if not cortes:
        return [(None, html_txt)]
    out = [(None, html_txt[:cortes[0][0]])]
    for i, (pos, tit) in enumerate(cortes):
        fim = cortes[i + 1][0] if i + 1 < len(cortes) else len(html_txt)
        out.append((tit, html_txt[pos:fim]))
    return out


PULAR = re.compile(r"^(index|table of contents|acknowledg|agradec|copyright|contents|sum[aá]rio|illustration credits|"
                   r"about the author|also by|praise for|dedication|title page|newsletter|cover|publishing details)", re.I)


NUMERO = re.compile(r"(chapter|cap[ií]tulo|part|parte)?\s*([\divxlc]+|one|two|three|four|five|six|seven|eight|nine|ten)\.?", re.I)


def titulo_da_secao(p, corpo, livro):
    # cabeçalho corrido com o nome do livro não é título de seção
    norm = lambda t: t.lower().replace("\u2019", "'")
    fora = lambda t: norm(t) == norm(livro)
    ts = [t for t in p.titulos if not fora(t)][:3]
    linhas = [l.strip("# ") for l in corpo.split("\n") if l.strip("# ") and not fora(l.strip("# "))]
    if not ts:
        ts = linhas[:2]
    if not ts:
        return livro
    # "1" + "Persistence and Change" -> "1. Persistence and Change"
    if NUMERO.fullmatch(ts[0]):
        resto = ts[1] if len(ts) > 1 else next((l for l in linhas if l != ts[0]), "")
        if resto and len(resto) < 100:
            return f"{ts[0].rstrip('.')}. {resto}"
    return ts[0][:100]


def eh_notas(corpo):
    paras = [x for x in corpo.split("\n\n") if x.strip()]
    if not paras:
        return False
    if re.match(r"\s*(notes|notas|endnotes|references|bibliography|refer[eê]ncias)\b", paras[0], re.I):
        return True
    citacoes = sum(1 for x in paras if re.match(r"\s*\d{1,3}\.?\s", x) or "doi" in x.lower())
    return citacoes / len(paras) > 0.5


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:50] or "sem-titulo"


def main():
    epub, slug, autor, titulo, ano = sys.argv[1:6]
    destino = ROOT / "fontes" / slug
    destino.mkdir(parents=True, exist_ok=True)
    for velho in destino.rglob("*.md"):
        velho.unlink()
    n = 0
    with zipfile.ZipFile(epub) as z:
        toc = sumario(z)
        titulo_toc = {}
        for a, anc, t, prof in toc:
            if anc is None:
                titulo_toc[(a, None)] = t  # o mais fundo (capítulo, não a parte) fica
        # corta por âncora só no nível do arquivo: subseções (mais fundas que a entrada
        # do próprio arquivo) não viram seção
        prof_arq = {}
        for a, anc, t, prof in toc:
            if anc is None:
                prof_arq[a] = max(prof_arq.get(a, 0), prof)
        ancoras = {}
        for a, anc, t, prof in toc:
            if anc and prof <= prof_arq.get(a, prof):
                ancoras.setdefault(a, []).append((anc, t))
        atual = None  # último título do sumário visto, vale para os arquivos seguintes
        for nome in spine(z):
            bruto = z.read(nome).decode("utf-8", errors="replace")
            if (nome, None) in titulo_toc:
                atual = titulo_toc[(nome, None)]
            partes = pedacos(bruto, ancoras[nome]) if len(ancoras.get(nome, [])) > 1 else [(None, bruto)]
            if len(ancoras.get(nome, [])) == 1:
                atual = ancoras[nome][0][1]
            for tit_toc, html_txt in partes:
                if tit_toc:
                    atual = tit_toc
                p = Texto()
                p.feed(html_txt)
                corpo = p.texto()
                palavras = len(corpo.split())
                if palavras < MIN_PALAVRAS:
                    continue
                tit = titulo_da_secao(p, corpo, titulo)
                if atual and not NUMERO.fullmatch(atual) and not re.fullmatch(r"(chapter|cap[ií]tulo)\s+\d+", atual, re.I):
                    tit = atual
                elif atual and not NUMERO.fullmatch(tit.split(".")[0]):
                    tit = f"{atual}. {tit}" if tit.lower() != atual.lower() else atual
                if PULAR.match(tit) or (atual and PULAR.match(atual)):
                    continue
                n += 1
                tipo = "notas" if eh_notas(corpo) else "texto"
                cab = (f"---\nfonte: {slug}\nautor: {autor}\ntitulo_livro: {titulo}\nano: {ano}\n"
                       f"secao: {n:02d}\ntitulo_secao: {tit}\ntipo: {tipo}\npalavras: {palavras}\n---\n\n")
                pasta = destino / "notas" if tipo == "notas" else destino
                pasta.mkdir(exist_ok=True)
                (pasta / f"{n:02d}-{slugify(tit)}.md").write_text(cab + corpo + "\n", encoding="utf-8")
    print(f"{slug}: {n} seções")


if __name__ == "__main__":
    main()
