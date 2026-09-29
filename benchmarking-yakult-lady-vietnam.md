# Benchmarking — App "Yakult Lady" (Vietnã)

**App analisado:** Yakult Lady v1.0.37 (`com.gmo.yakult_lady.YakultLady`)
**Desenvolvedor:** Yakult Việt Nam
**Stack técnica:** Flutter (Dart compilado nativo) + Android nativo para permissões/plugins
**Método:** engenharia reversa do APK com `jadx`, extraindo o arquivo de internacionalização `locales/vi.json` (mapa completo de textos por tela) e o `AndroidManifest.xml` (permissões e activities nativas).

> Nota: os nomes de tela/campo abaixo foram traduzidos livremente do vietnamita para facilitar a leitura — são referência conceitual de funcionalidade, não texto para reaproveitar literalmente no seu app.

---

## 1. Arquitetura de permissões (o que o app acessa e por quê)

| Permissão | Provável uso |
|---|---|
| Localização fina + em segundo plano | Rastrear rota de venda durante o expediente (start/end de rota) |
| Reconhecimento de atividade (`ACTIVITY_RECOGNITION`) | Contador de passos (pedômetro) — aparece no dashboard como "total de passos andados" |
| Câmera | Fotos de comprovação de entrega, scanner de código de barras/QR |
| Scanner de código de barras (`journeyapps.CaptureActivity`) | Leitura de lote/código de produto no recebimento de mercadoria e QR code de treinamento |
| Bluetooth | Provavelmente integração com impressora térmica portátil (recibos) |
| Armazenamento (leitura/escrita) | Download de vídeos/materiais de treinamento offline |
| Notificações push (`c2dm`/FCM) | Avisos, aniversários de clientes, atualizações |

---

## 2. Estrutura geral (menu lateral / drawer)

- Informações pessoais
- Pedidos
- Lista de clientes
- Entrega (produtos/informações)
- Entrega de brindes Y-care
- Clientes com suspensão pendente
- Resumo de vendas (dashboard consolidado)
- Vídeos institucionais
- Sincronização de dados
- Ajuda
- Notificações
- Formulários de pesquisa (survey)
- Aulas / licença Yakult (treinamento)
- Candidatas potenciais (recrutamento)
- Programas/campanhas ativas
- Sair

---

## 3. Módulos e funcionalidades detalhadas

### 3.1 Login e conta
- Login com usuário/senha, opção "lembrar senha"
- Seleção de idioma (vietnamita/inglês)
- Aviso de dados antigos não sincronizados ao logar
- **Perfil pessoal:** nome de exibição, ID da Yakult Lady, data de nascimento, telefone, documento de identidade, CPF/CNPJ equivalente, endereço, filial, loja, área, data de ativação
- **Dados bancários e carteiras digitais:** conta bancária, Momo, AirPay, VNPay (meios de recebimento de comissão)
- Troca de senha

### 3.2 Dashboard (Home)
- Ranking "Top Yakult Lady do dia"
- Progresso de vendas: semanal/mensal, meta vs. realizado
- Número de casas visitadas vs. total de casas na rota
- Comissão estimada
- Total de passos andados (via pedômetro)
- Segmentação de visitas: casa, mercado/feira, creche (MN), outros — com contagem de "comprou/garrafas"
- Amostras: pegas / usadas / restantes em estoque
- Clientes potenciais captados no dia
- Edição de metas mensais (inclusive por dia da semana, com "copiar para todos os dias")

### 3.3 Rota de vendas (Sale Route) — tela central do app
- Mapa com marcadores de clientes, mercados, creches e clientes potenciais
- Botão "iniciar" / "finalizar" rota do dia (controla o rastreamento de localização)
- Verificação de distância até o cliente (bloqueia venda se a Lady não estiver fisicamente próxima)
- Ações rápidas por cliente no mapa: vender, pagar dívida, retirar mercadoria, adicionar cliente, ver detalhes
- Sincronização de múltiplos conjuntos de dados antes de iniciar (rota, histórico de visitas, dívidas, entregas, dashboard, pesquisas etc.) — trabalha bem offline-first
- Alerta de aniversário de cliente no dia
- Verificação de pendências de dívida antes de liberar nova retirada de mercadoria

### 3.4 Clientes
- **Lista de clientes** com busca por nome/telefone/endereço, filtro por área e dia da semana de visita
- **Clientes oficiais** vs. **clientes potenciais/prospects** (funis separados)
- **Ficha do cliente:** código, nome, endereço, telefone, dia de visita recorrente, última visita, data de cadastro
- Questionário de qualificação do cliente potencial: já conhece a Yakult? já comprou? entende o sistema de entrega domiciliar? aceita amostra?
- Histórico de visitas e histórico de vendas por cliente
- Registro de "características do cliente" e notas categorizadas (história feliz, história triste, reclamação)
- Atualização de geolocalização do cliente
- Clientes "em espera de suspensão" (inatividade) com opção de remover
- Vínculo com conta Y-care (app do cliente final) — status conectado/não conectado

### 3.5 Venda (Sale)
- Registro de status da visita: ausente / não comprou / comprou
- Lista de produtos com preço e cálculo automático do total
- Forma de pagamento: dinheiro, Momo, AirPay
- Registro de material entregue (panfletos/campanhas)
- Foto de comprovação
- Vínculo a campanhas promocionais ativas
- Cadastro de nova nota de cliente na hora da venda

### 3.6 Retirada de mercadoria (Pickup) e controle de lote
- Lista de produtos e amostras retiradas com quantidade e valor
- **Controle por número de lote (LOT):** entrada de código inicial/final por "árvore" de leite (lote de produção), validação de sintaxe (letra + números), quantidade mínima por lote
- Scanner de código de barras para leitura de lote
- Histórico de retiradas
- Foto obrigatória do comprovante

### 3.7 Dívidas e prestação de contas (Debt)
- Controle de garrafas em dívida (limite máximo de 50 garrafas)
- Pagamento de dívida com validação (não pode pagar mais do que o devido)
- Pedidos "pagos antecipadamente" vinculados à dívida
- Histórico de pagamentos de dívida
- Tela de **confirmação de dívida pelo supervisor** (líder) com estoque real vs. sistema
- Filtros por período, área e status (pago/não pago)

### 3.8 Pedidos e entregas (Order / Delivery)
- Criação de pedido com dados de quem compra e de quem recebe (presente para terceiros)
- Tipos de pedido: "informação" vs. "produto"
- Forma de pagamento: antecipado ou na entrega
- Verificação de endereço entregável antes de confirmar
- Fluxo de confirmação: pedido pode ser "confirmado" ou "não pode ser confirmado" com nota
- Entrega com foto obrigatória, motivo de insucesso, opção de devolução/estorno
- Entrega separada para **brindes do programa Y-care** (fidelidade)
- Lista de pedidos com filtros (data, status de pagamento, tipo, status de entrega)

### 3.9 Recrutamento (Potencial Candidate)
- Cadastro de candidata a nova Yakult Lady com formulário de qualificação:
  - Dados pessoais, estado civil, número e idade dos filhos
  - Critérios de saúde/perfil: faixa etária 20–40, saúde para trabalhar andando, sem tatuagens visíveis, boa comunicação
  - Interesse na vaga: já foi apresentada ao trabalho? disponibilidade integral? meio de locomoção próprio? sabe ler/escrever/calcular troco? não tem outro emprego?
  - Avaliação geral da Lady sobre a candidata (muito adequada / adequada / potencial)
- Lista de candidatas indicadas

### 3.10 Treinamento e desempenho
- **Aulas / licença Yakult:** vídeos e materiais de treinamento, com download offline
- **Treinamento do meio-dia (Noon Training):** check-in por **QR code com validade curta** (contagem regressiva), histórico de presença
- **Resumo de desempenho (Business Situation):** visão mensal/anual de vendas, dias trabalhados, média de garrafas, renda, comissão, "diligência", ranking, violações, indicações de recrutamento
- **Registro de humor (Mood):** Lady reporta como está se sentindo (muito bem / bem / normal / com problema / muito mal) — parece ser um canal de bem-estar/RH
- **Violações e recompensas:** módulos administrativos de advertência e reconhecimento (provavelmente visão do supervisor/líder)

### 3.11 Supervisão (visão de Líder/Gestor, mesmo app com outro papel)
- Tela de líder para ver informações de clientes
- Confirmação/scanner de QR de treinamento
- Cadastro de violação vinculado a uma Yakult Lady específica
- Cadastro de recompensa vinculado a uma Yakult Lady específica
- Fluxo próprio de troca de senha para o papel de líder

### 3.12 Financeiro da loja/filial
- **Receitas e despesas da loja (Store Rev/Exp):** lançamento de entradas e saídas, filtro por tipo, totais de receita e despesa

### 3.13 Pesquisas (Survey)
- Formulário de pesquisa com perguntas abertas e de múltipla escolha
- Pesquisa aplicada a clientes durante a visita
- Status "feito" / "não feito"

### 3.14 Infraestrutura técnica observada
- **Offline-first:** quase todo módulo tem uma etapa de sincronização própria antes de operar (o app roda em campo com internet instável)
- Alertas de pouca memória no dispositivo (recomenda sincronizar/limpar espaço)
- Tratamento explícito de timeout de conexão, sem internet, erro de servidor
- Tela de termos de uso específica para dado de localização e dado de dispositivo (LGPD/consentimento)

---

## 4. Leituras para o seu app (pontos de atenção)

- O app trata **duas personas em um único binário**: a vendedora de campo (Yakult Lady) e o líder/supervisor. Vale decidir cedo se seu app separa isso em dois apps ou mantém um só com papéis.
- O **offline-first** é claramente tratado como requisito central, não como extra — cada módulo carrega e sincroniza seus próprios dados antes de permitir a ação. Se o público (vendedoras em rota, sem internet estável) for parecido no Brasil, isso provavelmente também será crítico.
- A **verificação de proximidade geográfica** antes de liberar uma venda é um controle anti-fraude interessante (evita lançar venda "de casa").
- O controle de **lote de produção (LOT)** com validação de sintaxe sugere rastreabilidade regulatória (prazo de validade de produto fermentado) — hidde bem ver se a Yakult Brasil tem exigência parecida.
- Gamificação leve existe (ranking diário, contador de passos, metas), mas é modesta — pode ser um espaço de diferenciação.
- O módulo de "humor da Yakult Lady" é um toque de RH/bem-estar que não é óbvio olhando só a lista de features de venda.

---

## 5. Limitações desta análise

- Análise feita sobre **recursos e strings de interface**, não sobre o código de negócio Dart compilado (esse fica embutido em binário nativo `.so` e não foi decompilado em detalhe).
- Não inclui capturas de tela reais — é uma reconstrução funcional a partir dos textos e permissões do app.
- Referente à versão 1.0.37 (mar/2023); o app pode ter evoluído desde então.
