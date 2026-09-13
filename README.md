# SAPA

Sistema de Automação de Processos Administrativos para receber informações pelo WhatsApp, identificar documentos e imagens, executar OCR e organizar os resultados para uso administrativo.

O projeto está sendo desenvolvido para centralizar tarefas como leitura de notas fiscais, extração de dados de imagens, geração de arquivos estruturados e futuras rotinas de conciliação, quilometragem, atas, mídias, estoque, frequência e terceirizados.

## Estado atual

O SAPA possui:

- orquestrador de execução e processamento incremental;
- persistência local em SQLite;
- logs no terminal e em `logs/`;
- configuração em YAML com validação por schema;
- PaddleOCR como OCR principal;
- integração experimental com `whatsapp-web.js`;
- integração inicial com WAHA via HTTP;
- suporte de testes automatizados com Node.js;
- configuração Docker para executar o WAHA localmente.

O fluxo completo de WhatsApp até OCR ainda está em desenvolvimento. As features estão estruturadas, mas algumas permanecem como base para implementação incremental.

## Tecnologias

### Aplicação

- Node.js 24 ou superior;
- JavaScript/CommonJS;
- SQLite com `better-sqlite3`;
- `js-yaml` para configuração;
- Winston para logging;
- testes nativos com `node:test`.

### OCR e processamento

- Python 3.11;
- PaddlePaddle;
- PaddleOCR PP-OCRv4;
- Pillow;
- OpenPyXL;
- python-docx;
- Tesseract mantido para compatibilidade e experimentos anteriores.

### WhatsApp

- WAHA Core executado em Docker Desktop, como integração principal em teste;
- `whatsapp-web.js` preservado como adaptador alternativo;
- WhatsApp Business Cloud API planejada para uma avaliação posterior com conta comercial oficial.

## Requisitos

- Windows 10/11;
- Node.js 24 ou superior;
- Python 3.11;
- Docker Desktop, quando o provedor WAHA for usado;
- Git;
- conta WhatsApp disponível para autenticação por QR Code;
- acesso à internet para instalar dependências e baixar modelos do OCR.

O projeto não deve ser executado com Node 22 quando estiver usando o binding atual do `better-sqlite3`.

## Instalação

Clone o repositório e entre na pasta:

```powershell
git clone https://github.com/Pedro-Lion/Automacao-Financeiro.git
cd Projeto-Automacao
```

Crie o ambiente Python 3.11 e instale as dependências:

```powershell
py -3.11 -m venv .venv-paddle
.\.venv-paddle\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Instale as dependências Node:

```powershell
npm install
```

Também é possível usar o script de preparação:

```powershell
.\scripts\setup.bat
```

Antes da primeira execução, copie o exemplo de configuração:

```powershell
Copy-Item config.example.yaml config.yaml
```

Edite `config.yaml` e configure pelo menos:

- `ai.python` para apontar para o Python do ambiente PaddleOCR;
- `whatsapp.provider`;
- `whatsapp.base_url` e `whatsapp.session_name` para WAHA;
- o grupo autorizado em `whatsapp.groups.notas_fiscais`, quando o ID já for conhecido;
- chaves externas apenas por variáveis de ambiente ou arquivo local ignorado pelo Git.

## Executando com WAHA

Abra o Docker Desktop e aguarde o engine ficar disponível. Depois, na raiz do projeto:

```powershell
npm run waha:up
```

Verifique os logs do serviço:

```powershell
npm run waha:logs
```

Abra a interface local:

```text
http://localhost:3000
```

Use a documentação Swagger do WAHA para criar/iniciar a sessão `default` e autenticar o WhatsApp pelo QR Code. Depois da autenticação, execute o SAPA:

```powershell
node src\index.js run
```

Para parar o WAHA:

```powershell
npm run waha:down
```

O WAHA é uma automação não oficial do WhatsApp. A conta usada para testes pode estar sujeita às regras e limitações da plataforma. Não utilize contas críticas sem avaliar esse risco.

## Executando com `whatsapp-web.js`

Para testar o adaptador alternativo, altere a configuração:

```yaml
whatsapp:
  provider: whatsapp-web
```

Esse modo usa a sessão local em `data/session`. O adaptador foi mantido para comparação, mas a versão atual do WhatsApp Web apresentou incompatibilidade na serialização de chats durante os testes.

## Comandos principais

```powershell
# Executar o pipeline
node src\index.js run

# Executar uma feature específica
node src\index.js run --feature f01

# Iniciar autenticação/sessão
node src\index.js setup

# Consultar status e última execução
node src\index.js status

# Consultar itens pendentes de revisão
node src\index.js reviews

# Capturar o ID de um grupo por mensagem
npm run get-group-id

# Executar os testes
npm test
```

## Logs e dados gerados

- `logs/`: logs persistentes por execução;
- `data/sapa.db`: banco SQLite local;
- `data/tmp/`: arquivos temporários;
- `data/session/`: sessão local do WhatsApp Web, quando esse adaptador é utilizado;
- volumes Docker: sessão persistente do WAHA;
- `data/ocr_results_paddleocr/`: resultados de OCR, quando o fluxo estiver habilitado.

Esses diretórios são locais e não devem ser enviados ao GitHub.

## Organização do projeto

```text
src/
  adapters/
    ai/                 # PaddleOCR, Gemini e Tesseract
    whatsapp/           # clientes e leitores WhatsApp/WAHA
  core/                 # configuração, estado, logs e orquestração
  features/             # funcionalidades administrativas
  python/               # bridges e scripts Python
scripts/                # setup, execução, agendamento e utilitários
tests/                  # testes automatizados
templates/              # modelos de planilhas e documentos
openspec/               # especificações e backlog do projeto
```

## Segurança

Não versione:

- chaves de API;
- arquivos `.env`;
- sessões do WhatsApp;
- banco de dados local;
- logs;
- imagens e documentos recebidos;
- credenciais do WAHA;
- instaladores ou arquivos pessoais.

Use `config.example.yaml` como referência e mantenha a configuração operacional em `config.yaml`, que deve permanecer apenas na máquina de execução.

## Contribuição

O repositório deve permanecer privado. O acesso de edição será concedido somente ao usuário GitHub `DestroGui`. Alterações devem ser enviadas por branches e pull requests sempre que possível, mantendo os testes existentes passando:

```powershell
npm test
```

## Licença

Projeto privado em desenvolvimento. A licença e as regras de distribuição ainda serão definidas pelo proprietário do repositório.
