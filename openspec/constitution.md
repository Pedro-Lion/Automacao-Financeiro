# Constitution — Sistema de Automação de Processos Administrativos (SAPA)

> Este documento define os princípios inegociáveis do projeto. Nenhuma decisão de implementação pode violar estes artigos.

---

## Artigo I — Modularidade Obrigatória (Plugin Architecture)

O sistema DEVE ser construído como um **pipeline modular**:

```
[ENTRADA: WhatsApp] → [MÓDULOS DE FEATURE] → [SAÍDA: OneDrive]

```

- A camada de entrada (WhatsApp) e a camada de saída (OneDrive) são fixas e compartilhadas.
- Cada funcionalidade (NF, KM, ATA, etc.) é um **módulo independente** que pode ser adicionado, removido ou substituído sem afetar os demais.
- Novos módulos devem poder ser plugados sem modificar o core do sistema.
- Interfaces entre módulos são definidas por contratos (ver `contracts.md`).

**Razão:** O negócio vai evoluir e novas automações serão necessárias. O custo de adicionar uma feature não pode exigir refatoração do sistema inteiro.

---

## Artigo II — Custo Zero Operacional (com upgrade path)

- Na versão atual, o sistema DEVE operar com custo mensal R$0.
- Toda dependência externa gratuita DEVE ter um **adapter pattern** que permita substituição futura por serviço pago sem reescrever lógica de negócio.
- Exemplos de upgrades futuros previstos:- Gemini Flash → Claude/GPT-4o (adapter de LLM)
- whatsapp-web.js → Meta Cloud API oficial (adapter de messaging)
- Pasta local OneDrive → Microsoft Graph API (adapter de storage)
- SQLite → PostgreSQL (adapter de persistência)

**Razão:** A empresa está no início e precisa validar o conceito antes de investir. Mas quando crescer, o sistema não pode ser descartado — deve evoluir.

---

## Artigo III — Aplicação Local-First

- O sistema roda como **aplicação local** no computador da empresa.
- NÃO depende de cloud, servidor externo, ou infraestrutura além do PC.
- Deve ser ativável de duas formas:1. **Sob demanda** (botão/atalho no desktop)

1. **Agendado** (Windows Task Scheduler ou equivalente)

- O sistema operacional primário é **Windows**, mas a arquitetura DEVE ser portável (sem dependências Windows-only no core; path handling via `path` module; sem chamadas diretas a APIs Win32).

**Razão:** Simplicidade operacional. Nenhum gestor precisa entender infraestrutura.

---

## Artigo IV — Autonomia com Supervisão Inteligente

- O sistema age **automaticamente** para informações claras e bem-estruturadas.
- O sistema **solicita confirmação humana** (via WhatsApp ou interface local) apenas quando:- OCR da NF tem confiança abaixo do threshold configurável (default: 80%)
- Mensagem é ambígua na classificação (ex.: legenda não bate com padrão esperado)
- Associação foto↔legenda é incerta (ex.: múltiplas fotos sem legenda clara)
- Toda ação automática gera um **log de auditoria** (o que foi processado, quando, com qual confiança).

**Razão:** Os gestores não querem aprovar cada NF manualmente — mas erros silenciosos são inaceitáveis. O sistema deve ser "inteligente o suficiente para saber quando não sabe".

---

## Artigo V — Dados Confinados

- Os dados do sistema transitam apenas entre: código local, OneDrive da empresa, e API de IA (Gemini Flash).
- Nenhum dado é armazenado em serviço de terceiro além do provedor de IA (que processa e descarta).
- O banco de dados local (SQLite) contém apenas metadados e índices — nunca dados completos de clientes.
- Mídias originais (fotos de NF, fotos de obra) são armazenadas APENAS no OneDrive.

**Razão:** Privacidade e controle. A empresa não quer seus dados financeiros em plataformas externas.

---

## Artigo VI — WhatsApp como Interface Natural

- O sistema **NÃO altera** a forma como os gestores se comunicam.
- O número do sistema é um participante **passivo** nos grupos — lê mensagens mas não interfere no fluxo natural.
- Interações do bot (confirmações, resumos) acontecem em **chat privado** com cada gestor, nunca no grupo.
- A formatação de legendas de NF segue o padrão existente: `[NOME DA OBRA] [STATUS]`.

**Razão:** Adoção zero-friction. Se exigir mudança de comportamento, não será usado.

---

## Artigo VII — Resiliência e Idempotência

- O sistema DEVE ser **idempotente**: rodar duas vezes sobre as mesmas mensagens não duplica dados.
- Cada mensagem processada recebe um `message_id` único (do WhatsApp) que é registrado no DB local.
- Se o sistema falhar no meio de uma execução, a próxima execução retoma de onde parou.
- Erros de IA (OCR falhou, classificação incerta) NUNCA interrompem o pipeline — o item é marcado como `pending_review` e o processamento continua.

**Razão:** Confiabilidade. O sistema roda sem supervisão técnica.

---

## Artigo VIII — Observabilidade

- Toda execução gera um **relatório de processamento** salvo localmente:- Mensagens lidas / processadas / ignoradas / com erro
- NFs extraídas com sucesso / falha
- Itens pendentes de confirmação
- Arquivos escritos no OneDrive
- O relatório é acessível via interface local e opcionalmente enviado por WhatsApp (resumo) ao gestor principal.

**Razão:** Confiança. Os gestores precisam saber que o sistema está funcionando corretamente.

---

## Artigo IX — Preparado para Escala

Mesmo que hoje o sistema atenda 4-5 obras e 4 gestores, a arquitetura DEVE suportar sem refatoração:

- Até 20 obras simultâneas
- Até 10 gestores
- Até 200 NFs/semana
- Novos tipos de documento (além de NF)
- Novos canais de entrada (além de WhatsApp — ex.: email, Telegram)
- Novos destinos de saída (além de OneDrive — ex.: ERP, dashboard web)

**Razão:** A empresa está crescendo. O sistema deve crescer junto.

---

## Resumo dos Princípios

| # | Princípio | Regra de Ouro |
| --- | --- | --- |
| I | Modularidade | Features são plugins — entrada e saída são fixas |
| II | Custo Zero + Upgrade Path | Grátis agora, adapters para pago depois |
| III | Local-First | Roda no PC, sem cloud, portável |
| IV | Autonomia Inteligente | Automático quando claro, pergunta quando não |
| V | Dados Confinados | Código + OneDrive + IA — nada mais |
| VI | Interface Natural | WhatsApp não muda para os gestores |
| VII | Resiliência | Idempotente, retomável, tolerante a falhas |
| VIII | Observabilidade | Log tudo, reporte tudo |
| IX | Escala | Preparado para 4x o volume atual |

