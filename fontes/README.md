# Fontes

Na versão de uso real, esta pasta guarda o **texto integral** dos livros, artigos e documentos oficiais usados pela base de conhecimento, um arquivo por capítulo, para o Claude buscar trechos (`python3 scripts/buscar.py "termos"`).

**O texto integral não é publicado aqui** porque boa parte é material com direito autoral. A lista completa de fontes, com o nível de verificação de cada uma, está em [`kb/fontes.md`](../kb/fontes.md), e os resumos com citação estão em [`kb/`](../kb/INDEX.md).

Para montar a sua: `scripts/extrair_epub.py` (livros) e `scripts/extrair_pdf.py` (artigos e normas) geram os arquivos por capítulo.
