# Previsão de gastos

Quando usar: "vai sobrar?", previsão do mês, limite semanal, pote de irregulares, ciclos.

## Regras
1. **A intuição subestima o gasto da semana seguinte.** Em 4 estudos, as pessoas previram gastar bem menos do que gastaram (ou do que lembravam ter gastado na semana anterior). O viés vem da **vontade de economizar** no momento da previsão: a meta de poupar baixa a previsão, mas não o gasto real. [Peetz & Buehler 2009, `fontes/peetz-2009/01-paginas-13.md`, p. 1–3 — V1]
   - **Aplicar:** a previsão sai da média real (banco/`scripts/`), nunca do "essa semana vou gastar menos".
2. **A previsão cai no gasto típico (a moda), mas a média é maior** porque gasto tem cauda à direita. Num estudo de campo de 5 semanas, **59,5% a 69,3%** subestimaram o gasto semanal, e 63,2% subestimaram o mensal. [Howard et al. 2022, `fontes/howard-2022/03-paginas-68.md`, p. 6–8 — V1]
3. **O antídoto é pensar no atípico.** Pedir "liste 3 motivos para esta semana ser **diferente** de uma semana normal" neutralizou o viés: no grupo que fez isso, quem subestimou caiu de 66,2% para **47,6%**. Pedir motivos para ser **igual** não muda nada. [Howard et al. 2022, p. 6–8 — V1]
   - **Aplicar:** no domingo, antes de fechar o limite da próxima semana, perguntar: "o que pode fazer esta semana sair do normal?" (aniversário, saída, viagem, conserto).
4. **Gastos excepcionais são subestimados no total e estourados um a um.** Cada um parece único ("presente", "conserto", "festa"), então não entra no orçamento, mas juntos eles acontecem quase todo mês. Funciona ver os excepcionais como **uma categoria só**. [Sussman & Alter 2012, `fontes/sussman-2012/01-paginas-12.md`, p. 1–2 — V1]
   - **Aplicar:** pote de irregulares com valor mensal fixo, medido pela média dos últimos meses; ciclos (`v_ciclos`) alimentam esse pote.

## Buscar mais
`python3 scripts/buscar.py "atypical intervention" --fonte howard-2022` · `"exceptional expenses categorize" --fonte sussman-2012` · `"savings goals prediction" --fonte peetz-2009`
