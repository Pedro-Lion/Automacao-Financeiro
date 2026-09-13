# Data Model — Sistema de Automação de Processos Administrativos (SAPA)

> Este documento define todas as estruturas de dados do sistema: banco de dados, schemas de entrada/saída, e formatos de arquivo.

---

## 1. Banco de Dados (SQLite)

### 1.1 Diagrama ER

```
┌──────────────────────┐       ┌──────────────────────────┐
│    sync_state        │       │    processed_messages     │
├──────────────────────┤       ├──────────────────────────┤
│ group_id (PK)        │       │ message_id (PK)          │
│ group_name           │       │ group_id (FK)            │
│ group_type           │       │ sender_phone             │
│ last_message_id      │       │ sender_name              │
│ last_timestamp       │       │ timestamp                │
│ updated_at           │       │ message_type             │
└──────────────────────┘       │ content_text             │
                               │ has_media                │
┌──────────────────────┐       │ media_path               │
│    obras             │       │ feature_assigned         │
├──────────────────────┤       │ status                   │
│ id (PK)              │       │ confidence               │
│ name                 │       │ extracted_data (JSON)    │
│ short_name           │       │ processed_at             │
│ address              │       │ reviewed_at              │
│ group_id             │       │ review_notes             │
│ status (active/done) │       └──────────────────────────┘
│ created_at           │
│ onedrive_path        │       ┌──────────────────────────┐
└──────────────────────┘       │    notas_fiscais         │
                               ├──────────────────────────┤
┌──────────────────────┐       │ id (PK)                  │
│    gestores          │       │ message_id (FK)          │
├──────────────────────┤       │ obra_id (FK)             │
│ id (PK)              │       │ tipo (REEMBOLSO|MAT|FERR)│
│ name                 │       │ fornecedor               │
│ phone                │       │ cnpj                     │
│ home_address         │       │ data_compra              │
│ home_lat             │       │ valor_total              │
│ home_lng             │       │ itens (JSON array)       │
│ is_active            │       │ is_comprovante           │
└──────────────────────┘       │ nf_pendente              │
                               │ image_path               │
┌──────────────────────┐       │ onedrive_path            │
│    prestadores       │       │ confidence               │
├──────────────────────┤       │ created_at               │
│ id (PK)              │       └──────────────────────────┘
│ name                 │
│ phone                │       ┌──────────────────────────┐
│ type (diarista|empr) │       │    km_registros          │
│ daily_rate           │       ├──────────────────────────┤
│ contract_value       │       │ id (PK)                  │
│ obra_id (FK)         │       │ gestor_id (FK)           │
│ is_active            │       │ data                     │
└──────────────────────┘       │ trechos (JSON array)     │
                               │ km_total                 │
┌──────────────────────┐       │ valor_reembolso          │
│    frequencia        │       │ status (confirmed|pend)  │
├──────────────────────┤       │ message_id (FK)          │
│ id (PK)              │       │ created_at               │
│ prestador_id (FK)    │       └──────────────────────────┘
│ obra_id (FK)         │
│ data                 │       ┌──────────────────────────┐
│ presente (bool)      │       │    decisoes              │
│ message_id (FK)      │       ├──────────────────────────┤
│ confidence           │       │ id (PK)                  │
│ created_at           │       │ obra_id (FK)             │
└──────────────────────┘       │ message_id (FK)          │
                               │ texto_decisao            │
┌──────────────────────┐       │ categoria                │
│    estoque           │       │ data_decisao             │
├──────────────────────┤       │ participantes (JSON)     │
│ id (PK)              │       │ media_paths (JSON array) │
│ item_nome            │       │ superseded_by (FK self)  │
│ nf_id (FK)           │       │ confidence               │
│ fornecedor           │       │ created_at               │
│ valor_unitario       │       └──────────────────────────┘
│ quantidade           │
│ data_compra          │       ┌──────────────────────────┐
│ obra_compra          │       │    empreitadas           │
│ created_at           │       ├──────────────────────────┤
└──────────────────────┘       │ id (PK)                  │
                               │ prestador_id (FK)        │
┌──────────────────────┐       │ obra_id (FK)             │
│    execution_log     │       │ descricao                │
├──────────────────────┤       │ valor_total              │
│ id (PK)              │       │ parcelas (JSON array)    │
│ started_at           │       │ valor_pago               │
│ finished_at          │       │ status                   │
│ messages_read        │       │ created_at               │
│ messages_processed   │       │ updated_at               │
│ messages_errors      │       └──────────────────────────┘
│ messages_pending     │
│ features_run (JSON)  │       ┌──────────────────────────┐
│ files_written (JSON) │       │    pending_reviews       │
│ errors (JSON)        │       ├──────────────────────────┤
│ status               │       │ id (PK)                  │
└──────────────────────┘       │ message_id (FK)          │
                               │ feature                  │
                               │ question                 │
                               │ options (JSON)           │
                               │ answered (bool)          │
                               │ answer                   │
                               │ asked_at                 │
                               │ answered_at              │
                               └──────────────────────────┘

```

---

## 2. SQL Schema Completo

```sql
-- =============================================
-- SAPA Database Schema v1.0
-- =============================================

-- Estado de sincronização por grupo
CREATE TABLE IF NOT EXISTS sync_state (
    group_id TEXT PRIMARY KEY,
    group_name TEXT NOT NULL,
    group_type TEXT NOT NULL CHECK(group_type IN ('nf', 'obra', 'gestores', 'privado')),
    last_message_id TEXT,
    last_timestamp INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Obras cadastradas
CREATE TABLE IF NOT EXISTS obras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    short_name TEXT NOT NULL UNIQUE,
    address TEXT,
    latitude REAL,
    longitude REAL,
    group_id TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'paused')),
    onedrive_path TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Gestores
CREATE TABLE IF NOT EXISTS gestores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    home_address TEXT,
    home_lat REAL,
    home_lng REAL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Prestadores de serviço
CREATE TABLE IF NOT EXISTS prestadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('diarista', 'empreitada')),
    daily_rate REAL,
    obra_id INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (obra_id) REFERENCES obras(id)
);

-- Todas as mensagens processadas (controle de idempotência)
CREATE TABLE IF NOT EXISTS processed_messages (
    message_id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    sender_phone TEXT,
    sender_name TEXT,
    timestamp INTEGER NOT NULL,
    message_type TEXT CHECK(message_type IN ('text', 'image', 'video', 'document', 'audio', 'sticker')),
    content_text TEXT,
    has_media INTEGER DEFAULT 0,
    media_local_path TEXT,
    feature_assigned TEXT,
    status TEXT DEFAULT 'processed' CHECK(status IN ('processed', 'pending_review', 'error', 'ignored', 'unclassified')),
    confidence REAL,
    extracted_data TEXT,  -- JSON
    processed_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT,
    review_notes TEXT
);

-- Notas Fiscais extraídas
CREATE TABLE IF NOT EXISTS notas_fiscais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    obra_id INTEGER,
    tipo TEXT NOT NULL CHECK(tipo IN ('REEMBOLSO', 'MATERIAL_EMPRESA', 'FERRAMENTA')),
    fornecedor TEXT,
    cnpj TEXT,
    data_compra TEXT,
    valor_total REAL,
    itens TEXT,  -- JSON array: [{nome, qtd, valor_unit}]
    is_comprovante INTEGER DEFAULT 0,
    nf_pendente INTEGER DEFAULT 0,
    image_local_path TEXT,
    onedrive_path TEXT,
    confidence REAL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (message_id) REFERENCES processed_messages(message_id),
    FOREIGN KEY (obra_id) REFERENCES obras(id)
);

-- Registros de KM
CREATE TABLE IF NOT EXISTS km_registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gestor_id INTEGER NOT NULL,
    data TEXT NOT NULL,  -- YYYY-MM-DD
    trechos TEXT NOT NULL,  -- JSON: [{origem, destino, km, duracao_min}]
    km_total REAL NOT NULL,
    valor_reembolso REAL NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'rejected')),
    message_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (gestor_id) REFERENCES gestores(id),
    FOREIGN KEY (message_id) REFERENCES processed_messages(message_id)
);

-- Decisões de obra
CREATE TABLE IF NOT EXISTS decisoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    obra_id INTEGER NOT NULL,
    message_id TEXT NOT NULL,
    texto_decisao TEXT NOT NULL,
    categoria TEXT,  -- ex: material, design, fornecedor, prazo
    data_decisao TEXT NOT NULL,
    participantes TEXT,  -- JSON array de nomes
    media_paths TEXT,  -- JSON array de caminhos de fotos
    superseded_by INTEGER,  -- ID de decisão que substituiu esta
    confidence REAL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (obra_id) REFERENCES obras(id),
    FOREIGN KEY (message_id) REFERENCES processed_messages(message_id),
    FOREIGN KEY (superseded_by) REFERENCES decisoes(id)
);

-- Frequência de prestadores
CREATE TABLE IF NOT EXISTS frequencia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prestador_id INTEGER NOT NULL,
    obra_id INTEGER NOT NULL,
    data TEXT NOT NULL,  -- YYYY-MM-DD
    presente INTEGER DEFAULT 1,
    message_id TEXT,
    confidence REAL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (prestador_id) REFERENCES prestadores(id),
    FOREIGN KEY (obra_id) REFERENCES obras(id),
    UNIQUE(prestador_id, obra_id, data)
);

-- Estoque de ferramentas
CREATE TABLE IF NOT EXISTS estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_nome TEXT NOT NULL,
    nf_id INTEGER,
    fornecedor TEXT,
    valor_unitario REAL,
    quantidade INTEGER DEFAULT 1,
    data_compra TEXT,
    obra_compra TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (nf_id) REFERENCES notas_fiscais(id)
);

-- Empreitadas (contratos por entrega)
CREATE TABLE IF NOT EXISTS empreitadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prestador_id INTEGER NOT NULL,
    obra_id INTEGER NOT NULL,
    descricao TEXT NOT NULL,
    valor_total REAL NOT NULL,
    parcelas TEXT,  -- JSON: [{descricao, valor, status, data_pagamento}]
    valor_pago REAL DEFAULT 0,
    status TEXT DEFAULT 'em_andamento' CHECK(status IN ('em_andamento', 'concluida', 'cancelada')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    FOREIGN KEY (prestador_id) REFERENCES prestadores(id),
    FOREIGN KEY (obra_id) REFERENCES obras(id)
);

-- Fila de revisão humana
CREATE TABLE IF NOT EXISTS pending_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    feature TEXT NOT NULL,
    question TEXT NOT NULL,
    options TEXT,  -- JSON array (se aplicável)
    context_data TEXT,  -- JSON com dados parcialmente extraídos
    answered INTEGER DEFAULT 0,
    answer TEXT,
    asked_at TEXT DEFAULT (datetime('now')),
    answered_at TEXT,
    FOREIGN KEY (message_id) REFERENCES processed_messages(message_id)
);

-- Log de execuções
CREATE TABLE IF NOT EXISTS execution_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_seconds REAL,
    messages_read INTEGER DEFAULT 0,
    messages_processed INTEGER DEFAULT 0,
    messages_errors INTEGER DEFAULT 0,
    messages_pending INTEGER DEFAULT 0,
    features_run TEXT,  -- JSON array
    files_written TEXT,  -- JSON array de paths
    errors TEXT,  -- JSON array de {feature, message_id, error}
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed'))
);

-- Conciliação (resultados de matching)
CREATE TABLE IF NOT EXISTS conciliacao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mes_referencia TEXT NOT NULL,  -- YYYY-MM
    fatura_item_data TEXT,
    fatura_item_valor REAL,
    fatura_item_estabelecimento TEXT,
    nf_id INTEGER,  -- NULL se não encontrou match
    match_type TEXT CHECK(match_type IN ('matched', 'fatura_sem_nf', 'nf_sem_fatura', 'valor_divergente')),
    divergencia_valor REAL,
    observacao TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (nf_id) REFERENCES notas_fiscais(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_messages_group ON processed_messages(group_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_status ON processed_messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_feature ON processed_messages(feature_assigned);
CREATE INDEX IF NOT EXISTS idx_nf_obra ON notas_fiscais(obra_id);
CREATE INDEX IF NOT EXISTS idx_nf_tipo ON notas_fiscais(tipo);
CREATE INDEX IF NOT EXISTS idx_nf_data ON notas_fiscais(data_compra);
CREATE INDEX IF NOT EXISTS idx_km_gestor_data ON km_registros(gestor_id, data);
CREATE INDEX IF NOT EXISTS idx_freq_prestador ON frequencia(prestador_id, data);
CREATE INDEX IF NOT EXISTS idx_decisoes_obra ON decisoes(obra_id, data_decisao);

```

---

## 3. Schemas de Comunicação (Node ↔ Python)

### 3.1 OCR Request/Response

```json
// Request (Node → Python: ocr_processor.py)
{
  "action": "extract_nf",
  "image_path": "/tmp/media/nf_abc123.jpg",
  "context": {
    "legenda": "OBRA PEDRO SP REEMBOLSO",
    "sender": "Fulano",
    "timestamp": 1706745600
  }
}

// Response (Python → Node)
{
  "success": true,
  "confidence": 0.92,
  "data": {
    "fornecedor": "Leroy Merlin",
    "cnpj": "01.234.567/0001-89",
    "data_compra": "2025-01-31",
    "valor_total": 452.30,
    "itens": [
      {"nome": "Argamassa AC-III 20kg", "quantidade": 5, "valor_unitario": 45.00},
      {"nome": "Espaçador 3mm", "quantidade": 10, "valor_unitario": 22.73}
    ],
    "is_comprovante": false
  },
  "fields_uncertain": []  // campos com baixa confiança
}

```

### 3.2 Classification Request/Response

```json
// Request (Node → Python: nlp_classifier.py)
{
  "action": "classify_message",
  "text": "João e Pedro estavam na obra hoje. Carlos não veio.",
  "group_type": "obra",
  "sender": "Gestor1"
}

// Response
{
  "success": true,
  "classification": "frequencia",
  "confidence": 0.88,
  "extracted": {
    "presentes": ["João", "Pedro"],
    "ausentes": ["Carlos"]
  }
}

```

### 3.3 KM Calculation Request/Response

```json
// Request (Node → Python: km_calculator.py)
{
  "action": "calculate_route",
  "trechos": [
    {"origem": "Casa Fulano", "destino": "Obra Pedro SP"},
    {"origem": "Obra Pedro SP", "destino": "Leroy Merlin Centro SP"},
    {"origem": "Leroy Merlin Centro SP", "destino": "Casa Fulano"}
  ],
  "addresses": {
    "Casa Fulano": "Rua A, 10, São Paulo - SP",
    "Obra Pedro SP": "Rua X, 123, São Paulo - SP",
    "Leroy Merlin Centro SP": null  // Precisa geocoding
  }
}

// Response
{
  "success": true,
  "trechos": [
    {"origem": "Casa Fulano", "destino": "Obra Pedro SP", "km": 12.3, "duracao_min": 25},
    {"origem": "Obra Pedro SP", "destino": "Leroy Merlin Centro SP", "km": 5.7, "duracao_min": 12},
    {"origem": "Leroy Merlin Centro SP", "destino": "Casa Fulano", "km": 14.1, "duracao_min": 30}
  ],
  "km_total": 32.1,
  "geocoded": {
    "Leroy Merlin Centro SP": "Av. Marginal Tietê, 1500, São Paulo - SP"
  }
}

```

---

## 4. Formatos de Saída (OneDrive)

### 4.1 Planilha de Gastos por Obra (Excel)

**Arquivo:** `/{obra}/Financeiro/Gastos_{obra_short}.xlsx`

| Coluna | Tipo | Exemplo |
| --- | --- | --- |
| Data | date | 2025-01-31 |
| Fornecedor | string | Leroy Merlin |
| CNPJ | string | 01.234.567/0001-89 |
| Tipo | enum | REEMBOLSO / MATERIAL EMPRESA |
| Valor | currency | R$ 452,30 |
| Itens | string | Argamassa AC-III (5un), Espaçador 3mm (10un) |
| Documento | enum | NF / Comprovante |
| Observação | string | "NF pendente" (se comprovante) |
| Arquivo | string | Link/nome do arquivo no OneDrive |

**Abas:** Separar por mês (Jan/2025, Fev/2025...) + aba "Resumo" com totais.

### 4.2 Relatório Mensal de Reembolso

**Arquivo:** `/{obra}/Financeiro/Reembolso_{obra_short}_{mes}_{ano}.xlsx`

Contém APENAS itens `REEMBOLSO` daquela obra naquele mês.

| Coluna | Tipo |
| --- | --- |
| Data | date |
| Fornecedor | string |
| Valor | currency |
| Arquivo NF | string |

**Rodapé:** Somatória total do mês.

### 4.3 Planilha de KM

**Arquivo:** `/Empresa/KM/Reembolso_KM_{gestor}_{mes}_{ano}.xlsx`

| Coluna | Tipo |
| --- | --- |
| Data | date |
| Trecho | string (ex: "Casa → Obra FA") |
| KM | number |
| Valor | currency (KM × taxa) |

**Rodapé:** Total KM, Total R$.

### 4.4 ATA de Decisões (Word)

**Arquivo:** `/{obra}/Atas/ATA_{data_inicio}_a_{data_fim}_{obra_short}.docx`

**Estrutura:**

```
TÍTULO: Ata de Decisões — {Obra} — Período {data_inicio} a {data_fim}

Para cada decisão (cronológico):
  - Data/hora
  - Participantes envolvidos
  - Decisão tomada (texto)
  - Foto(s) relacionada(s) (se houver)
  - [Se houver alteração posterior]: "ATUALIZAÇÃO ({data}): {nova decisão}"

```

### 4.5 Estoque de Ferramentas

**Arquivo:** `/Empresa/Estoque/Estoque_Ferramentas.xlsx`

| Coluna | Tipo |
| --- | --- |
| Item | string |
| Quantidade | number |
| Fornecedor | string |
| Valor Unitário | currency |
| Data Compra | date |
| Obra que Comprou | string |

### 4.6 Frequência Semanal

**Arquivo:** `/{obra}/Frequencia/Freq_Semana{N}_{ano}_{obra_short}.xlsx`

| Prestador | Seg | Ter | Qua | Qui | Sex | Sáb | Total Dias | Diária | Total R$ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| João | ✓ | ✓ | - | ✓ | ✓ | - | 4 | R$200 | R$800 |

---

## 5. Formato de Mensagem WhatsApp (Entrada)

### 5.1 Estrutura de mensagem capturada

```json
{
  "id": "3EB0A8B2F5C1D3E4F5",
  "from": "5511999990001@c.us",
  "to": "GROUP_ID@g.us",
  "author": "5511999990001@c.us",
  "timestamp": 1706745600,
  "body": "OBRA PEDRO SP REEMBOLSO",
  "type": "chat",  // chat | image | video | document | ptt | audio
  "hasMedia": true,
  "mediaKey": "...",
  "mimetype": "image/jpeg",
  "caption": "OBRA PEDRO SP REEMBOLSO",  // Legenda da foto
  "quotedMsg": null,  // Mensagem citada (reply)
  "mentionedIds": [],
  "isForwarded": false
}

```

### 5.2 Padrões de Legenda de NF

```regex
# Padrão esperado:
/^(?:OBRA\s+)?(.+?)\s+(REEMBOLSO|MATERIAL\s*EMPRESA|FERRAMENTA)$/i

# Exemplos válidos:
"OBRA PEDRO SP REEMBOLSO"
"Pedro SP Reembolso"
"OBRA FA MATERIAL EMPRESA"
"JE FERRAMENTA"
"Obra Maria RJ reembolso"

```

### 5.3 Padrões de KM

```regex
# Padrões esperados no chat privado:
/^cheguei\s+(.+)$/i          → Registra chegada
/^fui\s+(?:na|no|em)?\s*(.+)$/i  → Registra ida a local
/^voltei\s+(.+)$/i           → Registra retorno
/^voltei\s+casa$/i           → Registra volta para casa

# Com data:
/^(?:dia\s+)?(\d{1,2}[\/\-]\d{1,2}):\s*(.+)$/i  → Registro retroativo
/^(?:segunda|terça|quarta|quinta|sexta|sábado):\s*(.+)$/i

```

