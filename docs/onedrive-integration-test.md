# Guia de teste do OneDrive local e integração futura com Microsoft Graph

## Objetivo

Este documento descreve como validar a estrutura local do projeto SAPA antes de conectar uma conta Microsoft real do OneDrive, e como preparar a integração futura para outras contas do OneDrive sem expor segredos no repositório.

## Estrutura local já implementada

O projeto possui um organizador local em:

- `src/adapters/onedrive/organizer.js`

Ele expõe:

- `buildPath(template, variables)`: resolve templates de caminhos em `config.yaml`
- `ensureFolder(relativePath, variables)`: cria a pasta local em `base_path`
- `saveFile(sourcePath, destRelativePath, variables)`: copia arquivo para a estrutura local
- `ensureProjectFolders(projectName, variables)`: cria a árvore de pastas por obra

Configuracão atual em `config.yaml`:

```yaml
onedrive:
  base_path: ./data/onedrive
  structure: {}
```

Também há exemplos de estrutura previstos em `config.example.yaml`:

```yaml
onedrive:
  base_path: ./data/onedrive
  structure:
    financeiro: "/{obra_name}/Financeiro/"
    nfs_reembolso: "/{obra_name}/NFs/Reembolso/"
    nfs_material: "/{obra_name}/NFs/Material_Empresa/"
    atas: "/{obra_name}/Atas/"
    fotos: "/{obra_name}/Fotos/{date}/"
```

## Arquivos gerados e local de salvamento

### Arquivos de exemplo criados localmente

- `data/test-planilha.xlsx`
- `data/test-ata.docx`

### Templates prontos para uso

- `templates/planilha_gastos_template.xlsx`
- `templates/ata_template.docx`

### Diretório principal

Projeto atual:

- `C:\Users\pedro\OneDrive - SPTech School\5° Semestre\Projeto-Automacao`

Arquivos de saída locais em:

- `C:\Users\pedro\OneDrive - SPTech School\5° Semestre\Projeto-Automacao\data\`
- `C:\Users\pedro\OneDrive - SPTech School\5° Semestre\Projeto-Automacao\templates\`

## Como testar localmente

1. Crie uma estrutura de obra no código:

```js
const { Organizer } = require('./src/adapters/onedrive/organizer');
const organizer = new Organizer('./data/onedrive', console, {
  financeiro: '/{obra_name}/Financeiro/',
  atas: '/{obra_name}/Atas/'
});

organizer.ensureProjectFolders('ObraTeste', { obra_name: 'ObraTeste' });
organizer.saveFile('./data/test-planilha.xlsx', '/ObraTeste/Financeiro/gastos.xlsx', {
  obra_name: 'ObraTeste'
});
```

2. Rode o projeto normalmente:

```bash
node src/index.js run
```

3. Validar se os arquivos apareceram em `data/onedrive`.

## Preparação para outras contas Microsoft

Antes de conectar uma conta diferente, o projeto precisará de credenciais do Microsoft Graph. Exemplo de configuração esperada:

```env
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_DRIVE_ID=
```

Ou ainda, usando uma auth flow por usuário:

- App Registration no Azure
- Microsoft Entra ID
- permissões de Drive: `Files.ReadWrite.All` ou equivalente
- `driveId` da unidade de destino

## Próximo passo para OneDrive real

A integração real deve adotar a chamada Microsoft Graph em um adapter específico, por exemplo:

- `src/adapters/onedrive/graph.js`
- com método `uploadFile(sourcePath, remotePath)`
- usando `@azure/identity` ou `msal-node`
- com upload para `/me/drive/root:/Pasta/Arquivo.xlsx:/content`

O fluxo recomendado é:

1. autenticar com o tenant da conta
2. localizar o drive alvo
3. montar o caminho relativo da pasta da obra
4. chamar upload/patch em cada arquivo
5. registrar logs e erro sem quebrar a execução principal

## Triggers das funções do fluxo

### 1) `Organizer.buildPath`
Trigger:
- usado sempre que a aplicação precisa transformar um template de path em caminho real
- exemplos: `Financeiro`, `NFs/Reembolso`, `Atas`, `Fotos/{date}`

### 2) `Organizer.ensureFolder`
Trigger:
- chamado antes de salvar qualquer arquivo
- usado para criar a pasta da obra ou da categoria de documento

### 3) `Organizer.saveFile`
Trigger:
- chamado quando uma feature gera um output definitivo (Excel, Word, imagem, comprovante)
- normalmente a partir de `generateOutputs()`

### 4) `BaseFeature.generateOutputs()`
Trigger:
- é o gatilho principal para geração de arquivos por feature
- o `Orchestrator.run()` percorre todas as features ativadas e dispara `feature.generateOutputs()`

### 5) `Orchestrator.run()`
Trigger:
- dispara no comando principal do sistema
- `node src/index.js run`
- ou em agendamento futuro

### 6) `node src/index.js run --feature ...`
Trigger:
- uso futuro para rodar só uma feature específica

## Checklist de validação para outras contas

- [ ] app registered no Azure
- [ ] tenant e client id configurados
- [ ] secret ou cert armazenado fora do repositório
- [ ] drive id validado
- [ ] upload de arquivo de teste funcionando
- [ ] estrutura de pastas por obra criada
- [ ] logs de sucesso e falha registrados

## Observação importante

A parte local já está validada. A parte real de OneDrive ainda depende de autenticação do Microsoft Graph e não deve ser testada com secrets no código ou em chat. Mantenha todas as credenciais em variável de ambiente local ou em secret manager.
