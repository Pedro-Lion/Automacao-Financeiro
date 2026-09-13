import json
import os
import sys

import cv2
import numpy as np
from PIL import Image
from paddleocr import PaddleOCR

from tesseract_ocr import parse_nf


def extract_text(payload):
    ocr = PaddleOCR(
        ocr_version=payload.get("ocr_version", "PP-OCRv4"),
        lang=payload.get("language", "pt"),
        use_angle_cls=True,
        show_log=False,
    )
    image_path = os.path.abspath(payload["image_path"])
    image = cv2.cvtColor(np.array(Image.open(image_path).convert("RGB")), cv2.COLOR_RGB2BGR)
    result = ocr.ocr(image, cls=True)
    lines = []
    confidences = []
    for page in result or []:
        for item in page or []:
            if len(item) < 2:
                continue
            text, confidence = item[1]
            lines.append(text)
            confidences.append(float(confidence))
    text = "\n".join(lines)
    confidence = sum(confidences) / len(confidences) if confidences else 0.0
    parsed = parse_nf(text, confidence)
    parsed["engine"] = "paddleocr"
    parsed["model"] = payload.get("ocr_version", "PP-OCRv4")
    parsed["wordCount"] = len(confidences)
    return parsed


if __name__ == "__main__":
    try:
        print(json.dumps(extract_text(json.load(sys.stdin)), ensure_ascii=False))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
