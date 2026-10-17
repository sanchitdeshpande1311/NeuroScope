import os
import sys
import threading
import uvicorn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
for p in [PROJECT_ROOT, BASE_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.main import app

def run_port(port: int):
    try:
        config = uvicorn.Config(app=app, host="0.0.0.0", port=port, log_level="info")
        server = uvicorn.Server(config)
        server.run()
    except Exception as e:
        print(f"Error on port {port}: {e}", flush=True)

if __name__ == "__main__":
    print("Tumor Tracker NIfTI Backend listening on http://0.0.0.0:8008...", flush=True)
    run_port(8008)
