# Design — Integração da Evolution API

## Decisão principal

Adicionar um adaptador `evolution` atrás do contrato WhatsApp existente. O
SAPA continuará sendo o dono do ciclo de execução, classificação, estado de
processamento e gravação no OneDrive. A Evolution será responsável pela sessão
WhatsApp, transporte, consulta de recursos e emissão de eventos.

```text
┌──────────────────────────────┐
│ SAPA                         │
│                              │
│ Orchestrator                 │
│   ├─ EvolutionClient         │──── REST ────┐
│   ├─ EvolutionReader         │              │
│   ├─ EvolutionMedia          │              ▼
│   └─ EvolutionWebhookInbox   │       ┌──────────────┐
│                              │       │ Evolution API │
│ State SQLite ◄── inbox       │◄──────│ Baileys       │
└──────────────────────────────┘ webhook└──────┬───────┘
                                               │
                                         WhatsApp
```

## Componentes previstos

### `EvolutionClient`

Responsabilidades:

- executar requisições HTTP com `apikey`;
- validar respostas e transformar erros em mensagens operacionais;
- verificar disponibilidade da API;
- criar ou localizar a instância configurada;
- solicitar/conferir QR Code;
- consultar `connectionState`;
- listar grupos e localizar grupo por ID;
- consultar mensagens;
- enviar texto para chat privado;
- expor diagnóstico sem revelar API key.

O cliente deve ser idempotente ao iniciar. Não deve recriar uma instância
existente nem considerar uma chamada HTTP bem-sucedida como conexão WhatsApp
confirmada. A confirmação deve depender do estado retornado pela Evolution ou
de evento `CONNECTION_UPDATE`.

### `EvolutionReader`

Responsabilidades:

- consultar mensagens quando o modo de polling estiver habilitado;
- normalizar payloads Baileys para o contrato `Message` do SAPA;
- converter timestamps para Unix seconds;
- ignorar mensagens próprias;
- identificar grupo por `key.remoteJid`;
- preservar `messageId`, remetente, legenda, tipo, mimetype e filename;
- ordenar mensagens cronologicamente;
- aplicar paginação limitada e cursor.

O leitor deve tolerar os tipos comuns de conteúdo:

```text
conversation
extendedTextMessage
imageMessage
documentMessage
videoMessage
audioMessage
stickerMessage
```

Payloads desconhecidos devem ser preservados como mensagem não classificada ou
rejeitados com erro explícito, conforme o contrato vigente; nunca devem ser
silenciosamente tratados como texto vazio.

### `EvolutionMedia`

O adaptador deve fornecer uma operação compatível com
`downloadMedia(message)`. O fluxo recomendado é:

1. receber o evento ou mensagem;
2. validar que existe mídia;
3. solicitar o conteúdo à Evolution;
4. aplicar timeout;
5. validar base64, mimetype e tamanho;
6. salvar em `data/tmp/<message-id>.<ext>`;
7. retornar o caminho local.

O webhook não deve habilitar base64 global por padrão, pois isso aumenta o
tráfego e o tamanho dos eventos. Uma configuração explícita poderá habilitar
base64 em ambiente de teste ou quando o endpoint de download não estiver
disponível.

### `EvolutionWebhookInbox`

O webhook será uma camada de entrada local, não um substituto obrigatório do
orquestrador atual. Para manter compatibilidade com o modo agendado:

- eventos serão autenticados por segredo configurado;
- o payload será validado antes de persistir;
- mensagens serão deduplicadas por `instance + messageId`;
- somente mensagens de instâncias configuradas serão aceitas;
- `CONNECTION_UPDATE` atualizará o estado operacional;
- `QRCODE_UPDATED` atualizará o QR temporário;
- `MESSAGES_UPSERT` será registrado no inbox;
- o processamento do inbox poderá ser consumido pelo reader no próximo ciclo.

Se o projeto ainda não possuir servidor HTTP, a primeira implementação pode
separar o handler puro do transporte. O handler deve receber
`(headers, body)` e retornar status/payload, permitindo conectá-lo depois ao
servidor local sem acoplar a lógica de validação a um framework.

### Seleção de provedor

`src/index.js` deve selecionar:

```text
evolution      -> EvolutionClient + EvolutionReader
waha           -> WahaClient + WahaReader
whatsapp-web   -> WhatsAppClient + WhatsAppReader
```

O contrato compartilhado deve ser reforçado para não depender de
`client.getChats()` específico do `whatsapp-web.js`. O orquestrador deve usar
os métodos do adaptador ou uma fachada compatível, mantendo a validação de nome
e ID dos grupos.

## Configuração

Adicionar ao exemplo e ao schema:

```yaml
whatsapp:
  provider: evolution
  base_url: "http://127.0.0.1:8080"
  api_key: "${EVOLUTION_API_KEY}"
  instance_name: sapa
  request_timeout_ms: 15000
  message_page_size: 100
  webhook:
    enabled: true
    secret: "${EVOLUTION_WEBHOOK_SECRET}"
    base64: false
  groups:
    notas_fiscais: ""
    gestores_geral: ""
    obras: []
```

Segredos não podem ser gravados em `config.yaml` versionado. O carregador de
configuração deve continuar resolvendo variáveis de ambiente e erros de
configuração devem indicar o nome do campo, sem exibir o valor secreto.

## Docker e persistência

Criar um compose separado, por exemplo `docker-compose.evolution.yml`, para
não quebrar o ambiente WAHA durante a comparação. O ambiente deve incluir:

- Evolution API;
- volume persistente da instância;
- PostgreSQL ou configuração mínima documentada para desenvolvimento;
- Redis quando exigido pela versão escolhida;
- healthcheck da API;
- versão de imagem fixada, evitando `latest` nos testes de confiabilidade.

O compose não deve conter chaves reais. Os valores devem vir de `.env`, que
continua ignorado pelo Git.

## Resiliência

- timeout em toda chamada HTTP;
- retry limitado apenas para erros transitórios;
- backoff com limite;
- nenhuma nova tentativa para erro de autenticação ou payload inválido;
- estado `connected`, `awaiting_qr`, `disconnected`, `error`;
- reconexão não concorrente;
- diagnóstico com URL, instância, estado e erro sanitizado;
- idempotência por ID da mensagem;
- cursor local para o modo de polling;
- logs de conexão, desconexão, webhook rejeitado, mídia e envio.

## Segurança e privacidade

- usar `apikey` somente em chamadas de saída;
- nunca registrar API key, segredo de webhook, QR completo ou conteúdo de mídia;
- validar segredo do webhook em tempo constante quando aplicável;
- limitar tamanho do corpo do webhook;
- rejeitar instância divergente;
- restringir o endpoint de webhook à rede local ou a um proxy autenticado em
  ambiente exposto;
- manter a Evolution em infraestrutura controlada pela empresa;
- documentar que Baileys continua sendo uma integração não oficial do
  WhatsApp, mesmo com a Evolution.

## Estratégia de migração e fallback

1. Implementar e testar o adaptador sem alterar o provedor atual.
2. Executar testes de contrato e integração com API simulada.
3. Executar teste manual com uma conta/número dedicado.
4. Comparar relatório, atraso, duplicação, reconexão e mídia com WAHA.
5. Habilitar `provider: evolution` somente no ambiente de teste.
6. Promover a Evolution após os critérios de aceite.
7. Manter WAHA e `whatsapp-web.js` disponíveis até a decisão de retirada.

## Decisões ainda abertas

- versão exata da imagem Evolution API a ser homologada;
- endpoint específico de download de mídia da versão instalada;
- necessidade de PostgreSQL e Redis no primeiro ambiente local;
- transporte do webhook (servidor HTTP existente ou novo servidor mínimo);
- se o modo de produção usará polling, webhook ou ambos com webhook como fonte
  primária e polling como reconciliação.

