"""Write the API contract to api/openapi.json so the web app can type it without a live API."""

import json
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))

from app.main import app  # noqa: E402

out = API_DIR / "openapi.json"
out.write_text(json.dumps(app.openapi(), indent=2) + "\n")
print(f"Wrote {out.relative_to(API_DIR)}")
