# Contracts — Sistema de Automação de Processos Administrativos (SAPA)

> Este documento define as interfaces (contratos) entre os componentes do sistema. Qualquer módulo pode ser substituído desde que respeite seu contrato.

---

## 1. Adapter Contracts

### 1.1 WhatsApp Adapter (Input)

```typescript
interface WhatsAppAdapter {
  /**
   * Conecta ao WhatsApp (inicia sessão ou reconecta existente)
   * Primeira execução: exibe QR code para scan
   * Execuções seguintes: reconecta automaticamente
   */
  connect(): Promise<void>;
  
  /**
   * Verifica se está conectado e autenticado
   */
  isConnected(): boolean;
  
  /**
   * Busca mensagens de um grupo desde um timestamp
   * @param groupId - ID do grupo WhatsApp
   * @param sinceTimestamp - Unix timestamp (seconds)
   * @returns Array de mensagens ordenadas cronologicamente
   */
  getMessages(groupId: string, sinceTimestamp: number): Promise<Message[]>;
  
  /**
   * Busca mensagens de chat privado com um contato
   * @param contactPhone - Número do contato (ex: "5511999990001")
   * @param sinceTimestamp - Unix timestamp
   */
  getPrivateMessages(contactPhone: string, sinceTimestamp: number): Promise<Message[]>;
  
  /**
   * Baixa mídia de uma mensagem
   * @param message - Objeto mensagem com hasMedia=true
   * @returns Path local onde o arquivo foi salvo
   */
  downloadMedia(message: Message): Promise<string>;
  
  /**
   * Envia mensagem de texto para um contato (chat privado)
   * Usado para confirmações e resumos
   */
  sendMessage(contactPhone: string, text: string): Promise<void>;
  
  /**
   * Desconecta a sessão
   */
  disconnect(): Promise<void>;
}

interface Message {
  id: string;
  from: string;          // phone@c.us ou phone@g.us
  author: string;        // phone@c.us (quem enviou no grupo)
  timestamp: number;     // Unix seconds
  body: string;          // Texto da mensagem
  type: 'chat' | 'image' | 'video' | 'document' | 'audio' | 'ptt' | 'sticker';
  hasMedia: boolean;
  caption: string | null; // Legenda de mídia
  quotedMsg: Message | null;
  isForwarded: boolean;
  // Metadados de mídia (quando hasMedia=true)
  mimetype?: string;
  filename?: string;
}

### 1.1.1 Evolution API provider notes

The Evolution provider MUST implement the same canonical message shape above.
Its transport-specific payload is isolated in the adapter:

- authentication uses the `apikey` HTTP header;
- a WhatsApp Web JID is represented as `phone@c.us` or `group@g.us`;
- connection states are normalized to `initializing`, `awaiting_qr`,
  `ready`, `disconnected` and `error`;
- `getChats()` returns `{ id: string, name: string, isGroup: boolean }`;
- `getChatById()` may expose the compatibility shape
  `{ id: { _serialized: string }, name, isGroup }`;
- webhook messages are deduplicated by `instance_name + message_id`;
- adapter diagnostics MUST omit API keys, webhook secrets, QR contents and
  binary media.

```

### 1.2 AI Adapter

```typescript
interface AIAdapter {
  /**
   * Analisa uma imagem e extrai dados estruturados
   * @param imagePath - Caminho local da imagem
   * @param prompt - Instrução de extração
   * @param schema - Schema esperado do output (JSON Schema)
   * @returns Dados extraídos + score de confiança
   */
  analyzeImage(imagePath: string, prompt: string, schema: object): Promise<AIResult>;
  
  /**
   * Classifica texto em categorias predefinidas
   * @param text - Texto a classificar
   * @param categories - Lista de categorias possíveis com descrições
   * @returns Categoria escolhida + confiança
   */
  classifyText(text: string, categories: Category[]): Promise<ClassificationResult>;
  
  /**
   * Extrai informação estruturada de texto livre
   * @param text - Texto fonte
   * @param prompt - O que extrair
   * @param schema - Schema do output esperado
   */
  extractFromText(text: string, prompt: string, schema: object): Promise<AIResult>;
  
  /**
   * Gera texto (para ATAs, resumos, etc.)
   * @param prompt - Instrução de geração
   * @param context - Dados de contexto
   */
  generateText(prompt: string, context: object): Promise<string>;
}

interface AIResult {
  success: boolean;
  confidence: number;      // 0.0 a 1.0
  data: object;            // Dados extraídos conforme schema
  fieldsUncertain: string[]; // Campos com baixa confiança individual
  rawResponse?: string;    // Resposta crua da IA (para debug)
}

interface ClassificationResult {
  success: boolean;
  category: string;
  confidence: number;
  reasoning?: string;       // Explicação da classificação
}

interface Category {
  name: string;
  description: string;
  examples: string[];
}

```

### 1.3 Storage Adapter (Output — OneDrive)

```typescript
interface StorageAdapter {
  /**
   * Escreve/atualiza um arquivo Excel
   * @param relativePath - Caminho relativo à base do OneDrive (ex: "/Obra Pedro/Financeiro/Gastos.xlsx")
   * @param data - Dados para escrever
   * @param options - Opções de escrita (append, replace sheet, etc.)
   */
  writeExcel(relativePath: string, data: ExcelData, options?: WriteOptions): Promise<string>;
  
  /**
   * Lê um arquivo Excel existente
   * @param relativePath - Caminho relativo
   * @returns Dados do Excel
   */
  readExcel(relativePath: string): Promise<ExcelData>;
  
  /**
   * Escreve um documento Word
   */
  writeDocx(relativePath: string, content: DocxContent): Promise<string>;
  
  /**
   * Copia/move um arquivo (ex: foto de NF para pasta da obra)
   * @param sourcePath - Path absoluto local
   * @param destRelativePath - Destino relativo ao OneDrive base
   */
  saveFile(sourcePath: string, destRelativePath: string): Promise<string>;
  
  /**
   * Cria pasta se não existir
   */
  ensureFolder(relativePath: string): Promise<void>;
  
  /**
   * Lista arquivos em uma pasta
   */
  listFiles(relativePath: string): Promise<string[]>;
  
  /**
   * Verifica se arquivo existe
   */
  fileExists(relativePath: string): boolean;
}

interface ExcelData {
  sheets: {
    name: string;
    headers: string[];
    rows: (string | number | Date | null)[][];
  }[];
}

interface WriteOptions {
  mode: 'overwrite' | 'append' | 'update_sheet';
  sheetName?: string;   // Para append/update em aba específica
  startRow?: number;    // Para append
}

interface DocxContent {
  title: string;
  sections: {
    heading: string;
    level: 1 | 2 | 3;
    paragraphs: (TextParagraph | ImageParagraph | TableParagraph)[];
  }[];
}

```

### 1.4 Route Adapter (KM Calculation)

```typescript
interface RouteAdapter {
  /**
   * Calcula distância entre dois pontos
   * @param origin - Endereço ou coordenadas
   * @param destination - Endereço ou coordenadas
   * @returns Distância em km e duração em minutos
   */
  calculateDistance(origin: Location, destination: Location): Promise<RouteResult>;
  
  /**
   * Geocodifica um endereço textual
   * @param address - Endereço em texto livre
   * @returns Coordenadas
   */
  geocode(address: string): Promise<Coordinates>;
}

interface Location {
  address?: string;
  lat?: number;
  lng?: number;
}

interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  origin: Coordinates;
  destination: Coordinates;
}

interface Coordinates {
  lat: number;
  lng: number;
  resolvedAddress?: string;
}

```

---

## 2. Feature Module Contract

Todos os feature modules implementam esta interface:

```typescript
interface FeatureModule {
  /** Nome único do módulo (ex: 'f01_notas_fiscais') */
  readonly name: string;
  
  /** Se o módulo está ativo (controlado por config.yaml) */
  readonly enabled: boolean;
  
  /** Tipos de grupo que este módulo processa */
  readonly sourceGroupTypes: ('nf' | 'obra' | 'gestores' | 'privado')[];
  
  /**
   * Inicializa o módulo (carrega estado, prepara recursos)
   * Chamado uma vez no início da execução
   */
  initialize(config: Config, adapters: Adapters): Promise<void>;
  
  /**
   * Filtra mensagens relevantes para este módulo
   * Recebe todas as mensagens novas de um grupo compatível
   * Retorna apenas as que este módulo deve processar
   */
  filterMessages(messages: Message[], groupType: string): Message[];
  
  /**
   * Processa um batch de mensagens
   * Extrai dados, chama IA, registra no DB
   * @returns Resultados do processamento
   */
  process(messages: Message[]): Promise<ProcessResult>;
  
  /**
   * Gera/atualiza outputs (planilhas, docs, arquivos)
   * Chamado após process() de todos os módulos
   */
  generateOutputs(): Promise<OutputResult>;
  
  /**
   * Retorna items pendentes de revisão humana
   */
  getPendingReviews(): Promise<PendingReview[]>;
  
  /**
   * Processa resposta de revisão humana
   */
  handleReview(reviewId: number, answer: string): Promise<void>;
}

interface ProcessResult {
  processed: number;
  errors: number;
  pendingReview: number;
  items: ProcessedItem[];
}

interface ProcessedItem {
  messageId: string;
  status: 'processed' | 'pending_review' | 'error';
  confidence: number;
  data: object;
  error?: string;
}

interface OutputResult {
  filesWritten: string[];   // Paths dos arquivos gerados/atualizados
  filesUpdated: string[];
  errors: string[];
}

interface PendingReview {
  id: number;
  feature: string;
  question: string;         // Pergunta para o gestor
  options?: string[];       // Opções (se aplicável)
  context: object;          // Dados parciais para contexto
}

```

---

## 3. Orchestrator Contract

```typescript
interface Orchestrator {
  /**
   * Executa o pipeline completo
   * 1. Conecta WhatsApp
   * 2. Busca mensagens novas
   * 3. Classifica e distribui para features
   * 4. Processa
   * 5. Gera outputs
   * 6. Lida com pending reviews
   * 7. Gera log
   */
  run(): Promise<ExecutionReport>;
  
  /**
   * Executa apenas um módulo específico (para debug/reprocessamento)
   */
  runFeature(featureName: string): Promise<ExecutionReport>;
  
  /**
   * Reprocessa mensagens com status 'pending_review' ou 'error'
   */
  reprocess(): Promise<ExecutionReport>;
  
  /**
   * Setup inicial (primeira execução — conecta WhatsApp, cria DB)
   */
  setup(): Promise<void>;
}

interface ExecutionReport {
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  messagesRead: number;
  messagesProcessed: number;
  messagesErrors: number;
  messagesPendingReview: number;
  featuresRun: string[];
  filesWritten: string[];
  errors: { feature: string; messageId: string; error: string }[];
  summary: string;  // Resumo legível para envio ao gestor
}

```

---

## 4. Configuration Contract

```typescript
interface Config {
  system: {
    name: string;
    version: string;
    language: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  
  ai: {
    provider: 'gemini' | 'claude' | 'openai' | 'tesseract_only';
    confidenceThreshold: number;  // 0.0 - 1.0
    providerConfig: object;       // Específico do provider
    fallback?: string;
  };
  
  whatsapp: {
    sessionPath: string;
    phoneNumber: string;
    groups: {
      notasFiscais: string;
      gestoresGeral: string;
      obras: ObraGroup[];
    };
  };
  
  onedrive: {
    basePath: string;            // Pasta raiz local do OneDrive
    structure: Record<string, string>; // Templates de path
  };
  
  km: {
    ratePerKm: number;
    routeProvider: 'openroute' | 'google';
    providerConfig: object;
  };
  
  gestores: Gestor[];
  prestadores: Prestador[];
  
  features: Record<string, boolean>;  // Feature flags
  
  schedule: {
    enabled: boolean;
    time: string;
    days: string;
  };
}

```

---

## 5. Message Classification Contract

O classificador central determina para qual feature cada mensagem vai:

```typescript
interface MessageClassifier {
  /**
   * Classifica uma mensagem e determina qual feature deve processá-la
   * Uma mensagem pode ser atribuída a múltiplas features (ex: foto de obra → mídias + ata)
   * 
   * @param message - Mensagem a classificar
   * @param groupType - Tipo do grupo de origem
   * @returns Array de features e confiança
   */
  classify(message: Message, groupType: string): Promise<Classification[]>;
}

interface Classification {
  feature: string;        // Nome do módulo (ex: 'f01_notas_fiscais')
  confidence: number;     // 0.0 - 1.0
  reason: string;         // Justificativa (para log)
}

```

**Regras de classificação (prioridade):**

| Condição | Feature | Confiança |
| --- | --- | --- |
| Grupo NF + imagem + legenda com padrão NF | f01_notas_fiscais | Alta |
| Grupo NF + imagem sem legenda | f01_notas_fiscais (pending) | Média |
| Chat privado + padrão KM ("cheguei", "fui", "voltei") | f03_quilometragem | Alta |
| Grupo obra + padrão de decisão | f04_atas | Alta |
| Grupo obra + imagem/vídeo | f05_midias | Alta |
| Grupo obra + padrão de frequência | f07_frequencia | Média-Alta |
| Grupo obra + menção a data/horário futuro | f09_agendamento | Média |
| Nenhum padrão identificado | ignored | — |

---

## 6. Error Handling Contract

```typescript
interface ErrorHandler {
  /**
   * Registra erro não-fatal (processamento continua)
   * Ex: OCR falhou para uma NF específica
   */
  logError(feature: string, messageId: string, error: Error, context?: object): void;
  
  /**
   * Registra erro fatal (execução para)
   * Ex: WhatsApp desconectou, DB corrompido
   */
  logFatal(error: Error, context?: object): void;
  
  /**
   * Retorna erros da última execução
   */
  getLastErrors(): ErrorEntry[];
}

// Erros NUNCA interrompem o pipeline (exceto fatais)
// Se um item falha, é marcado como 'error' e o próximo é processado

```
