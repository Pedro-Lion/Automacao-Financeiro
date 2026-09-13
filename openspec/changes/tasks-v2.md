# Tasks — Sistema de Automação de Processos Administrativos (SAPA)

> Lista ordenada de tarefas com dependências. Cada task é autocontida — um desenvolvedor (ou AI) deve conseguir implementá-la apenas com este documento + spec + plan + contracts.

---

## Fase 0: Setup & Infraestrutura

### T-000: Inicialização do Projeto

- [x] Criar repositório com estrutura de pastas conforme `plan.md` seção 3
- [x] Configurar `package.json` com dependências Node.js:
  - `whatsapp-web.js` (WhatsApp)
  - `better-sqlite3` (SQLite)
  - `js-yaml` (config)
  - `winston` (logging)
- [x] Configurar `requirements.txt` com dependências Python:
  - `google-generativeai` (Gemini)
  - `openpyxl` (Excel)
  - `python-docx` (Word)
  - `Pillow` (imagens)
  - `pytesseract` (OCR fallback)
  - `requests` (HTTP)
- [x] Criar `config.example.yaml` com todos os campos documentados
- [x] Criar `config.schema.json` para validação
- [x] Criar `scripts/setup.bat` (instala deps, cria pastas)
- [x] Criar `scripts/run.bat` (atalho de execução)

**Entregável:** Projeto inicializa sem erro (`npm install` + `pip install -r requirements.txt`)

**Atualização da implementação:**
- Além das dependências originais, foi criado o ambiente `.venv-paddle` com PaddlePaddle e PaddleOCR PP-OCRv4.
- O idioma latino/português foi configurado para o fluxo OCR atual.
- O provider ativo de OCR passou a ser o PaddleOCR, mantendo o código histórico do Tesseract para compatibilidade.

---

### T-001: Banco de Dados (SQLite)

**Depende de:** T-000

- [x] Criar módulo `src/core/state.js`
- [x] Implementar criação automática do schema (todas as tabelas de `data-model.md` seção 2)
- [x] Implementar métodos CRUD genéricos:
  - `markMessageProcessed(messageId, feature, status, data)`
  - `isMessageProcessed(messageId): boolean`
  - `getLastTimestamp(groupId): number`
  - `updateSyncState(groupId, lastMessageId, lastTimestamp)`
- [x] Implementar migration system simples (versão do schema no DB)
- [x] Testes: inserir, consultar, idempotência (inserir mesmo ID 2x não duplica)

**Entregável:** DB cria-se sozinho na primeira execução; queries funcionam

---

### T-002: Sistema de Logging

**Depende de:** T-000

- [x] Criar módulo `src/core/logger.js`
- [x] Logs em arquivo (`logs/YYYY-MM-DD_HH-MM.log`) + console
- [x] Níveis: debug, info, warn, error
- [x] Formato: `[TIMESTAMP] [LEVEL] [MODULE] message`
- [x] Rotação: manter últimos 30 logs (deletar mais antigos)

**Entregável:** Logs legíveis por humano em arquivo + terminal

---

### T-003: Carregamento de Configuração

**Depende de:** T-000

- [x] Criar módulo para carregar e validar `config.yaml`
- [x] Resolver variáveis de ambiente (`${VAR}`)
- [x] Validar contra schema
- [x] Expor config como objeto acessível por todos os módulos
- [x] Erro claro se config inválido (apontar campo e valor esperado)

**Entregável:** `const config = loadConfig()` funciona e valida

---

### T-004: Python Bridge

**Depende de:** T-000

- [x] Criar módulo `src/core/python-bridge.js`
- [x] Implementar `execPython(script, inputObject): Promise<object>`
- [x] Comunicação via stdin (JSON) → stdout (JSON)
- [x] Timeout configurável (default: 60s)
- [x] Tratamento de erros Python (stderr → throw com mensagem legível)
- [x] Testes: chamar script Python simples, verificar ida e volta de dados

**Entregável:** Node chama Python, passa JSON, recebe JSON de volta

---

## Fase 1: WhatsApp Adapter

### T-010: Conexão e Sessão WhatsApp

**Depende de:** T-001, T-002, T-003

- [x] Criar módulo `src/adapters/whatsapp/client.js`
- [x] Implementar `connect()`:
  - Primeira vez: gerar QR code no terminal para scan
  - Depois: restaurar sessão de `data/session/`
  - Detectar desconexão e informar no log
- [x] Implementar `isConnected()`
- [x] Implementar `disconnect()`
- [x] Persistir sessão entre execuções (não pedir QR toda vez)

**Entregável:** Conecta ao WhatsApp, mantém sessão, reconecta automaticamente

**Atualização da implementação:**
- O cliente `whatsapp-web.js` passou a expor estados `initializing`, `awaiting_qr`, `ready`, `auth_failure`, `disconnected` e `error`.
- O QR code recebido é armazenado e exibido no terminal; a sessão persistente continua em `data/session`.
- O modo `setup` foi separado da inicialização do SQLite para evitar falhas nativas antes da emissão do QR.
- O orquestrador valida o grupo exato `Notas Fiscais Gerais`, descobre seu ID quando a configuração está vazia e persiste o identificador em `config.yaml`.
- Grupos de obras configurados devem iniciar com `Obra`; grupos não validados não entram no fluxo de leitura.
- Foi adicionado o adaptador opcional `WahaClient` com `WahaReader`, seleção por `whatsapp.provider: waha` e ambiente de teste em `docker-compose.waha.yml`.
- O adaptador original `whatsapp-web.js` permanece disponível com `whatsapp.provider: whatsapp-web` para comparação e fallback.

---

### T-011: Leitura de Mensagens

**Depende de:** T-010

- [x] Criar módulo `src/adapters/whatsapp/reader.js`
- [x] Implementar `getMessages(groupId, sinceTimestamp)`:
  - Buscar mensagens do grupo desde o timestamp
  - Retornar array ordenado cronologicamente
  - Incluir metadados: sender, type, body, caption, hasMedia
- [x] Implementar `getPrivateMessages(contactPhone, sinceTimestamp)`
- [x] Tratar paginação (se o grupo tiver muitas mensagens)
- [x] Filtrar mensagens do próprio bot (não processar as próprias)

**Entregável:** Busca mensagens novas de qualquer grupo/chat privado

---

### T-012: Download de Mídias

**Depende de:** T-011

- [x] Criar módulo `src/adapters/whatsapp/media.js`
- [x] Implementar `downloadMedia(message)`:
  - Baixar imagem/vídeo/documento da mensagem
  - Salvar em `data/tmp/` com nome baseado no message_id
  - Retornar path local
- [x] Tratar erros: mídia expirada, timeout, arquivo corrompido
- [x] Limpar `data/tmp/` após processamento (mover para OneDrive)

**Entregável:** Fotos de NF são baixadas localmente

---

### T-013: Envio de Mensagens (Privado)

**Depende de:** T-010

- [x] Criar módulo `src/adapters/whatsapp/sender.js`
- [x] Implementar `sendMessage(phone, text)`:
  - Envia mensagem de texto no chat privado
  - Usado para: confirmações, resumos, perguntas de review
- [x] Rate limiting: máximo 1 msg/segundo (evitar spam/ban)
- [x] Log de todas as mensagens enviadas

**Entregável:** Bot envia mensagens privadas para gestores

---

## Fase 2: AI Adapter

### T-020: Interface Abstrata de AI

**Depende de:** T-004

- [x] Criar `src/adapters/ai/provider.js` (classe base abstrata)
- [x] Definir interface conforme `contracts.md` seção 1.2
- [x] Criar factory: `createAIProvider(config)` retorna o provider configurado
- [x] Validar e conectar fallback configurado entre providers

**Entregável:** Interface pronta para implementações concretas

**Atualização da implementação:**
- A factory passou a reconhecer `paddleocr` como provider configurável.
- O fluxo de OCR foi separado da classificação e demais operações de IA, permitindo combinar PaddleOCR local com Gemini conforme a etapa.
- O fallback entre providers continua disponível, mas deve ser configurado conforme a finalidade: OCR local, classificação ou geração.

---

### T-021: Implementação Gemini Flash

**Depende de:** T-020

- [x] Criar `src/adapters/ai/gemini.js` (ou Python: `src/python/ai_gemini.py`)
- [x] Implementar `analyzeImage()`:
  - Envia imagem + prompt para Gemini 1.5 Flash
  - Parseia resposta em JSON estruturado
  - Calcula confidence baseado na completude dos campos
- [x] Implementar `classifyText()`
- [x] Implementar `extractFromText()`
- [x] Implementar `generateText()`
- [x] Rate limiting: respeitar 15 req/min do free tier
- [x] Retry com exponential backoff em 429/500
- [x] Tratar quando Gemini retorna resposta mal-formatada
- [x] Cobrir parsing tolerante de JSON envolvido por texto adicional

**Entregável:** IA funciona para OCR e classificação com Gemini Flash

**Atualização da implementação:**
- O Gemini deixou de ser o OCR primário do fluxo atual.
- Continua disponível para classificação de texto, geração de texto e operações de IA que não dependem exclusivamente do OCR local.
- O uso de Gemini como fallback para mensagens ambíguas ainda precisa ser conectado ao runtime principal do `src/index.js`.

---

### T-022: Fallback Tesseract

**Depende de:** T-020

- [x] Criar `src/adapters/ai/tesseract.js` (via Python: pytesseract)
- [x] Implementar `analyzeImage()` usando Tesseract local
- [x] Pré-processamento de imagem: binarização, deskew, crop
- [x] Acionar fallback automático em erro ou baixa confiança do provider primário
- [x] Parsing do texto extraído com regex/heurísticas para campos de NF
- [x] Confidence sempre menor que Gemini (0.5-0.7 range)

**Entregável:** OCR funciona mesmo sem internet (qualidade inferior)

**Atualização da implementação:**
- O Tesseract não é mais o fallback OCR ativo do fluxo principal; foi preservado para compatibilidade e referência histórica.
- O OCR primário atual utiliza PaddleOCR com PP-OCRv4 e idioma latino/português.
- O parser estruturado recebe a resposta do PaddleOCR, calcula a confiança média reconhecida e valida fornecedor, valor, CNPJ/CPF e data.
- Quando aplicável, o Gemini pode atuar como fallback de IA para interpretação/classificação, sem substituir o OCR local padrão.

---

## Fase 3: Storage Adapter (OneDrive)

### T-030: Writer de Excel

**Depende de:** T-004

- [x] Criar `src/python/excel_writer.py`
- [x] Implementar funções:
  - `create_workbook(path, sheets_data)`: cria Excel do zero
  - `append_rows(path, sheet_name, rows)`: adiciona linhas
  - `update_cell(path, sheet_name, cell, value)`: atualiza célula
  - `read_workbook(path)`: lê Excel existente
- [x] Formatação: headers em negrito, moeda BR (R$ #.##0,00), largura auto
- [ ] Criar templates base em `templates/`

**Atualização da implementação:**
- A escrita de planilhas está disponível, mas os templates base ainda não foram criados.

**Entregável:** Gera e atualiza planilhas Excel formatadas

---

### T-031: Writer de Word

**Depende de:** T-004

- [x] Criar `src/python/docx_writer.py`
- [x] Implementar geração de documento a partir de estrutura JSON:
  - Título, subtítulos, parágrafos, tabelas, imagens inline
- [x] Template de ATA (ver spec seção 2.4.4)
- [ ] Manter template editável em `templates/ata_template.docx`

**Atualização da implementação:**
- A geração estrutural de documentos está disponível, mas o arquivo editável `templates/ata_template.docx` permanece pendente.

**Entregável:** Gera documentos Word (ATAs) formatados

---

### T-032: Organizador de Arquivos

**Depende de:** T-003

- [x] Criar módulo `src/adapters/onedrive/organizer.js`
- [x] Implementar:
  - `ensureFolder(relativePath)`: cria pasta se não existe
  - `saveFile(sourcePath, destPath)`: copia arquivo para OneDrive
  - `buildPath(template, variables)`: resolve path templates do config
- [x] Criar estrutura de pastas inicial para cada obra no OneDrive

**Entregável:** Arquivos são salvos na pasta correta do OneDrive

---

## Fase 4: Core — Orchestrator & Classifier

### T-040: Message Classifier

**Depende de:** T-021

- [x] Criar módulo `src/core/classifier.js`
- [x] Implementar classificação por regras (rápido, sem IA):
  - Grupo NF + imagem → f01
  - Chat privado + padrão KM → f03
  - Grupo obra + padrão decisão → f04
- [x] Implementar classificação por IA (para mensagens ambíguas)
- [x] Retornar array de classifications (uma mensagem pode ir para múltiplos módulos)
- [x] Log de cada classificação com reasoning

**Entregável:** Mensagens são corretamente roteadas para features

**Atualização da implementação:**
- O classificador combina regras locais, deduplicação e múltiplos destinos por mensagem.
- Existe suporte para classificação via provider de IA em mensagens ambíguas.
- A injeção do provider Gemini no runtime principal ainda precisa ser concluída para ativar esse fallback em execução operacional.

---

### T-041: Orchestrator (Pipeline Principal)

**Depende de:** T-010, T-011, T-040, T-001

- [x] Criar módulo `src/core/orchestrator.js`
- [x] Implementar pipeline conforme `plan.md` seção 4.3:
  1. CONNECT → WhatsApp
  2. FETCH → mensagens novas (desde último sync)
  3. CLASSIFY → distribui por feature
  4. DISPATCH → chama process() de cada feature ativa
  5. CONFIRM → identifica pending_reviews
  6. OUTPUT → chama generateOutputs() de cada feature
  7. LOG → gera execution report
  8. (opcional) NOTIFY → envia resumo ao gestor principal
- [x] Implementar `run()`, `runFeature(name)`, `reprocess()`
- [x] Tratar erros: feature que falha não interrompe as demais
- [x] Atualizar sync_state ao final

**Entregável:** Pipeline completo executa de ponta a ponta

**Atualização da implementação:**
- O pipeline WhatsApp → busca incremental → classificação → dispatch → pending reviews → outputs → execution log foi implementado.
- O estado de sincronização por grupo e o relatório da última execução são persistidos no SQLite.
- Falhas de uma feature são registradas sem interromper as demais.
- A execução real das features de notas fiscais ainda depende das tasks T-050, T-051 e T-052.
- A seleção de chats deixou de aceitar todos os grupos descobertos automaticamente: nesta etapa, somente `Notas Fiscais Gerais` é lido.
- O log registra `Encontrou o grupo`, `Realizado Escaneamento de Mensagens`, `Imagens Encontradas` e `Atualizado`, incluindo a quantidade de imagens lidas.
- Falhas na conexão, validação do grupo ou escaneamento são registradas como interrupções identificadas no log e no relatório da execução.
- A inicialização registra incompatibilidade de runtime no arquivo de log; o ambiente atual requer Node.js 24 ou superior por causa do binding nativo do `better-sqlite3`.
- A conexão agora registra diagnóstico da sessão (`clientStatus`, estado do WhatsApp Web e usuário conectado) antes da leitura.
- Quando o ID do grupo está configurado, a validação usa `getChatById()` diretamente e não depende da enumeração global `getChats()`.
- Falhas da API do WhatsApp Web são diferenciadas de falhas de autenticação e informam no log que a sessão pode estar autenticada, mas sem disponibilidade para listar grupos.
- Foi criado `scripts/get-group-id.js`, que captura o ID de `Notas Fiscais Gerais` ao receber uma mensagem nesse grupo, sem depender de `getChats()`.
- O `whatsapp-web.js` foi atualizado para `1.34.7` e o WhatsApp Web passou a usar uma versão fixa via `webVersionCache`.

---

### T-042: Entry Points (CLI + Scheduler)

**Depende de:** T-041

- [x] Criar `src/index.js` com comandos:
  - `node src/index.js setup` → primeira execução (QR code)
  - `node src/index.js run` → execução completa
  - `node src/index.js run --feature f01` → apenas uma feature
  - `node src/index.js status` → mostra última execução
  - `node src/index.js reviews` → mostra pending reviews
- [x] Criar `scripts/run.bat` (double-click para rodar)
- [x] Criar `scripts/schedule.bat` (registra no Task Scheduler)
- [x] Tratamento de erros global (nunca crash silencioso)

**Entregável:** Sistema operável via terminal e agendável

**Atualização da implementação:**
- Os comandos `setup`, `run`, `run --feature`, `status` e `reviews` foram implementados.
- `scripts/run.bat` executa o pipeline com tratamento explícito de erro.
- `scripts/schedule.bat` registra execução diária no Task Scheduler do Windows.
- A suíte automatizada atual valida 18 testes aprovados para os componentes implementados até esta etapa.

---

## Fase 5: Feature F01 — Notas Fiscais

### T-050: Extração de Legenda

**Depende de:** T-040

- [ ] Criar módulo `src/features/f01-notas-fiscais/associator.js`
- [ ] Implementar parsing de legenda com regex:
  - Extrair nome da obra
  - Extrair status (REEMBOLSO | MATERIAL EMPRESA | FERRAMENTA)
  - Determinar se é NF ou comprovante
- [ ] Implementar associação legenda↔foto:
  - Legenda no caption da imagem → direto
  - Legenda em mensagem seguinte (janela de 5 min, mesmo autor) → associar
  - Ambíguo → pending_review
- [ ] Fuzzy matching de nomes de obra (lidar com variações: "Pedro SP", "PEDRO", "obra pedro")

**Entregável:** Legendas corretamente parseadas e associadas a fotos

---

### T-051: OCR de Notas Fiscais

**Depende de:** T-021, T-012

- [ ] Criar `src/features/f01-notas-fiscais/extractor.js`
- [ ] Criar prompt otimizado para Gemini em `prompts/ocr-nf.txt`:
  - Instruir extração de: fornecedor, CNPJ, data, valor total, itens
  - Output em JSON com schema fixo
  - Tratar NFs brasileiras (formato BR de CNPJ, moeda, data)
- [ ] Implementar pipeline: download foto → enviar para AI → parsear resultado
- [ ] Calcular confidence por campo
- [ ] Se confiança global < threshold → pending_review

**Entregável:** NFs brasileiras extraídas com ≥85% precisão

---

### T-052: Geração de Planilha de Gastos

**Depende de:** T-030, T-051

- [ ] Criar `src/features/f01-notas-fiscais/index.js` (módulo completo)
- [ ] Implementar `generateOutputs()`:
  - Ler NFs processadas do DB
  - Agrupar por obra
  - Gerar/atualizar `Gastos_{obra}.xlsx` (append novas linhas)
  - Separar abas por mês
  - Aba "Resumo" com totais por tipo
- [ ] Implementar geração de relatório de reembolso mensal
- [ ] Copiar fotos para pasta da obra no OneDrive (organizadas por status)
- [ ] Atualizar estoque (quando tipo = FERRAMENTA)

**Entregável:** Planilhas de gastos geradas/atualizadas automaticamente

---

## Fase 6: Feature F02 — Conciliação

### T-060: Upload e Parsing de Fatura

**Depende de:** T-030

- [ ] Criar módulo `src/features/f02-conciliacao/index.js`
- [ ] Implementar leitura de fatura Excel (upload manual):
  - O usuário coloca o Excel da fatura em pasta pré-definida
  - Sistema detecta arquivo novo e processa
- [ ] Parser flexível: identificar colunas de data, valor, estabelecimento (aceitar variações de formato de banco)

**Entregável:** Fatura do cartão lida corretamente

---

### T-061: Matching e Relatório de Conciliação

**Depende de:** T-060, T-052

- [ ] Criar `src/features/f02-conciliacao/matcher.js`
- [ ] Implementar algoritmo de matching:
  - Para cada lançamento da fatura: buscar NF com mesmo valor (±R$1) e data (±2 dias)
  - Classificar: matched | fatura_sem_nf | nf_sem_fatura | valor_divergente
- [ ] Gerar planilha de conciliação com divergências destacadas (cor vermelha)
- [ ] NÃO tomar decisão automática — apenas reportar

**Entregável:** Relatório de conciliação com divergências

---

## Fase 7: Feature F03 — Quilometragem

### T-070: Parser de Mensagens de KM

**Depende de:** T-021

- [ ] Criar `src/features/f03-quilometragem/parser.js`
- [ ] Implementar parsing de mensagens de trajeto:
  - "Cheguei FA" → destino: obra FA
  - "Fui na Leroy Merlin" → destino: Leroy Merlin (geocoding)
  - "Voltei casa" → destino: endereço residencial
  - Registro retroativo: "Dia 15/01: cheguei FA, fui JE, voltei casa"
- [ ] Construir sequência de trechos a partir das mensagens do dia
- [ ] Se mensagem ambígua → confirmar com gestor

**Entregável:** Mensagens de KM convertidas em lista de trechos

---

### T-071: Cálculo de Rotas

**Depende de:** T-070

- [ ] Criar `src/adapters/routes/openroute.js`
- [ ] Implementar cálculo de distância via OpenRouteService API
- [ ] Cache de rotas frequentes (Casa→Obra = mesma distância sempre)
- [ ] Geocoding de locais avulsos ("Leroy Merlin Centro")
- [ ] Aplicar taxa de reembolso (config: `km.rate_per_km`)

**Entregável:** Distância calculada para cada trecho

---

### T-072: Planilha de KM

**Depende de:** T-071, T-030

- [ ] Criar output: `Reembolso_KM_{gestor}_{mes}_{ano}.xlsx`
- [ ] Colunas: Data | Trecho | KM | Valor
- [ ] Totais no rodapé
- [ ] Confirmar trajeto com gestor antes de consolidar (enviar resumo no privado)

**Entregável:** Relatório mensal de KM por gestor

---

## Fase 8: Feature F04 — Atas de Decisão

### T-080: Detector de Decisões

**Depende de:** T-021

- [ ] Criar `src/features/f04-atas/decision-detector.js`
- [ ] Implementar detecção via IA (prompt + padrões):
  - Palavras-chave: "decidido", "aprovado", "vamos com", "fechado", "definido"
  - Contexto: fotos + mensagens anteriores/posteriores
- [ ] Classificar categoria da decisão (material, design, fornecedor, prazo)
- [ ] Identificar contradições (decisão X conflita com decisão Y anterior sobre mesmo assunto)

**Entregável:** Decisões identificadas e categorizadas

---

### T-081: Gerador de ATA

**Depende de:** T-080, T-031

- [ ] Criar `src/features/f04-atas/ata-generator.js`
- [ ] Gerar ATA em Word com:
  - Título com período e obra
  - Decisões em ordem cronológica
  - Fotos inline quando disponíveis
  - Seção de "Alterações" quando houver contradições
- [ ] Periodicidade configurável por obra (semanal/quinzenal)
- [ ] Template editável

**Entregável:** ATAs geradas automaticamente em .docx

---

## Fase 9: Feature F05 — Mídias

### T-090: Organização de Mídias

**Depende de:** T-012, T-032

- [ ] Criar `src/features/f05-midias/index.js`
- [ ] Para cada foto/vídeo nos grupos de obra:
  - Baixar mídia
  - Nomear: `{YYYY-MM-DD}_{HH-MM}_{sender}_{caption_resumida}.{ext}`
  - Salvar em `/{obra}/Fotos/{YYYY-MM-DD}/`
- [ ] Ignorar mídias já processadas por outros módulos (NFs)
- [ ] Limitar: vídeos >50MB ficam só referenciados no log

**Entregável:** Fotos de obra organizadas por data no OneDrive

---

## Fase 10: Feature F06 — Estoque

### T-100: Registro de Ferramentas

**Depende de:** T-052

- [ ] Criar `src/features/f06-estoque/index.js`
- [ ] Quando F01 classifica como FERRAMENTA:
  - Extrair cada item da NF individualmente
  - Inserir no DB de estoque
  - Atualizar `Estoque_Ferramentas.xlsx`
- [ ] Colunas: Item | Qtd | Fornecedor | Valor Unit | Data | Obra

**Entregável:** Inventário de ferramentas atualizado

---

## Fase 11: Feature F07 — Frequência

### T-110: Detecção de Presença

**Depende de:** T-021, T-040

- [ ] Criar `src/features/f07-frequencia/index.js`
- [ ] Usar IA para identificar mensagens de frequência em grupos de obra:
  - "João e Pedro vieram hoje"
  - "Time completo"
  - Fotos do time no canteiro
  - Lista de nomes
- [ ] Cruzar nomes detectados com cadastro de prestadores
- [ ] Registrar presença/ausência por dia

**Entregável:** Frequência detectada automaticamente

---

### T-111: Planilha de Frequência e Pagamento

**Depende de:** T-110, T-030

- [ ] Gerar planilha semanal: prestador × dias da semana
- [ ] Calcular: Total dias × diária = valor a pagar
- [ ] Output: `Freq_Semana{N}_{ano}_{obra}.xlsx`

**Entregável:** Planilha de pagamento semanal

---

## Fase 12: Feature F08 — Terceirizados

### T-120: Controle de Empreitadas

**Depende de:** T-021

- [ ] Criar `src/features/f08-terceirizados/index.js`
- [ ] Registrar contratos (input manual via config ou mensagem)
- [ ] Detectar nos grupos quando entregas são mencionadas/aprovadas
- [ ] Atualizar status de parcelas
- [ ] Output: `Empreitadas_{obra}.xlsx`

**Entregável:** Controle de empreitadas atualizado

---

## Fase 13: Feature F09 — Agendamento

### T-130: Detecção de Compromissos

**Depende de:** T-021

- [ ] Criar `src/features/f09-agendamento/index.js`
- [ ] Usar IA para identificar menções a datas/horários futuros
- [ ] Extrair: data, hora, local, participantes, assunto
- [ ] SEMPRE confirmar com gestor antes de criar (enviar pergunta no privado)
- [ ] (Futuro) Integrar com Google Calendar API

**Entregável:** Compromissos detectados e confirmados

---

## Fase 14: Interface e Polish

### T-140: Resumo de Execução

**Depende de:** T-041

- [ ] Ao final de cada execução, gerar resumo legível:
  ```
  ✅ SAPA executado em 2min 34s
  📄 12 NFs processadas (2 pendentes de revisão)
  🚗 3 relatórios de KM atualizados
  📋 1 ATA gerada (Obra Pedro SP)
  📁 27 fotos organizadas
  ⚠️ 2 itens precisam de confirmação (ver 'reviews')
  
  ```
- [ ] Enviar resumo ao gestor principal via WhatsApp (privado)
- [ ] Salvar em log

**Entregável:** Feedback claro sobre cada execução

---

### T-141: Sistema de Reviews (Confirmação Humana)

**Depende de:** T-013

- [ ] Implementar fila de pending_reviews no DB
- [ ] Ao detectar item com baixa confiança:
  - Gerar pergunta clara
  - Enviar ao gestor no privado
  - Aguardar resposta (processada na próxima execução)
- [ ] Quando gestor responde, atualizar item e reprocessar

**Entregável:** Confirmação humana funciona via WhatsApp

---

### T-142: Documentação de Uso

**Depende de:** Todas as tasks

- [ ] Criar `README.md` com:
  - Requisitos (Node, Python, Tesseract)
  - Instalação passo-a-passo
  - Configuração do `config.yaml`
  - Primeira execução (QR code)
  - Uso diário
  - Troubleshooting
- [ ] Criar guia para adicionar nova obra
- [ ] Criar guia para adicionar novo prestador

**Entregável:** Qualquer pessoa técnica consegue instalar e operar

---

## Dependências Visuais

```
T-000 ─┬─ T-001 ─┬─ T-010 ─── T-011 ─── T-012
       │         │           │
       ├─ T-002  │           ├─ T-013
       │         │           │
       ├─ T-003 ─┤           └─── T-040 ─── T-041 ─── T-042
       │         │                  │
       └─ T-004 ─┼─ T-020 ─── T-021 ─── T-022
                  │              │
                  │              ├───────── T-050 ─── T-051 ─── T-052
                  │              │                                │
                  │              ├───────── T-060 ─── T-061 ◄────┘
                  │              │
                  │              ├───────── T-070 ─── T-071 ─── T-072
                  │              │
                  │              ├───────── T-080 ─── T-081
                  │              │
                  │              ├───────── T-110 ─── T-111
                  │              │
                  │              ├───────── T-120
                  │              │
                  │              └───────── T-130
                  │
                  ├─ T-030 ◄─── (usado por T-052, T-061, T-072, T-111)
                  │
                  ├─ T-031 ◄─── (usado por T-081)
                  │
                  └─ T-032 ─── T-090

```

---

## Critérios de Aceitação Gerais

Cada task está completa quando:

1. ✅ O código implementa o contrato definido em `contracts.md`
2. ✅ Testes básicos passam (happy path + erro comum)
3. ✅ Log é gerado corretamente
4. ✅ Erros não interrompem o pipeline (exceto fatais)
5. ✅ Idempotência: rodar 2x = mesmo resultado
6. ✅ Config é respeitado (sem hardcode de valores de negócio)
