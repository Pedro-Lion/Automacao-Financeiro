import json
import os
import re
import sys

from PIL import Image

try:
    from google import genai as google_genai
except ImportError:  # pragma: no cover - compatibilidade com ambientes antigos
    google_genai = None

try:
    import google.generativeai as genai
except ImportError:  # pragma: no cover - compatibilidade com ambientes antigos
    genai = None

def build_model_candidates(requested_model):
    preferred = [requested_model] if requested_model else []
    fallback = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
    ordered = []
    seen = set()
    for model_name in preferred + fallback:
        if model_name and model_name not in seen:
            seen.add(model_name)
            ordered.append(model_name)
    return ordered


def parse_json(text):
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL | re.IGNORECASE)
    if fenced:
        cleaned = fenced.group(1)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        starts = [index for index in (cleaned.find("{"), cleaned.find("[")) if index >= 0]
        if starts:
            start = min(starts)
            end = max(cleaned.rfind("}"), cleaned.rfind("]"))
            if end > start:
                try:
                    return json.loads(cleaned[start:end + 1])
                except json.JSONDecodeError:
                    pass
        raise ValueError("Resposta Gemini não é JSON válido.")

def generate(payload):
    api_key = payload.get("api_key") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("Chave GEMINI_API_KEY não configurada.")

    action = payload["action"]
    requested_model = payload.get("model") or "gemini-2.5-flash"
    last_error = None

    if google_genai is not None:
        client = google_genai.Client(api_key=api_key)
        for model_name in build_model_candidates(requested_model):
            try:
                if action == "analyze_image":
                    response = client.models.generate_content(model=model_name, contents=[payload["prompt"], payload["image_path"]])
                    text = getattr(response, "text", "") or ""
                    data = parse_json(text)
                    confidence = min(0.99, max(0.0, sum(value is not None for value in data.values()) / max(1, len(data))))
                    return {"success": True, "confidence": confidence, "data": data, "fieldsUncertain": [key for key, value in data.items() if value is None], "rawResponse": text}
                if action == "classify_text":
                    prompt = f"Classifique em JSON {{'categoria':'','confianca':0.0,'razao':''}}.\nCategorias: {json.dumps(payload['categories'], ensure_ascii=False)}\nTexto: {payload['text']}"
                    response = client.models.generate_content(model=model_name, contents=prompt)
                    data = parse_json(getattr(response, "text", "") or "")
                    return {"success": True, "category": data.get("categoria", "INFORMACAO"), "confidence": float(data.get("confianca", 0)), "reasoning": data.get("razao", "")}
                if action == "extract_text":
                    response = client.models.generate_content(model=model_name, contents=payload["prompt"] + "\n" + payload["text"])
                    data = parse_json(getattr(response, "text", "") or "")
                    return {"success": True, "confidence": 0.85, "data": data, "fieldsUncertain": []}
                if action == "generate_text":
                    response = client.models.generate_content(model=model_name, contents=payload["prompt"] + "\n" + json.dumps(payload.get("context", {}), ensure_ascii=False))
                    return {"text": getattr(response, "text", "") or ""}
                raise ValueError(f"Ação Gemini inválida: {action}")
            except Exception as exc:  # pragma: no cover - tenta modelos alternativos
                last_error = exc
                continue
        raise last_error or ValueError("Falha ao invocar Gemini.")

    if genai is None:
        raise RuntimeError("Dependência do Gemini não instalada. Execute: pip install google-generativeai")

    genai.configure(api_key=api_key)
    for model_name in build_model_candidates(requested_model):
        try:
            model = genai.GenerativeModel(model_name)
            if action == "analyze_image":
                response = model.generate_content([payload["prompt"], Image.open(payload["image_path"])])
                data = parse_json(response.text)
                confidence = min(0.99, max(0.0, sum(value is not None for value in data.values()) / max(1, len(data))))
                return {"success": True, "confidence": confidence, "data": data, "fieldsUncertain": [key for key, value in data.items() if value is None], "rawResponse": response.text}
            if action == "classify_text":
                prompt = f"Classifique em JSON {{'categoria':'','confianca':0.0,'razao':''}}.\nCategorias: {json.dumps(payload['categories'], ensure_ascii=False)}\nTexto: {payload['text']}"
                response = model.generate_content(prompt)
                data = parse_json(response.text)
                return {"success": True, "category": data.get("categoria", "INFORMACAO"), "confidence": float(data.get("confianca", 0)), "reasoning": data.get("razao", "")}
            if action == "extract_text":
                response = model.generate_content(payload["prompt"] + "\n" + payload["text"])
                data = parse_json(response.text)
                return {"success": True, "confidence": 0.85, "data": data, "fieldsUncertain": []}
            if action == "generate_text":
                return {"text": model.generate_content(payload["prompt"] + "\n" + json.dumps(payload.get("context", {}), ensure_ascii=False)).text}
            raise ValueError(f"Ação Gemini inválida: {action}")
        except Exception as exc:  # pragma: no cover - tenta modelos alternativos
            last_error = exc
            continue
    raise last_error or ValueError("Falha ao invocar Gemini.")

if __name__ == "__main__":
    try:
        print(json.dumps(generate(json.load(sys.stdin)), ensure_ascii=False))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
