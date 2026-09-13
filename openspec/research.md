# Research — Sistema de Automação de Processos Administrativos (SAPA)

> Pesquisa técnica sobre bibliotecas, APIs e decisões de implementação.

---

## 1. WhatsApp Web Automation

### 1.1 whatsapp-web.js

**Repo:** [https://github.com/pedroslopez/whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)**Stars:** 15k+**Status:** Ativo, manutenção contínua

**O que faz:**

- Conecta ao WhatsApp Web via Puppeteer (headless Chrome)
- Expõe API completa: enviar/receber mensagens, grupos, mídias
- Persistência de sessão (não precisa escanear QR toda vez)

**API relevante:**

```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './data/session' }),
  puppeteer: { headless: true }
});

client.on('qr', qr => { /* Exibe QR para scan */ });
client.on('ready', () => { /* Pronto para uso */ });

// Buscar mensagens de um grupo
const chat = await client.getChatById('GROUP_ID@g.us');
const messages = await chat.fetchMessages({ limit: 100 });

// Baixar mídia
const media = await message.downloadMedia();
fs.writeFileSync('photo.jpg', media.data, 'base64');

// Enviar mensagem
await client.sendMessage('5511999990001@c.us', 'Texto aqui');

```

**Limitações conhecidas:**

- Não é API oficial da Meta (risco de ban — baixo para uso interno)
- Sessão pode desconectar se WhatsApp Web for aberto em outro lugar
- Performance degrada com muitas mensagens em memória (paginar)
- `fetchMessages()` limita a 100 por chamada (paginar com `before: lastMsg.id`)

**Alternativas avaliadas:**

| Lib | Motivo da rejeição |
| --- | --- |
| Baileys | Mais rápida mas menos estável; API mais complexa |
| Evolution API | Requer Docker + server; overkill para uso local |
| Venom-bot | Menos mantido, mais bugs reportados |

**Decisão:** Usar whatsapp-web.js com LocalAuth.

---

## 2. Google Gemini 1.5 Flash (AI)

### 2.1 Free Tier

**Limites (agosto 2025):**

- 15 requisições por minuto
- 1.500 requisições por dia
- 1 milhão de tokens por minuto
- Suporta imagens (Vision)

**Cálculo de uso para SAPA:**

- 30 NFs/semana × OCR = ~30 req/semana (vision)
- ~200 mensagens/dia × classificação = ~50 req/dia (batch com contexto)
- ATAs semanais × 5 obras = ~5 req/semana
- KM/dia × 4 gestores = ~4 req/dia

**Total estimado:** ~60-80 req/dia → **dentro do free tier com folga**

### 2.2 API Usage

```python
import google.generativeai as genai

genai.configure(api_key="API_KEY")
model = genai.GenerativeModel('gemini-1.5-flash')

# OCR de NF (imagem)
import PIL.Image
img = PIL.Image.open('nf.jpg')
response = model.generate_content([
    "Extraia os seguintes dados desta nota fiscal brasileira...",
    img
])

# Classificação de texto
response = model.generate_content(
    "Classifique a seguinte mensagem em uma das categorias: ..."
)

```

### 2.3 Prompts Recomendados

**OCR de NF (prompt base):**

```
Você é um sistema de OCR especializado em Notas Fiscais brasileiras.
Analise esta imagem e extraia os seguintes campos em formato JSON:

{
  "fornecedor": "nome completo do estabelecimento",
  "cnpj": "XX.XXX.XXX/XXXX-XX",
  "data_compra": "YYYY-MM-DD",
  "valor_total": 0.00,
  "itens": [
    {"nome": "descrição do item", "quantidade": 1, "valor_unitario": 0.00}
  ]
}

Regras:
- Se um campo não for legível, use null
- Datas no formato ISO (YYYY-MM-DD)
- Valores numéricos sem símbolo de moeda
- CNPJ com pontuação
- Se a imagem for um comprovante de pagamento (não NF), retorne {"is_comprovante": true} com os campos disponíveis
- Responda APENAS com o JSON, sem texto adicional

```

**Classificação de mensagem:**

```
Classifique esta mensagem de WhatsApp de um grupo de obra de construção civil.

Categorias possíveis:
- DECISAO: mensagem contém aprovação, escolha, ou definição sobre a obra
- FREQUENCIA: mensagem registra presença/ausência de trabalhadores
- AGENDAMENTO: mensagem menciona compromisso futuro com data/hora
- INFORMACAO: mensagem apenas informa algo sem decisão
- IRRELEVANTE: mensagem social, saudação, ou sem conteúdo operacional

Mensagem: "{texto}"
Autor: "{sender}"

Responda em JSON: {"categoria": "...", "confianca": 0.0-1.0, "razao": "..."}

```

---

## 3. OpenRouteService (Cálculo de Rotas)

### 3.1 Free Tier

- 2.000 requisições/dia
- Sem necessidade de cartão de crédito
- API key gratuita

**Cálculo de uso para SAPA:**

- 4 gestores × ~4 trechos/dia = ~16 req/dia
- Com cache de rotas frequentes: ~5 req/dia reais

→ **Extremamente dentro do limite**

### 3.2 API

```python
import requests

API_KEY = "..."
BASE_URL = "https://api.openrouteservice.org"

# Geocoding
response = requests.get(f"{BASE_URL}/geocode/search", params={
    "api_key": API_KEY,
    "text": "Leroy Merlin Centro, São Paulo",
    "boundary.country": "BR"
})

# Distância entre dois pontos
response = requests.post(f"{BASE_URL}/v2/directions/driving-car", 
    headers={"Authorization": API_KEY},
    json={
        "coordinates": [[-46.6388, -23.5489], [-46.6566, -23.5614]],
        "units": "km"
    }
)
# response.json()["routes"][0]["summary"]["distance"]  # km

```

---

## 4. Tesseract OCR (Fallback)

### 4.1 Instalação

- Windows: download do installer em [https://github.com/UB-Mannheim/tesseract/wiki](https://github.com/UB-Mannheim/tesseract/wiki)
- Adicionar ao PATH
- Instalar dados de treino para português: `por.traineddata`

### 4.2 Uso com Python

```python
import pytesseract
from PIL import Image, ImageFilter, ImageEnhance

# Pré-processamento para melhorar OCR
img = Image.open('nf.jpg')
img = img.convert('L')  # Grayscale
img = ImageEnhance.Contrast(img).enhance(2.0)  # Aumentar contraste
img = img.filter(ImageFilter.SHARPEN)

text = pytesseract.image_to_string(img, lang='por')

```

**Limitação:** OCR puro retorna texto bruto — precisa de parsing com regex para extrair campos estruturados. Confidence será 0.5-0.7 comparado com Gemini (0.85-0.95).

---

## 5. openpyxl (Excel)

### 5.1 Criação de Planilha

```python
from openpyxl import Workbook
from openpyxl.styles import Font, numbers

wb = Workbook()
ws = wb.active
ws.title = "Jan/2025"

# Headers
headers = ["Data", "Fornecedor", "CNPJ", "Tipo", "Valor", "Itens"]
for col, h in enumerate(headers, 1):
    ws.cell(row=1, column=col, value=h).font = Font(bold=True)

# Dados
ws.append(["2025-01-15", "Leroy Merlin", "01.234.567/0001-89", "REEMBOLSO", 452.30, "Argamassa..."])

# Formato moeda
for row in ws.iter_rows(min_row=2, min_col=5, max_col=5):
    for cell in row:
        cell.number_format = 'R$ #,##0.00'

wb.save("Gastos_Pedro_SP.xlsx")

```

### 5.2 Append em Arquivo Existente

```python
from openpyxl import load_workbook

wb = load_workbook("Gastos_Pedro_SP.xlsx")
ws = wb["Jan/2025"]
ws.append([...])  # Nova linha
wb.save("Gastos_Pedro_SP.xlsx")

```

---

## 6. python-docx (Word)

### 6.1 Geração de ATA

```python
from docx import Document
from docx.shared import Inches, Pt

doc = Document()
doc.add_heading('Ata de Decisões — Obra Pedro SP', 0)
doc.add_paragraph(f'Período: 01/01/2025 a 07/01/2025')

doc.add_heading('Decisões', level=1)

# Para cada decisão:
doc.add_heading('03/01/2025 — Escolha de porcelanato', level=2)
doc.add_paragraph('Decidido usar porcelanato X da marca Y para banheiro social.')
doc.add_picture('foto_porcelanato.jpg', width=Inches(4))

doc.save('ATA_01-01_a_07-01_Pedro_SP.docx')

```

---

## 7. SQLite com Node.js

### 7.1 better-sqlite3

```javascript
const Database = require('better-sqlite3');
const db = new Database('data/sapa.db');

// Criar tabelas
db.exec(fs.readFileSync('schema.sql', 'utf8'));

// Inserir
const stmt = db.prepare('INSERT OR IGNORE INTO processed_messages (message_id, ...) VALUES (?, ...)');
stmt.run(messageId, ...);

// Consultar
const lastTs = db.prepare('SELECT last_timestamp FROM sync_state WHERE group_id = ?').get(groupId);

```

**Vantagem sobre sqlite3 padrão:** Síncrono (não precisa de callbacks/promises para queries simples), performance 2-3x melhor.

---

## 8. Riscos Técnicos Identificados

| Risco | Probabilidade | Impacto | Mitigação |
| --- | --- | --- | --- |
| WhatsApp ban do número | Baixa | Alto | Usar número dedicado; não spammar; comportamento humano-like |
| Gemini muda free tier | Média | Médio | Adapter pattern + fallback Tesseract + possibilidade de migrar para Claude/GPT |
| OCR falha em NFs ruins | Alta | Baixo | Threshold + pending_review + fallback humano |
| Sessão WhatsApp desconecta | Média | Baixo | Reconexão automática; alerta se falhar |
| OneDrive dessincroniza | Baixa | Médio | Verificar se pasta existe antes de escrever; log de falhas |
| Mudança na lib whatsapp-web.js | Média | Alto | Pinnar versão; testar updates em staging |

---

## 9. Performance Estimada

| Operação | Tempo estimado |
| --- | --- |
| Conectar WhatsApp (sessão existente) | 5-10s |
| Buscar 100 mensagens de um grupo | 2-3s |
| OCR de 1 NF (Gemini) | 2-4s |
| OCR de 1 NF (Tesseract) | 10-20s |
| Classificar 1 mensagem (Gemini) | 1-2s |
| Classificar batch de 50 mensagens | 3-5s |
| Calcular 1 rota (OpenRouteService) | 1-2s |
| Gerar 1 planilha Excel | <1s |
| Gerar 1 documento Word | <1s |
| **Execução completa típica (dia normal, 5 obras)** | **2-4 minutos** |

