# Proposta — Integrar Evolution API ao SAPA

## Contexto

Os testes de conexão realizados com `whatsapp-web.js` e WAHA apresentaram falhas
de estabilidade e compatibilidade com o WhatsApp Web. Como a confiabilidade da
conexão é um critério principal do projeto, o SAPA precisa avaliar uma camada de
integração dedicada ao WhatsApp, com sessão persistente, API REST, eventos de
conexão e suporte a webhooks.

O projeto já possui uma arquitetura de adaptadores: o orquestrador consome um
cliente/leitor WhatsApp e as features não dependem diretamente da biblioteca de
conexão. Essa separação permite incorporar a Evolution API sem reescrever o
processamento de OCR, classificação, estado SQLite ou armazenamento no OneDrive.

## Objetivo

Incorporar a Evolution API como um novo provedor WhatsApp do SAPA, inicialmente
usando a integração `WHATSAPP-BAILEYS`, com:

- conexão e autenticação por instância;
- QR Code e diagnóstico de estado;
- leitura de grupos e mensagens;
- normalização de mensagens para o contrato interno;
- download de imagens e documentos;
- envio de mensagens privadas;
- webhook para eventos de conexão, QR Code e novas mensagens;
- persistência e idempotência compatíveis com o modelo local do SAPA;
- ambiente Docker reproduzível para testes;
- testes automatizados e testes de integração controlados.

## Resultado esperado

O SAPA poderá selecionar `whatsapp.provider: evolution` sem alterar as features
de negócio. WAHA e `whatsapp-web.js` permanecerão disponíveis durante a
validação comparativa, mas a Evolution será o provedor recomendado para os
testes de confiabilidade desta mudança.

## Fora de escopo

- Migração imediata para a WhatsApp Cloud API oficial da Meta;
- remoção dos adaptadores WAHA e `whatsapp-web.js`;
- criação de uma interface web para QR Code;
- processamento assíncrono distribuído com RabbitMQ, Kafka ou SQS;
- substituição do SQLite local do SAPA;
- alteração das regras de classificação, OCR ou organização do OneDrive.

## Critério de aceite

A mudança será considerada pronta quando:

1. o cliente Evolution passar nos testes de contrato sem depender de WhatsApp
   real;
2. o compose iniciar uma instância reproduzível com volume persistente;
3. a aplicação conseguir diagnosticar a instância, validar o grupo configurado,
   ler mensagens normalizadas e enviar uma mensagem de teste;
4. eventos de webhook forem autenticados, validados, deduplicados e
   disponibilizados ao pipeline;
5. mensagens, mídias, desconexões e falhas de API tiverem testes de erro;
6. um teste de integração documentado conseguir conectar uma conta de teste,
   receber uma mensagem de grupo e processá-la sem duplicação.

