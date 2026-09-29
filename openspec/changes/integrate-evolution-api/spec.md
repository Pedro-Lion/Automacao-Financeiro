# Especificação Delta — Provedor Evolution API

Esta mudança estende o contrato do WhatsApp para suportar a Evolution API sem
alterar as regras das features existentes.

## Requisito 1 — Seleção do provedor

O sistema DEVE aceitar `whatsapp.provider: evolution`.

### Cenário: iniciar com Evolution

- **Dado** que a configuração possui `provider: evolution`
- **Quando** o SAPA iniciar
- **Então** deve construir o cliente e leitor Evolution
- **E** não deve inicializar `whatsapp-web.js` nem o cliente WAHA
- **E** deve falhar com mensagem clara se `base_url`, `api_key` ou
  `instance_name` estiverem ausentes.

## Requisito 2 — Conexão de instância

O cliente DEVE verificar a API, localizar/criar a instância de forma
idempotente e confirmar o estado da conexão.

### Cenário: instância já conectada

- **Dado** que a API está disponível e a instância está `open`/conectada
- **Quando** `connect()` for chamado
- **Então** deve concluir sem recriar a instância
- **E** deve expor `isConnected() === true`
- **E** deve registrar diagnóstico sanitizado.

### Cenário: instância aguardando QR

- **Dado** que a instância existe mas não está conectada
- **Quando** `connect()` for chamado
- **Então** deve solicitar o QR Code quando necessário
- **E** deve expor estado `awaiting_qr`
- **E** não deve iniciar o processamento de mensagens como se estivesse conectado.

### Cenário: API indisponível

- **Dado** que a API não responde dentro do timeout
- **Quando** `connect()` for chamado
- **Então** deve retornar erro explícito
- **E** deve registrar o estado `error`
- **E** não deve marcar a sessão como conectada.

## Requisito 3 — Grupos autorizados

O sistema DEVE validar o grupo de notas fiscais e os grupos de obras usando o
ID e o nome configurados, preservando as regras atuais do orquestrador.

### Cenário: grupo válido

- **Dado** um grupo existente com ID configurado e nome esperado
- **Quando** os grupos forem validados
- **Então** o grupo deve ser retornado com `id`, `name` e `type`.

### Cenário: grupo inválido

- **Dado** que o ID aponta para um chat privado ou nome divergente
- **Quando** os grupos forem validados
- **Então** o pipeline deve falhar nessa etapa
- **E** deve informar o ID e a expectativa sem vazar credenciais.

## Requisito 4 — Normalização de mensagens

O leitor DEVE converter mensagens da Evolution para o contrato interno do SAPA.

### Cenário: mensagem de texto

- **Dado** um payload `conversation` ou `extendedTextMessage`
- **Quando** for normalizado
- **Então** `body`, `id`, `from`, `author` e `timestamp` devem ser preenchidos.

### Cenário: imagem com legenda

- **Dado** um payload `imageMessage` com caption
- **Quando** for normalizado
- **Então** `type` deve ser `image`
- **E** `hasMedia` deve ser `true`
- **E** `caption` deve preservar a legenda
- **E** `mimetype` deve ser preservado quando disponível.

### Cenário: mensagem própria

- **Dado** um payload com `fromMe: true`
- **Quando** o reader for executado
- **Então** a mensagem não deve ser retornada ao orquestrador.

### Cenário: mensagem antiga ou duplicada

- **Dado** uma mensagem com timestamp menor/igual ao cursor ou ID já processado
- **Quando** o reader/inbox for executado
- **Então** ela não deve ser processada novamente.

## Requisito 5 — Webhook

O handler de webhook DEVE validar autenticidade, instância, evento e payload
antes de persistir qualquer mensagem.

### Cenário: webhook válido

- **Dado** um evento `MESSAGES_UPSERT` válido
- **Quando** o handler receber a requisição
- **Então** deve responder sucesso
- **E** persistir a mensagem no inbox
- **E** manter uma única entrada por `instance + messageId`.

### Cenário: segredo inválido

- **Dado** um webhook com segredo ausente ou inválido
- **Quando** for recebido
- **Então** deve responder não autorizado
- **E** não deve persistir o payload.

### Cenário: conexão atualizada

- **Dado** um evento `CONNECTION_UPDATE`
- **Quando** for recebido
- **Então** o estado operacional da instância deve ser atualizado
- **E** uma queda deve ser registrada como indisponibilidade.

## Requisito 6 — Mídia

O adaptador DEVE baixar mídia com timeout, validação e nome seguro.

### Cenário: download válido

- **Dado** uma mensagem de imagem válida
- **Quando** `downloadMedia()` for executado
- **Então** deve criar um arquivo local com extensão compatível
- **E** retornar um caminho dentro de `data/tmp`.

### Cenário: mídia expirada ou vazia

- **Dado** que a Evolution não consegue obter o conteúdo
- **Quando** o download for executado
- **Então** deve retornar erro explícito
- **E** não deve criar arquivo vazio ou corrompido.

## Requisito 7 — Envio privado

O sender DEVE normalizar telefone, aplicar rate limit e enviar texto pela
Evolution.

### Cenário: envio válido

- **Dado** um telefone válido e texto não vazio
- **Quando** `sendMessage()` for chamado
- **Então** deve enviar para o JID privado correto
- **E** deve registrar o resultado sem registrar segredo.

### Cenário: entrada inválida

- **Dado** telefone inválido ou texto vazio
- **Quando** `sendMessage()` for chamado
- **Então** deve rejeitar antes da chamada HTTP.

## Requisito 8 — Compatibilidade do pipeline

As features e o orquestrador DEVEM continuar funcionando sem conhecer detalhes
da Evolution.

### Cenário: execução com Evolution

- **Dado** um leitor Evolution que retorna mensagens normalizadas
- **Quando** o orquestrador executar
- **Então** classificação, estado, relatório e features devem seguir o mesmo
  contrato usado pelos outros provedores.

## Requisito 9 — Operação Docker

O projeto DEVE fornecer compose versionado e documentação de execução.

### Cenário: inicialização limpa

- **Dado** Docker disponível e `.env` preenchido
- **Quando** o compose Evolution for iniciado
- **Então** a API deve ficar saudável na porta documentada
- **E** a instância deve manter seus dados após reinicialização.

## Requisito 10 — Observabilidade

O adaptador DEVE registrar conexão, reconexão, falha HTTP, webhook rejeitado,
mensagem persistida, download de mídia e envio.

Nenhum log pode conter API key, segredo, QR completo, conteúdo binário ou
credenciais.

