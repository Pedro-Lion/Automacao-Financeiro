# Spec — Sistema de Automação de Processos Administrativos (SAPA)

> Este documento define O QUE o sistema faz e POR QUÊ. Não define COMO (isso está em `plan.md`).

---

## 1. Visão Geral

### 1.1 Problema

Uma empresa de execução de obras (reformas e construções) gerencia toda sua operação administrativa via WhatsApp. Informações financeiras, decisões de obra, controle de presença e logística estão dispersas em mensagens de texto e fotos em múltiplos grupos, sem sistema formal. Isso causa:

- Perda de informação (mensagens soterradas no histórico)
- Retrabalho manual (consolidar NFs, gerar relatórios, calcular KMs)
- Erro humano (esquecimento de lançamentos, classificação incorreta)
- Falta de visibilidade (nenhum dashboard ou planilha atualizada em tempo real)

### 1.2 Solução

Um sistema local que:

1. Conecta-se ao WhatsApp da empresa como participante passivo
2. Lê e classifica automaticamente as mensagens dos grupos operacionais
3. Usa IA para extrair dados estruturados (OCR de NFs, NLP de decisões)
4. Gera e atualiza planilhas, relatórios e organiza arquivos no OneDrive

### 1.3 Stakeholders

| Papel | Quem | Interação com o sistema |
| --- | --- | --- |
| Gestores de obra | 2 sócios + 2 arquitetos | Usam WhatsApp normalmente; recebem confirmações/resumos no privado |
| Administrativo | Equipe ADM | Consulta planilhas geradas no OneDrive; faz upload de fatura do cartão |
| Operador do sistema | Qualquer gestor ou ADM | Ativa o sistema (botão/agendamento); resolve pendências |
| Prestadores | Diaristas e terceirizados | Indiretamente — seus dados de frequência são capturados |

### 1.4 Estrutura de Comunicação

| Grupo WhatsApp | Participantes | Dados extraídos |
| --- | --- | --- |
| Grupo Geral de Gestores | 4 gestores | Decisões gerais, agendamentos |
| Grupo por Obra (1 por obra ativa) | Gestor + sócios + arquiteto | Fotos de obra, decisões, atas, frequência |
| Grupo Geral de Notas Fiscais | Todos os gestores | Fotos de NF + legendas classificatórias |
| Chat privado com cada gestor | Bot ↔ gestor | Confirmações, KM, resumos |

---

## 2. Funcionalidades (Features)

### 2.1 [F01] Processamento de Notas Fiscais

**Prioridade:** MVP — Fase 1**Fonte:** Grupo Geral de Notas Fiscais

2.1.1 Descrição

O sistema monitora o grupo de NFs e, para cada foto enviada com legenda:

1. **Extrai a legenda** e identifica:- Nome da obra (ex.: "OBRA FA", "Obra Pedro em São Paulo")
- Status da compra: `REEMBOLSO` | `MATERIAL EMPRESA` | `FERRAMENTA`
- Se é NF ou comprovante de pagamento
2. **Faz OCR da imagem** e extrai:- Fornecedor
- CNPJ do fornecedor
- Data da compra
- Valor total
- Itens comprados (quando legível)
3. **Associa legenda ↔ foto** corretamente:- Legenda na mesma mensagem da foto → associação direta
- Legenda em mensagem separada logo após a foto → associação por proximidade temporal
- Múltiplas fotos sem legenda → marca como `pending_review`
4. **Grava no OneDrive:**- Foto original na pasta da obra correspondente
- Atualiza planilha de gastos da obra
- Se `REEMBOLSO`: alimenta relatório mensal de reembolso

2.1.2 Saídas Esperadas

| Saída | Formato | Localização OneDrive | Frequência de atualização |
| --- | --- | --- | --- |
| Planilha de gastos por obra | Excel (.xlsx) | `/{obra}/Financeiro/Gastos_{obra}.xlsx` | A cada execução |
| Relatório mensal de reembolso | Excel (.xlsx) | `/{obra}/Financeiro/Reembolso_{mes}_{ano}.xlsx` | Mensal (consolidado) |
| Fotos de NF organizadas | JPG/PNG | `/{obra}/NFs/{status}/` | A cada execução |
| Registro de estoque (FERRAMENTA) | Excel (.xlsx) | `/Empresa/Estoque_Ferramentas.xlsx` | Quando houver FERRAMENTA |

2.1.3 Regras de Negócio

- Se a imagem é um comprovante (não NF), o campo "Tipo" deve ser "Comprovante" e, se for REEMBOLSO, gerar observação "NF pendente" na planilha.
- Classificação `FERRAMENTA` NÃO vai para a planilha da obra — vai para estoque compartilhado.
- O relatório de reembolso mensal contém APENAS itens `REEMBOLSO` daquela obra, com: data, fornecedor, valor, somatória final.

2.1.4 Tratamento de Ambiguidade

| Situação | Ação |
| --- | --- |
| Legenda não contém nome de obra reconhecido | Marca `pending_review`, pergunta ao gestor no privado |
| OCR não consegue ler valor ou fornecedor | Grava o que conseguiu, marca campos faltantes como "VERIFICAR" |
| Foto sem legenda e sem contexto | Marca `unclassified`, pergunta ao gestor |
| Duas fotos seguidas, uma legenda | Associa à foto mais próxima; marca a outra como `pending_review` |

---

### 2.2 [F02] Conciliação Administrativa

**Prioridade:** MVP — Fase 2**Fonte:** Upload manual (Excel da fatura do cartão)

2.2.1 Descrição

O administrativo faz upload da fatura mensal do cartão de crédito (Excel). O sistema:

1. Lê os lançamentos da fatura (data, valor, estabelecimento)
2. Compara com os registros da planilha de NFs gerada em F01
3. Identifica e destaca:- Lançamentos na fatura SEM NF correspondente → "Compra sem nota"
- NFs registradas SEM lançamento na fatura → "Nota sem débito"
- Valores divergentes (mesmo fornecedor, datas próximas, valores diferentes)

2.2.2 Saídas Esperadas

| Saída | Formato | Localização |
| --- | --- | --- |
| Relatório de conciliação | Excel (.xlsx) | `/Empresa/Financeiro/Conciliacao_{mes}_{ano}.xlsx` |

2.2.3 Regras de Negócio

- O sistema **NÃO toma decisão** sobre divergências — apenas destaca para revisão humana.
- Tolerância de matching: mesma data ±2 dias, mesmo valor ±R$1,00.
- Se o estabelecimento no cartão não bate com o fornecedor da NF, usa valor + data como critério.

---

### 2.3 [F03] Relatório de Quilometragem (KM)

**Prioridade:** MVP — Fase 3**Fonte:** Chat privado (gestor → bot)

2.3.1 Descrição

Cada gestor envia mensagens ao bot no privado informando seus deslocamentos do dia:

```
Cheguei FA
Fui na Leroy Merlin Centro
Voltei FA
Fui FR
Voltei casa

```

O sistema:

1. Interpreta a sequência como trajetos: `Casa → FA → Leroy Merlin → FA → FR → Casa`
2. Calcula a distância de cada trecho (via API de rotas)
3. Aplica a taxa de reembolso por km (configurável)
4. Gera planilha mensal de reembolso de KM por gestor

2.3.2 Endereços

- **Casa** de cada gestor: cadastrado no sistema (configuração)
- **Obras**: endereços cadastrados por sigla/nome
- **Locais avulsos** (lojas, escritórios): interpretados por IA + geocoding

2.3.3 Regras de Negócio

- Se o gestor esqueceu de reportar um dia, pode enviar retroativamente: "Segunda-feira: Cheguei FA, fui JE, voltei casa"
- Mensagens com data explícita ("dia 15/01: ...") são registradas naquela data.
- Mensagens sem data → data do envio da mensagem.
- O sistema confirma o trajeto interpretado antes de consolidar (responde no privado com resumo).

2.3.4 Saídas Esperadas

| Saída | Formato | Localização |
| --- | --- | --- |
| Planilha mensal de KM | Excel (.xlsx) | `/Empresa/KM/Reembolso_KM_{gestor}_{mes}_{ano}.xlsx` |

2.3.5 Preparação para Futuro

- A arquitetura DEVE suportar substituição da entrada manual por integração com app GPS (ex.: Google Timeline, TripLog) sem reescrever a lógica de cálculo e geração de relatórios.

---

### 2.4 [F04] Relatório de Visita de Obra e Ata de Decisões

**Prioridade:** MVP — Fase 4**Fonte:** Grupos por Obra

2.4.1 Descrição

O sistema monitora os grupos de cada obra e identifica:

- **Decisões**: mensagens que contêm aprovações, escolhas, definições (ex.: "Aprovado usar porcelanato X", "Decidido trocar fornecedor de elétrica")
- **Fotos de andamento**: fotos com comentários descritivos

Periodicamente (configurável: semanal/quinzenal), gera:

1. **ATA de decisões**: lista cronológica de decisões aprovadas, com fotos e legendas
2. **Detecção de contradições**: se uma decisão posterior contradiz uma anterior sobre o mesmo assunto, o sistema condensa mostrando a evolução

2.4.2 Saídas Esperadas

| Saída | Formato | Localização |
| --- | --- | --- |
| ATA semanal/quinzenal | Word (.docx) ou PDF | `/{obra}/Atas/ATA_{periodo}_{obra}.docx` |

2.4.3 Regras de Negócio

- Uma "decisão" é identificada por IA com base em padrões linguísticos: verbos de aprovação, palavras-chave ("decidido", "aprovado", "vamos com", "fechado", "definido").
- Mensagens puramente informativas (fotos sem decisão) são separadas como "registro de andamento" — não entram na ATA de decisões.
- O template de ATA será definido futuramente, mas o sistema deve suportar mudança de template sem reprocessamento.

---

### 2.5 [F05] Organização de Mídias

**Prioridade:** Fase 5**Fonte:** Grupos por Obra

2.5.1 Descrição

Todas as fotos e vídeos enviados nos grupos de obra são automaticamente:

1. Baixados
2. Nomeados com data e contexto (se houver legenda)
3. Salvos na pasta da obra no OneDrive, organizados por data ou etapa

2.5.2 Saídas Esperadas

| Saída | Formato | Localização |
| --- | --- | --- |
| Mídias organizadas | JPG/PNG/MP4 | `/{obra}/Fotos/{YYYY-MM-DD}/` |

2.5.3 Regras de Negócio

- Fotos de NF (enviadas no grupo de NF) são gerenciadas por F01, não por este módulo.
- Mídias sem contexto são salvas apenas com timestamp no nome.
- Vídeos acima de 50MB são referenciados (link) mas não baixados automaticamente.

---

### 2.6 [F06] Controle de Estoque de Ferramentas

**Prioridade:** Fase 6**Fonte:** Classificação `FERRAMENTA` do módulo F01

2.6.1 Descrição

Quando uma NF é classificada como `FERRAMENTA`, além do processamento padrão:

1. Cada item da NF é registrado no inventário de ferramentas
2. O registro contém: item, data, fornecedor, valor unitário, quantidade, obra que comprou

2.6.2 Saídas Esperadas

| Saída | Formato | Localização |
| --- | --- | --- |
| Inventário de ferramentas | Excel (.xlsx) | `/Empresa/Estoque_Ferramentas.xlsx` |

2.6.3 Feature Futura (não implementar agora)

- Histórico de preço por item para comparação entre fornecedores.

---

### 2.7 [F07] Controle de Frequência (Diaristas)

**Prioridade:** Fase 7**Fonte:** Grupos por Obra

2.7.1 Descrição

Prestadores pagos por diária têm sua presença registrada nos grupos de obra. O sistema identifica:

- Mensagens de registro de presença (ex.: "João presente hoje", foto do time na obra, lista de quem veio)
- Consolida em planilha semanal de frequência por obra

2.7.2 Saídas Esperadas

| Saída | Formato | Localização |
| --- | --- | --- |
| Planilha de frequência semanal | Excel (.xlsx) | `/{obra}/Frequencia/Freq_{semana}_{obra}.xlsx` |
| Resumo de pagamento semanal | Excel (.xlsx) | `/{obra}/Frequencia/Pagamento_{semana}_{obra}.xlsx` |

2.7.3 Regras de Negócio

- Prestadores são identificados pelo nome de contato no WhatsApp ou número.
- A diária de cada prestador é configurada no sistema (cadastro).
- O sistema calcula: total de dias × valor da diária = valor a pagar.

---

### 2.8 [F08] Controle de Terceirizados (Empreitada)

**Prioridade:** Fase 8**Fonte:** Grupos por Obra

2.8.1 Descrição

Prestadores por empreitada têm contratos com entregas parciais. O sistema:

1. Registra o contrato (escopo, valor total, parcelas)
2. Identifica nos grupos quando entregas são mencionadas/aprovadas
3. Atualiza status de pagamento

2.8.2 Saídas Esperadas

| Saída | Formato | Localização |
| --- | --- | --- |
| Controle de empreitadas | Excel (.xlsx) | `/{obra}/Terceirizados/Empreitadas_{obra}.xlsx` |

---

### 2.9 [F09] Agendamento → Google Calendar

**Prioridade:** Fase 9**Fonte:** Todos os grupos

2.9.1 Descrição

O sistema identifica menções a compromissos, visitas e prazos nos grupos e:

1. Extrai data, hora, local e participantes
2. Cria evento no Google Calendar do gestor responsável
3. Confirma via mensagem privada antes de criar

2.9.2 Regras de Negócio

- SEMPRE confirma antes de criar o evento (nunca automático para agenda).
- Se não conseguir identificar data/hora com certeza, pergunta.

---

## 3. Requisitos Não-Funcionais

| Requisito | Especificação |
| --- | --- |
| Disponibilidade | Sob demanda (não precisa ser 24/7) |
| Tempo de processamento | Máximo 5 min para processar um dia inteiro de mensagens |
| Precisão OCR | ≥ 85% de acerto em NFs brasileiras (valor, fornecedor, data) |
| Idioma | Português brasileiro (todas as interações e classificações) |
| Reprocessamento | Executar 2x = mesmo resultado (idempotente) |
| Recovery | Se falhar no item N, próxima execução retoma do item N |
| Logs | Toda execução gera log legível (não apenas stack traces) |
| Configuração | Parâmetros de negócio (taxa KM, diárias, obras ativas) em arquivo config editável sem código |

---

## 4. Fora de Escopo (Explicitamente)

- Dashboard web ou app mobile
- Integração com email (fase futura)
- Integração com banco/fintech para fatura (fase futura)
- Chatbot que responde perguntas dos gestores sobre dados
- Qualquer funcionalidade que exija o gestor mudar seu comportamento no WhatsApp

