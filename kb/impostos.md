# Impostos

Quando usar: IR de aplicação, venda de ações, declaração anual. **Sempre conferir na fonte antes de afirmar valor**: as regras mudam, e as daqui valem para o IRPF 2026 (ano-calendário 2025).

## Regras
1. **Renda fixa tributada (CDB, Tesouro, fundos de renda fixa):** tabela regressiva pelo prazo da aplicação, retida na fonte. [CVM TOP Planejamento 2025, cap. 5, `fontes/cvm-2025/08-2-3-instrumentos-de-investimentos-parte-1.md` e `20-5-2-tributacao-dos-rendimentos-das-pessoas-fisicas.md` — V1]

   | Prazo | Alíquota |
   |---|---|
   | até 180 dias | 22,5% |
   | 181 a 360 dias | 20% |
   | 361 a 720 dias | 17,5% |
   | acima de 720 dias | 15% |

2. **IOF:** só no resgate antes de **30 dias** da aplicação. [mesma fonte, `20-...md` — V1]
3. **Isentos de IR para pessoa física:** poupança, LCI, LCA, CRI, CRA e letras hipotecárias. [mesma fonte — V1]
   - **Cuidado:** houve propostas de mudar essas isenções em 2025. Conferir se mudou antes de usar como argumento.
4. **Ações no mercado à vista:** ganho **isento** se o total de **vendas no mês** ficar até **R$ 20.000**. Acima disso, 15% sobre o ganho. **Day trade: 20%**, sem isenção. [Receita IRPF 2026, `fontes/rfb-2026/68-preco-de-alienacao-indeterminado.md` e `69-ganho-liquido-mercado-a-termo.md` — V1]
5. **Aplicações no exterior** (conta remunerada, ETF lá fora): regras novas desde 01/01/2024 (Lei 14.754/2023), com apuração na declaração anual. Ver as perguntas 474, 476 e 640. Depósito **não remunerado** no exterior é declarado em Bens e Direitos, grupo 06 (pergunta 469). [Receita IRPF 2026, `fontes/rfb-2026/43-...md`, `45-...md`, `60-...md` — V1]
6. **MEI / renda extra:** ainda sem fonte (Portal do Empreendedor está pendente). O que vier daí é V3.

## Buscar mais
`python3 scripts/buscar.py "alienações realizadas no mês" --fonte rfb-2026` · `"tabela regressiva" --fonte cvm-2025` · `"aplicações financeiras no exterior" --fonte rfb-2026`
