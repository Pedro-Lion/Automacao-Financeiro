# Plan — Sistema de Automação de Processos Administrativos (SAPA)

> Este documento define COMO o sistema será construído. Decisões de arquitetura, stack, e padrões técnicos.

---

## 1. Visão Arquitetural

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SAPA — Arquitetura                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐   │
│  │   ADAPTERS   │     │     CORE     │     │      ADAPTERS        │   │
│  │   (Input)    │────▶│   (Engine)   │────▶│      (Output)        │   │
│  └──────────────┘     └──────────────┘     └──────────────────────┘   │
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐   │
│  │ WhatsApp     │     │ Orchestrator │     │ OneDrive (local)     │   │
│  │ Adapter      │     │              │     │ Adapter              │   │
│  │              │     │ ┌──────────┐ │     │                      │   │
│  │ • Connect    │     │ │ Feature  │ │     │ • Write Excel        │   │
│  │ • Read msgs  │     │ │ Modules  │ │     │ • Write Docx         │   │
│  │ • Download   │     │ │          │ │     │ • Organize files     │   │
│  │   media      │     │ │ F01: NF  │ │     │ • Create folders     │   │
│  │ • Send msg   │     │ │ F02: ADM │ │     │                      │   │
│  │   (private)  │     │ │ F03: KM  │ │     ├──────────────────────┤   │
│  │              │     │ │ F04: ATA │ │     │ Google Calendar      │   │
│  ├──────────────┤     │ │ F05: MID │ │     │ Adapter (futuro)     │   │
│  │ File Upload  │     │ │ F06: EST │ │     │                      │   │
│  │ Adapter      │     │ │ F07: FRQ │ │     └──────────────────────┘   │
│  │              │     │ │ F08: TER │ │                                 │
│  │ • Fatura     │     │ │ F09: AGD │ │     ┌──────────────────────┐   │
│  │   cartão     │     │ └──────────┘ │     │ AI Adapter           │   │
│  │   (Excel)    │     │              │     │                      │   │
│  └──────────────┘     │ ┌──────────┐ │     │ • Gemini Flash (now) │   │
│                        │ │ Message  │ │     │ • Claude/GPT (fut.)  │   │
│                        │ │ Classifier│ │     │ • OCR                │   │
│                        │ └──────────┘ │     │ • NLP                │   │
│                        │              │     │ • Classification     │   │
│                        │ ┌──────────┐ │     └──────────────────────┘   │
│                        │ │ State    │ │                                 │
│                        │ │ Manager  │ │     ┌──────────────────────┐   │
│                        │ │ (SQLite) │ │     │ Route Adapter        │   │
│                        │ └──────────┘ │     │                      │   │
│                        └──────────────┘     │ • OpenRouteService   │   │
│                                             │ • (Google Maps fut.) │   │
│                                             └──────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    CONFIG (config.yaml)                          │   │
│  │  • Obras ativas (nome, sigla, endereço)                         │   │
│  │  • Gestores (nome, telefone, endereço casa)                     │   │
│  │  • Prestadores (nome, diária, tipo)                             │   │
│  │  • Parâmetros (taxa KM, threshold IA, paths OneDrive)           │   │
│  │  • Grupos WhatsApp (ID → tipo: NF/obra/geral)                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    INTERFACE (Runner)                            │   │
│  │  • CLI: `node sapa.js run`                                      │   │
│  │  • GUI: Electron/Streamlit (botão "Processar")                  │   │
│  │  • Scheduler: Windows Task Scheduler (cron-like)                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| **Runtime** | Node.js 20+ | whatsapp-web.js é Node.js; manter linguagem única para entrada |
| **Lógica de negócio** | Python 3.11+ | Ecossistema superior para IA, pandas, openpyxl, python-docx |
| **Comunicação Node↔Python** | Subprocess com JSON via stdin/stdout | Simples, sem overhead de server |
| **WhatsApp** | whatsapp-web.js | Lib mais madura para WhatsApp Web automation |
| **IA** | Google Gemini 1.5 Flash (API gratuita) | OCR + NLP em português, vision, grátis |
| **OCR fallback** | Tesseract (local, via pytesseract) | Para quando Gemini estiver indisponível |
| **Banco de dados** | SQLite (via better-sqlite3 ou Python sqlite3) | Zero config, arquivo único, portável |
| **Excel** | openpyxl (Python) | Leitura e escrita de .xlsx com formatação |
| **Word** | python-docx | Geração de ATAs em .docx |
| **Rotas/KM** | OpenRouteService API | Grátis, 2.000 req/dia, suficiente |
| **Config** | YAML (config.yaml) | Legível, editável por humanos |
| **Interface** | CLI + .bat shortcut (MVP); Electron (futuro) | Mínimo viável agora |
| **Agendamento** | Windows Task Scheduler | Nativo, sem dependência |

---

## 3. Estrutura de Diretórios do Projeto

```
sapa/
├── package.json                 # Dependências Node.js
├── requirements.txt             # Dependências Python
├── config.yaml                  # Configuração de negócio (editável)
├── config.schema.json           # Schema de validação do config
│
├── src/
│   ├── index.js                 # Entry point — orchestrator
│   ├── adapters/
│   │   ├── whatsapp/
│   │   │   ├── client.js        # Conexão e sessão WhatsApp
│   │   │   ├── reader.js        # Leitura de mensagens dos grupos
│   │   │   ├── sender.js        # Envio de mensagens (privado)
│   │   │   └── media.js         # Download de mídias
│   │   ├── onedrive/
│   │   │   ├── writer.js        # Escrita de arquivos na pasta OneDrive
│   │   │   └── organizer.js     # Organização de pastas
│   │   ├── ai/
│   │   │   ├── provider.js      # Interface abstrata de AI
│   │   │   ├── gemini.js        # Implementação Gemini Flash
│   │   │   └── tesseract.js     # Fallback OCR local
│   │   ├── routes/
│   │   │   ├── provider.js      # Interface abstrata de rotas
│   │   │   └── openroute.js     # Implementação OpenRouteService
│   │   └── calendar/
│   │       └── google.js        # (futuro) Google Calendar
│   │
│   ├── core/
│   │   ├── orchestrator.js      # Pipeline principal
│   │   ├── classifier.js        # Classifica mensagens por tipo/módulo
│   │   ├── state.js             # Gerenciamento de estado (SQLite)
│   │   └── logger.js            # Sistema de logging
│   │
│   ├── features/
│   │   ├── base-feature.js      # Classe base para todos os módulos
│   │   ├── f01-notas-fiscais/
│   │   │   ├── index.js         # Entry point do módulo
│   │   │   ├── extractor.js     # Extração de dados da NF (IA)
│   │   │   ├── associator.js    # Associação legenda↔foto
│   │   │   └── prompts/         # Prompts de IA para este módulo
│   │   │       ├── ocr-nf.txt
│   │   │       └── classify-status.txt
│   │   ├── f02-conciliacao/
│   │   │   ├── index.js
│   │   │   └── matcher.js       # Algoritmo de matching fatura↔NF
│   │   ├── f03-quilometragem/
│   │   │   ├── index.js
│   │   │   ├── parser.js        # Parser de mensagens de trajeto
│   │   │   └── calculator.js    # Cálculo de distâncias
│   │   ├── f04-atas/
│   │   │   ├── index.js
│   │   │   ├── decision-detector.js
│   │   │   └── ata-generator.js
│   │   ├── f05-midias/
│   │   │   └── index.js
│   │   ├── f06-estoque/
│   │   │   └── index.js
│   │   ├── f07-frequencia/
│   │   │   └── index.js
│   │   ├── f08-terceirizados/
│   │   │   └── index.js
│   │   └── f09-agendamento/
│   │       └── index.js
│   │
│   └── python/                  # Scripts Python chamados pelo Node
│       ├── ocr_processor.py     # OCR com Gemini/Tesseract
│       ├── excel_writer.py      # Geração/atualização de planilhas
│       ├── docx_writer.py       # Geração de documentos Word
│       ├── nlp_classifier.py    # Classificação de texto
│       └── km_calculator.py     # Cálculo de rotas
│
├── data/
│   ├── sapa.db                  # SQLite — estado do sistema
│   └── session/                 # Sessão WhatsApp (auth)
│
├── logs/
│   └── YYYY-MM-DD_HH-MM.log    # Log de cada execução
│
├── templates/
│   ├── planilha_gastos.xlsx     # Template da planilha de gastos
│   ├── relatorio_reembolso.xlsx # Template do relatório de reembolso
│   ├── ata_template.docx        # Template da ATA
│   └── frequencia.xlsx          # Template de frequência
│
├── scripts/
│   ├── setup.bat                # Instalação inicial (Windows)
│   ├── run.bat                  # Atalho de execução (duplo-clique)
│   └── schedule.bat             # Registra no Task Scheduler
│
└── tests/
    ├── fixtures/                # Imagens de NF de teste, mensagens mock
    └── ...
```

---

## 4. Padrões de Design

### 4.1 Adapter Pattern (Substituibilidade)

Cada dependência externa é encapsulada em um adapter com interface fixa:

```javascript
// src/adapters/ai/provider.js
class AIProvider {
  async analyzeImage(imageBuffer, prompt) { throw new Error('Not implemented') }
  async classifyText(text, categories) { throw new Error('Not implemented') }
  async extractStructured(text, schema) { throw new Error('Not implemented') }
}
```

```javascript
// src/adapters/ai/gemini.js
class GeminiProvider extends AIProvider {
  async analyzeImage(imageBuffer, prompt) { /* Gemini Flash Vision */ }
  // ...
}
```

Para trocar de IA no futuro, basta criar novo adapter (ex.: `claude.js`) e trocar no `config.yaml`.

### 4.2 Feature Module Pattern

Cada feature implementa a mesma interface:

```javascript
// src/features/base-feature.js
class BaseFeature {
  constructor(config, adapters) { /* ... */ }
  
  // Filtra mensagens relevantes para este módulo
  filterMessages(messages) { throw new Error('Not implemented') }
  
  // Processa as mensagens filtradas
  async process(messages) { throw new Error('Not implemented') }
  
  // Gera/atualiza outputs no OneDrive
  async generateOutputs() { throw new Error('Not implemented') }
}
```

### 4.3 Pipeline de Execução

```
1. CONNECT     → WhatsApp adapter conecta (ou reconecta sessão)
2. FETCH       → Lê mensagens novas (desde último processamento)
3. CLASSIFY    → Classifica cada mensagem (qual módulo deve processar)
4. DISPATCH    → Distribui mensagens para os feature modules ativos
5. PROCESS     → Cada módulo processa suas mensagens (IA, cálculos)
6. CONFIRM     → Itens com baixa confiança → fila de confirmação
7. OUTPUT      → Módulos geram/atualizam arquivos no OneDrive
8. LOG         → Gera relatório de execução
9. DISCONNECT  → (opcional) Desconecta WhatsApp
```

### 4.4 State Management (Idempotência)

```sql
-- Tabela principal de controle
CREATE TABLE processed_messages (
  message_id TEXT PRIMARY KEY,    -- ID único do WhatsApp
  group_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  feature TEXT,                   -- Qual módulo processou (f01, f02...)
  status TEXT DEFAULT 'processed', -- processed | pending_review | error
  confidence REAL,                -- Score de confiança da IA (0-1)
  processed_at TEXT,
  data_json TEXT                  -- Dados extraídos (JSON)
);

-- Cursor de processamento
CREATE TABLE sync_state (
  group_id TEXT PRIMARY KEY,
  last_message_id TEXT,
  last_timestamp INTEGER
);
```

---

## 5. Configuração (config.yaml)

```yaml
# config.yaml — Configuração do SAPA

system:
  name: "SAPA"
  version: "1.0.0"
  language: "pt-BR"
  log_level: "info"  # debug | info | warn | error

ai:
  provider: "gemini"  # gemini | claude | openai | tesseract_only
  gemini:
    api_key: "${GEMINI_API_KEY}"  # via env var
    model: "gemini-1.5-flash"
    confidence_threshold: 0.80  # Abaixo disso → pending_review
  fallback: "tesseract"

whatsapp:
  session_path: "./data/session"
  phone_number: "+5511999999999"  # Número dedicado do sistema
  groups:
    notas_fiscais: "GROUP_ID_NF"  # ID do grupo de NFs
    gestores_geral: "GROUP_ID_GESTORES"
    obras:
      - name: "Obra Pedro São Paulo"
        short: "PEDRO SP"
        group_id: "GROUP_ID_PEDRO"
        address: "Rua X, 123, São Paulo - SP"
      - name: "Obra Maria RJ"
        short: "MARIA RJ"
        group_id: "GROUP_ID_MARIA"
        address: "Av Y, 456, Rio de Janeiro - RJ"

onedrive:
  base_path: "C:/Users/USUARIO/OneDrive/Empresa"  # Pasta raiz no OneDrive
  structure:
    obras: "/{obra_name}/"
    nfs_reembolso: "/{obra_name}/NFs/Reembolso/"
    nfs_material: "/{obra_name}/NFs/Material_Empresa/"
    financeiro: "/{obra_name}/Financeiro/"
    atas: "/{obra_name}/Atas/"
    fotos: "/{obra_name}/Fotos/{date}/"
    frequencia: "/{obra_name}/Frequencia/"
    terceirizados: "/{obra_name}/Terceirizados/"
    empresa_financeiro: "/Empresa/Financeiro/"
    empresa_estoque: "/Empresa/Estoque/"
    empresa_km: "/Empresa/KM/"

km:
  rate_per_km: 1.20  # R$/km
  route_provider: "openroute"  # openroute | google
  openroute:
    api_key: "${OPENROUTE_API_KEY}"

gestores:
  - name: "Fulano"
    phone: "+5511999990001"
    home_address: "Rua A, 10, São Paulo - SP"
  - name: "Ciclano"
    phone: "+5511999990002"
    home_address: "Rua B, 20, São Paulo - SP"

prestadores:
  - name: "João Pedreiro"
    phone: "+5511988880001"
    type: "diarista"
    daily_rate: 200.00
  - name: "Elétrica Silva"
    phone: "+5511988880002"
    type: "empreitada"

features:
  f01_notas_fiscais: true
  f02_conciliacao: true
  f03_quilometragem: true
  f04_atas: true
  f05_midias: true
  f06_estoque: true
  f07_frequencia: true
  f08_terceirizados: true
  f09_agendamento: false  # Desativado até implementação

schedule:
  enabled: true
  time: "20:00"  # Executa todo dia às 20h
  days: "mon,tue,wed,thu,fri"  # Somente dias úteis
```

---

## 6. Comunicação Node.js ↔ Python

O Node.js é o orquestrador principal (WhatsApp + flow control). Quando precisa de processamento pesado (IA, Excel, Docx), chama Python via subprocess:

```javascript
// src/core/orchestrator.js
const { execPython } = require('./python-bridge');

// Chamada genérica
const result = await execPython('ocr_processor.py', {
  image_path: '/tmp/nf_001.jpg',
  prompt: 'extract_nf_data'
});
// result = { fornecedor: "Leroy Merlin", valor: 450.00, ... }
```

```javascript
// src/core/python-bridge.js
const { spawn } = require('child_process');

function execPython(script, input) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', [`src/python/${script}`]);
    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
    
    let output = '';
    proc.stdout.on('data', d => output += d);
    proc.on('close', code => {
      if (code === 0) resolve(JSON.parse(output));
      else reject(new Error(`Python exited with code ${code}`));
    });
  });
}
```

---

## 7. Fluxo de Instalação

```bash
# 1. Instalar Node.js 20+ e Python 3.11+
# 2. Clonar/extrair projeto
# 3. Instalar dependências
npm install
pip install -r requirements.txt

# 4. Configurar
cp config.example.yaml config.yaml
# Editar config.yaml com dados reais

# 5. Primeira execução (conecta WhatsApp via QR)
node src/index.js setup

# 6. Execução normal
node src/index.js run

# 7. (Opcional) Registrar no Task Scheduler
scripts/schedule.bat
```

---

## 8. Decisões Técnicas Registradas

| Decisão | Alternativa rejeitada | Motivo |
|---------|----------------------|--------|
| Node.js para orquestração | Python puro | whatsapp-web.js é Node; evita bridge complexa para a parte mais crítica (conexão WA) |
| Python para processamento | Node.js | Ecossistema de IA e manipulação de Office muito superior em Python |
| SQLite para estado | JSON files | Queries, concorrência, integridade referencial |
| YAML para config | JSON | Mais legível para não-devs, suporta comentários |
| Pasta local OneDrive | Microsoft Graph API | Zero custo, zero complexidade; sync é automático |
| Subprocess JSON | HTTP local / gRPC | Simplicidade; não justifica overhead de server para volume baixo |
| whatsapp-web.js | Baileys / Evolution API | Mais maduro, melhor documentado, API mais estável |

---

## 9. Preparação para Upgrades Futuros

| Upgrade | O que mudar | Impacto no código |
|---------|-------------|-------------------|
| Gemini → Claude/GPT-4o | Criar `claude.js` adapter, mudar `config.yaml` | Nenhum no core |
| Local → Cloud server | Docker compose, mudar paths | Mínimo (paths em config) |
| OneDrive local → Graph API | Novo `onedrive-api.js` adapter | Nenhum no core |
| WhatsApp não-oficial → oficial | Novo `whatsapp-official.js` adapter | Nenhum no core |
| Windows → Linux/Mac | Ajustar `scripts/`, paths no config | Nenhum no core (Node é cross-platform) |
| KM manual → GPS app | Novo input adapter para GPS data | Nenhum no cálculo de KM |
| Upload fatura → API banco | Novo input adapter | Nenhum na conciliação |
| Mais obras (10+) | Adicionar no config.yaml | Zero código |
| Electron GUI | Nova camada de UI chamando o mesmo CLI | Nenhum no core |
