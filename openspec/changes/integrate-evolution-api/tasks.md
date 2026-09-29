# Tarefas — Integração da Evolution API

As tarefas abaixo são parte da especificação de implementação. Cada item inclui
os testes esperados e deve ser marcado somente após a validação correspondente.

## Fase 0 — Contrato e configuração

- [x] **T-001 — Atualizar contrato WhatsApp**
  - Revisar `openspec/contracts.md` para incluir `getChats`, `getChatById`,
    diagnóstico, estado de conexão e operação de webhook sem acoplar ao
    `whatsapp-web.js`.
  - Definir campos opcionais de mídia e o formato canônico de JID.
  - **Testes:** teste de contrato com fake adapter validando todos os métodos
    obrigatórios e rejeitando mensagens sem `id`, `from` ou `timestamp`.

- [x] **T-002 — Adicionar configuração Evolution**
  - Atualizar `config.example.yaml`, `config.schema.json` e documentação.
  - Adicionar `provider: evolution`, `instance_name`, timeout, paginação e
    webhook.
  - Garantir resolução de `${EVOLUTION_API_KEY}` e
    `${EVOLUTION_WEBHOOK_SECRET}` sem registrar valores.
  - **Testes:** configuração válida carrega; provider inválido falha; campo
    obrigatório ausente falha; segredo não aparece na mensagem de erro.

## Fase 1 — Cliente REST

- [x] **T-010 — Implementar EvolutionClient**
  - Criar `src/adapters/whatsapp/evolution-client.js`.
  - Implementar request com header `apikey`, `Content-Type`, timeout e parsing
    seguro de resposta.
  - Implementar healthcheck, criação/localização de instância, conexão,
    estado, diagnóstico e disconnect.
  - **Testes unitários:**
    - inclui `apikey` e não envia `X-Api-Key`;
    - interpreta JSON e texto de erro;
    - timeout gera erro explícito;
    - 401/403 não entram em retry;
    - 429/5xx aplicam retry limitado;
    - `connect()` concorrente usa uma única operação;
    - instância existente não é recriada;
    - API key não aparece nos logs.

- [x] **T-011 — Implementar consulta de grupos**
  - Adicionar listagem e busca direta por ID.
  - Normalizar grupos para `{ id, name, isGroup }`.
  - Adaptar o orquestrador para consumir a fachada sem depender do formato
    interno de `whatsapp-web.js`.
  - **Testes:** grupo válido; chat privado rejeitado; nome divergente rejeitado;
    grupo inexistente gera erro; paginação/resposta `data` é suportada.

- [x] **T-012 — Implementar envio de texto**
  - Criar integração Evolution para envio privado, mantendo o contrato atual do
    `WhatsAppSender`.
  - **Testes:** telefone normalizado; texto vazio rejeitado; JID correto;
    rate limit; erro HTTP propagado; payload não contém segredo.

## Fase 2 — Leitura e mídia

- [x] **T-020 — Implementar EvolutionReader**
  - Criar normalização de payloads Baileys para `Message`.
  - Suportar texto, texto estendido, imagem, documento, vídeo, áudio e sticker.
  - Implementar cursor, paginação, ordenação e filtro `fromMe`.
  - **Testes unitários:**
    - texto simples;
    - texto citado;
    - imagem com caption;
    - documento com filename;
    - timestamp em milissegundos convertido para segundos;
    - mensagem própria filtrada;
    - payload desconhecido rejeitado ou marcado explicitamente;
    - paginação não duplica mensagens;
    - mensagens retornam em ordem crescente.

- [x] **T-021 — Implementar EvolutionMedia**
  - Criar adaptador de download usando endpoint suportado pela versão
    homologada da Evolution.
  - Reutilizar validação de timeout e arquivo temporário.
  - **Testes:** base64 válido salva arquivo; mimetype gera extensão segura;
    timeout; resposta vazia; base64 inválido; path traversal bloqueado; arquivo
    parcial é removido após erro.

- [x] **T-022 — Integrar mídia ao pipeline**
  - Garantir que features que utilizam `hasMedia` recebam o mesmo contrato dos
    adaptadores atuais.
  - **Testes:** mensagem de imagem chega à feature; arquivo pode ser consumido
    pelo OCR; erro de download vira erro/pending review sem interromper outras
    mensagens.

## Fase 3 — Webhook e inbox

- [x] **T-030 — Implementar handler puro de webhook**
  - Criar validador/handler independente do framework HTTP.
  - Validar segredo, instância, evento, tamanho e estrutura mínima.
  - Suportar `CONNECTION_UPDATE`, `QRCODE_UPDATED` e `MESSAGES_UPSERT`.
  - **Testes:** evento válido aceito; segredo inválido rejeitado; instância
    divergente rejeitada; JSON inválido rejeitado; payload grande rejeitado;
    evento desconhecido tratado explicitamente; QR não é gravado em log.

- [x] **T-031 — Persistir inbox e deduplicação**
  - Adicionar tabela/migration no `State` para mensagens recebidas pelo
    webhook, com chave única `instance_name + message_id`.
  - Registrar status recebido/processado/erro e timestamp.
  - **Testes:** primeira mensagem insere; mesma mensagem duas vezes gera uma
    única entrada; falha pode ser retomada; instâncias distintas podem usar o
    mesmo message ID sem colisão.

- [x] **T-032 — Conectar inbox ao reader**
  - Definir modo de consumo: webhook primário e polling de reconciliação.
  - Evitar que a mesma mensagem seja processada por webhook e polling.
  - **Testes:** mensagem do webhook é lida pelo pipeline; cursor avança;
    duplicata é ignorada; polling recupera mensagem que webhook perdeu.

- [x] **T-033 — Expor transporte HTTP local**
  - Conectar o handler a um endpoint local existente ou criar servidor mínimo
    conforme decisão do design.
  - Aplicar limite de corpo, timeout e encerramento limpo.
  - **Testes:** POST válido retorna 2xx; método inválido retorna 405; corpo
    inválido retorna 4xx; servidor encerra sem deixar porta presa.

## Fase 4 — Docker e operação

- [x] **T-040 — Criar compose Evolution**
  - Criar `docker-compose.evolution.yml` com versão de imagem fixada, volume
    de instância, healthcheck e dependências necessárias.
  - Nunca inserir segredo real no arquivo.
  - **Testes:** validação do compose; subida limpa; healthcheck; reinício
    preserva volume; API responde na porta documentada.

- [x] **T-041 — Criar scripts npm**
  - Adicionar comandos `evolution:up`, `evolution:logs` e `evolution:down`
    sem remover os comandos WAHA.
  - **Testes:** scripts apontam para o arquivo correto e retornam erro claro
    quando Docker não está disponível.

- [x] **T-042 — Documentar setup e limitações**
  - Atualizar README com instalação, `.env`, criação da instância, QR,
    webhook, teste de grupo, teste de mídia, fallback e encerramento.
  - Documentar que Baileys/Evolution não é a Cloud API oficial e que uma conta
    dedicada deve ser usada nos testes.
  - **Testes:** seguir o README em ambiente limpo até healthcheck e diagnóstico.

## Fase 5 — Integração e homologação

- [x] **T-050 — Testes de integração com API simulada**
  - Criar servidor fake ou fixture HTTP reproduzindo respostas da Evolution.
  - Executar fluxo completo: connect → grupos → mensagens → mídia → envio.
  - **Critério:** fluxo sem WhatsApp real, determinístico e repetível.

- [ ] **T-051 — Teste manual com conta dedicada**
  - Criar instância de homologação e autenticar por QR.
  - Enviar texto e imagem ao grupo de teste.
  - Confirmar recebimento, normalização, OCR, relatório e cursor.
  - Repetir execução para confirmar idempotência.
  - **Evidências:** logs sanitizados, relatório JSON, IDs processados e arquivo
    de mídia/OneDrive.

- [ ] **T-052 — Teste de desconexão e recuperação**
  - Interromper/reiniciar Evolution e simular queda da sessão WhatsApp.
  - Confirmar estado `disconnected/error`, retry controlado e recuperação sem
    duplicação.
  - **Critério:** nenhuma mensagem válida é perdida no intervalo coberto pelo
    inbox/reconciliação.

- [ ] **T-053 — Comparar Evolution e WAHA**
  - Executar o mesmo conjunto de casos nos dois provedores.
  - Comparar latência, mensagens lidas, duplicatas, falhas de mídia, tempo de
    reconexão e clareza dos logs.
  - Registrar decisão de promoção ou necessidade de correção.

- [x] **T-054 — Rodar suíte de regressão**
  - Executar `npm test`.
  - Validar que testes de `whatsapp-web.js`, WAHA, orquestrador, estado e
    features continuam passando.
  - **Critério:** nenhuma regressão causada pela abstração comum.

## Ordem de execução

```text
T-001 ─┬─ T-010 ─ T-011 ─ T-012
T-002 ─┤
T-020 ─ T-021 ─ T-022
T-030 ─ T-031 ─ T-032 ─ T-033
T-040 ─ T-041 ─ T-042
              └─ T-050 ─ T-051 ─ T-052 ─ T-053 ─ T-054
```

T-050 pode começar após o cliente, reader, mídia e configuração estarem
disponíveis. T-051 e T-052 dependem do ambiente Docker homologado.
