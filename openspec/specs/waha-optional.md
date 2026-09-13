# Especificação opcional — Adaptador WAHA para WhatsApp

## Status

Desejável para uma etapa futura. Não faz parte do fluxo atual do SAPA.

## Objetivo

Permitir que o SAPA use um número dedicado do WhatsApp por meio de um serviço
WAHA, mantendo o domínio da aplicação independente do mecanismo de sessão.

## Requisitos desejáveis

- Criar um adaptador com a mesma interface do cliente atual:
  `connect`, `disconnect`, `isConnected`, leitura de mensagens e envio.
- Configurar `provider: waha` e uma URL base via `config.yaml`.
- Receber mensagens por webhook e normalizá-las para o formato usado por
  `WhatsAppReader`.
- Consultar a API do WAHA para buscar mensagens quando o webhook não estiver
  disponível.
- Expor o estado da sessão e a URL/imagem do QR para uma futura interface.
- Usar um número dedicado que participe dos grupos monitorados.
- Reutilizar o classificador, o orquestrador, o estado SQLite e as features
  existentes sem duplicar regras de negócio.

## Segurança e operação

- Não armazenar tokens ou credenciais no repositório.
- Validar a assinatura/autenticação dos webhooks.
- Aplicar timeout, retry limitado e idempotência por `message_id`.
- Registrar indisponibilidade do WAHA e impedir processamento duplicado.
- Manter `whatsapp-web.js` como adaptador local até que o fluxo WAHA seja
  implementado e validado.
