---
name: posso-comprar
description: Decisão de compra na hora e placar da semana do usuário. Use quando ele disser "posso comprar X?", "vale a pena comprar X?", "tô pensando em comprar", "consigo pagar X?", mandar link/foto de algo que quer comprar, ou contar o que gastou ("gastei X", "hoje gastei...", "quanto ainda posso gastar?", "como tá a semana?"). Mostra o impacto na semana, no mês e no próximo marco, sem sermão; a decisão é dele.
---

# Posso comprar?

Rápido (uma mensagem curta), sem julgamento. A decisão é do usuário; o papel aqui é pôr os números na frente antes do impulso decidir. Regras fixas no `CLAUDE.md`.

## Passos
1. **O que, quanto e como:** valor, à vista ou parcelado (quantas vezes, com juros?), em qual cartão/conta. Se faltar só um dado, perguntar só ele.
2. **Estava no plano?** Ver `orcamento.md` (potes, irregulares, ciclos) e `desejos.md`.
3. **Números** (do banco ou do `orcamento.md`, nunca de cabeça):
   - quanto sobra no **limite da semana** e no pote certo depois da compra;
   - se parcelado: quanto ocupa de cada mês seguinte e até quando (somar às parcelas que já existem);
   - impacto no **próximo marco** do intercâmbio (dias ou % de atraso);
   - quanto vale em **horas de trabalho** (valor ÷ renda líquida por hora, do `profile.md`). [Robin & Dominguez, *Your Money or Your Life* — V3]
4. **Resposta:**
   - **Cabe no plano** → "cabe: sai do pote X, sobra R$ Y na semana".
   - **Não estava no plano e passa do valor-limite** (definido por ele na entrevista; até lá, R$ 100) → sugerir **esperar 48 h**: anotar em `desejos.md` com data e valor e perguntar de novo depois. Vontade de compra costuma baixar com o tempo [julgamento prático].
   - **Parcelado com juros, ou entra no rotativo/cheque especial** → mostrar o custo total e o CET; sugerir alternativa (esperar e juntar, à vista com desconto).
   - **Necessidade** (saúde, trabalho, faculdade, algo que quebrou) → achar de onde sai, sem lista de desejos.
5. **Registrar a decisão** em `desejos.md` (comprou / esperou / desistiu). Com o tempo isso mostra quantas compras ele larga depois de esperar e quais categorias pedem mais espera.

## Placar da semana (pedido dele em 09/11/2026)
Quando ele contar o que gastou ou perguntar quanto ainda pode gastar:
1. **Anotar o que ele contou:** tabela curta (data, item, valor, onde pagou: Flash, C6, cartão, outra conta). Gravar em `transacoes` pelas regras da skill `contas` (`origem='manual'`, `status='a_confirmar'` quando a categoria for chute), **mostrando antes o que vai gravar**. **Antes de gravar, olhar se a notificação do celular já lançou a mesma compra** (`origem='notificacao'`, mesma conta, valor e dia): se lançou, só confirmar a categoria. Quando o extrato chegar, fica a linha do extrato e as outras saem.
2. **Somar a semana** (segunda a domingo) pelo banco (`v_semana`, ou `v_gastos` da semana se o orçamento do mês ainda não estiver gravado), contando tudo o que entra no limite: comida (mercado incluído), Uber, lazer, compras, farmácia, Pix para amigos, pague quem pagar. Fora: van, saque do ônibus, wi-fi, assinaturas automáticas, parcelas e CDB (`orcamento.md`).
3. **Responder em 3 linhas:** gastou R$ X de R$ [limite]; sobra R$ Y até domingo (≈ R$ Z por dia); se perguntou de uma compra: cabe ou não, e de onde sai (Flash primeiro).
4. **Sem dado do dia**, usar a soma dos saldos (`orcamento.md`): Flash + C6 + espaço no cartão Mercado Pago − meta do domingo = quanto ainda cabe.
5. Estourou: dizer o número e o que estourou; ajustar um ponto, sem compensar cortando tudo (planejador, C4). Nada de sermão.

## Tom
Uma mensagem, números primeiro, sem "você não deveria". Se ele comprar fora do plano, é dado para o domingo, não falha.
