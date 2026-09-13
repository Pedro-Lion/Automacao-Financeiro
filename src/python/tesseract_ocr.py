import json
import os
import re
import sys
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import pytesseract

def preprocess(image_path):
    image = Image.open(image_path).convert("L")
    image = ImageOps.autocontrast(image)
    image = ImageEnhance.Contrast(image).enhance(2.0)
    image = image.filter(ImageFilter.SHARPEN)
    image = image.point(lambda pixel: 255 if pixel > 160 else 0)
    image = crop_to_content(image)
    return deskew(image)

def crop_to_content(image):
    inverted = ImageOps.invert(image)
    bbox = inverted.point(lambda pixel: 255 if pixel > 25 else 0).getbbox()
    if not bbox:
        return image
    padding = 12
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    return image.crop((left, top, right, bottom))

def deskew(image):
    try:
        osd = pytesseract.image_to_osd(image, config="--psm 0")
        match = re.search(r"Rotate:\s*(\d+)", osd)
        angle = int(match.group(1)) if match else 0
        return image.rotate(angle, expand=True, fillcolor="white") if angle else image
    except Exception:
        return image

def parse_brazilian_value(value):
    normalized = re.sub(r"[^\d,.-]", "", value)
    if "," in normalized:
        normalized = normalized.replace(".", "").replace(",", ".")
    try:
        return float(normalized)
    except ValueError:
        return None

def clean_ocr_line(line):
    return re.sub(r"\s+", " ", line).strip(" -:.;")

def supplier_from_text(text, lines):
    company_markers = (
        "LTDA", "EIRELI", "S.A", "S/A", "MEI", "COM.", "COMERC", "COMER",
        "MATERIAIS", "CONSTRU", "ELETRIC", "SERV.", "SERVI", "INDUSTR",
        "AUTO", "ATACAD", "VAREJ", "PNEU", "FERRAG", "LOJA",
    )
    excluded_markers = (
        "RUA ", "AV ", "AV. ", "ROD ", "TEL", "EMAIL", "HTTP", "WWW",
        "DOCUMENTO", "NOTA FISCAL", "RECIBO", "VENDA", "CONSUMIDOR",
        "CLIENTE", "ENDERE", "MUNIC", "CIDADE", "ESTADO", "CEP",
        "FORMA", "PAGAMENTO", "DESCRI", "CODIGO", "CÓDIGO", "QUANT",
        "TOTAL", "VALOR", "ITEM", "PEDIDO", "VENDEDOR", "OPERADOR",
        "COMBINAR", "MEIOS", "FRETE", "GRÁTIS", "GRATIS", "ESCOLHER",
    )
    cnpj_index = next((index for index, line in enumerate(lines) if "CNPJ" in line.upper()), None)
    candidates = []

    for index, raw_line in enumerate(lines):
        line = clean_ocr_line(raw_line)
        upper = line.upper()
        if len(line) < 4:
            continue
        if re.fullmatch(r"[\d\s./:-]+", line):
            continue

        remainder = re.sub(
            r".*?CNPJ\s*[:./\-\d ]{0,25}",
            "",
            line,
            flags=re.IGNORECASE,
        ).strip(" :-")
        candidate = remainder if remainder and not re.fullmatch(r"[\W_]+", remainder) else line
        candidate_upper = candidate.upper()
        if any(marker in upper for marker in excluded_markers) and not remainder:
            continue
        if any(marker in candidate_upper for marker in excluded_markers):
            continue
        if index + 1 < len(lines):
            continuation = clean_ocr_line(lines[index + 1])
            continuation_upper = continuation.upper()
            if (
                remainder
                and len(continuation) >= 4
                and not any(marker in continuation_upper for marker in excluded_markers)
                and any(marker in continuation_upper for marker in company_markers)
            ):
                candidate = f"{candidate} {continuation}"
                candidate_upper = candidate.upper()
        marker_score = sum(marker in candidate_upper for marker in company_markers)
        letters = re.findall(r"[A-Za-zÀ-ÿ]", candidate)
        uppercase_score = sum(char.isupper() for char in letters) / max(1, len(letters))
        score = marker_score * 4 + min(len(candidate), 60) / 30 + uppercase_score
        if cnpj_index is not None:
            score += max(0, 3 - abs(index - cnpj_index)) * 0.5
        if index == 0:
            score += 0.25
        candidates.append((score, index, candidate))

    if not candidates:
        return None

    score, index, candidate = max(candidates)
    if score < 3:
        return None

    return candidate

def is_valid_cnpj(digits):
    if len(digits) != 14 or len(set(digits)) == 1:
        return False
    values = [int(char) for char in digits]
    first_weights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    second_weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    first = sum(value * weight for value, weight in zip(values[:12], first_weights))
    first_digit = (first * 10) % 11
    if first_digit == 10:
        first_digit = 0
    second = sum(value * weight for value, weight in zip(values[:13], second_weights))
    second_digit = (second * 10) % 11
    if second_digit == 10:
        second_digit = 0
    return values[12] == first_digit and values[13] == second_digit

def normalize_cnpj_candidate(value):
    normalized = value.upper().replace(" ", "")
    normalized = normalized.translate(str.maketrans({"O": "0", "Q": "0", "I": "1", "L": "1"}))
    digits = re.sub(r"\D", "", normalized)
    return digits if is_valid_cnpj(digits) else None

def format_document_candidate(digits):
    if len(digits) == 14 and is_valid_cnpj(digits):
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}", "CNPJ"
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}", "CPF"
    return None, None

def cnpj_from_text(text, lines):
    labeled_text = []
    for index, line in enumerate(lines):
        if "CNPJ" in line.upper():
            labeled_text.append(" ".join(lines[index:index + 3]))

    for source in labeled_text:
        for match in re.finditer(
            r"CNPJ(?:/CPF)?\s*[:.]?\s*([0-9OQIL./ -]{11,25})",
            source.upper(),
        ):
            candidate = match.group(1)
            digits = re.sub(r"\D", "", candidate.translate(str.maketrans({"O": "0", "Q": "0", "I": "1", "L": "1"})))
            for length in (14, 11):
                for start in range(0, max(1, len(digits) - length + 1)):
                    formatted, document_type = format_document_candidate(digits[start:start + length])
                    if formatted:
                        return formatted, document_type
    return None, None

def partial_date_from_text(text):
    match = re.search(r"(?<!\d)(\d{2})\s*/\s*(\d{2})(?=\d{4}|\D|$)", text)
    if match:
        day, month = int(match.group(1)), int(match.group(2))
        if 1 <= day <= 31 and 1 <= month <= 12:
            return f"{day:02d}/{month:02d}"
    return None

def date_from_text(text):
    patterns = (
        r"(?<!\d)(\d{2})[./-](\d{2})[./-](20\d{2})",
        r"(?<!\d)(20\d{2})[./-](\d{2})[./-](\d{2})",
    )
    candidates = []
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            if len(match.group(1)) == 4:
                year, month, day = match.group(1), match.group(2), match.group(3)
            else:
                day, month, year = match.group(1), match.group(2), match.group(3)
            try:
                day_number, month_number = int(day), int(month)
                if not (1 <= day_number <= 31 and 1 <= month_number <= 12):
                    continue
            except ValueError:
                continue
            start = max(0, match.start() - 45)
            context = text[start:match.end() + 45].upper()
            score = 0
            if any(marker in context for marker in ("VENDA", "COMPRA", "EMISSAO", "EMISSÃO", "RECIBO")):
                score += 2
            if any(marker in context for marker in ("AUTORIZACAO", "AUTORIZAÇÃO", "VALIDADE")):
                score -= 1
            candidates.append((score, f"{year}-{month}-{day}"))
    return max(candidates)[1] if candidates else None

def parse_nf(text, confidence=0.6):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    cnpj, document_type = cnpj_from_text(text, lines)
    data = date_from_text(text)
    if data is None:
        data = partial_date_from_text(text)
    values = re.findall(r"(?<!\d)(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}", text)
    total_patterns = (
        r"(?:valor\s*total|total\s+pedido|total\s+da\s+(?:compra|nota)|soma)"
        r"\s*(?:r\$|rs)?\s*[:\-]?\s*([0-9][0-9.,]*)",
        r"(?:valor\s*pago|valor)\s*(?:r\$|rs)?\s*[:.\-]?\s*([0-9][0-9.,]*)",
    )
    total = None
    for pattern in total_patterns:
        total_match = re.search(pattern, text, re.IGNORECASE)
        if total_match:
            total = parse_brazilian_value(total_match.group(1))
            if total is not None:
                break
    if total is None and values:
        total = parse_brazilian_value(values[-1])
    fornecedor = supplier_from_text(text, lines)
    result = {"fornecedor": fornecedor, "cnpj": cnpj, "data_compra": data, "valor_total": total, "itens": [], "is_comprovante": "comprovante" in text.lower()}
    if document_type:
        result["documento_tipo"] = document_type
    uncertain = [key for key, value in result.items() if value is None]
    return {"success": True, "confidence": confidence, "data": result, "fieldsUncertain": uncertain, "rawResponse": text}

def main(payload):
    if payload["action"] == "parse_text":
        return parse_nf(payload.get("text", ""))
    image = preprocess(payload["image_path"])
    if payload.get("tesseract_cmd"):
        pytesseract.pytesseract.tesseract_cmd = payload["tesseract_cmd"]
    try:
        text = pytesseract.image_to_string(image, lang=payload.get("language", "por"))
    except Exception as exc:
        raise RuntimeError(f"Tesseract indisponível: {exc}") from exc
    return parse_nf(text)

if __name__ == "__main__":
    try:
        print(json.dumps(main(json.load(sys.stdin)), ensure_ascii=False))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
