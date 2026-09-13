import json
import sys

payload = json.load(sys.stdin)
print(json.dumps(payload, ensure_ascii=False))
