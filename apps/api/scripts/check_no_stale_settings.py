#!/usr/bin/env python
"""
Guard against the stale-singleton class of bug.

Fails if:
  1. get_settings() is decorated with @lru_cache
  2. app/graph/client.py defines a module-level `_driver` singleton
  3. any module-level `from app.config.settings import settings` appears
     in app/graph/
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors = []

settings_py_path = ROOT / "app" / "config" / "settings.py"
settings_py = settings_py_path.read_text(encoding="utf-8")
lines = settings_py.splitlines()
for i, line in enumerate(lines):
    if "def get_settings" in line:
        for prev in range(max(0, i - 3), i):
            if "@lru_cache" in lines[prev]:
                errors.append(f"{settings_py_path}: get_settings must not be @lru_cache")

client_py_path = ROOT / "app" / "graph" / "client.py"
client_py = client_py_path.read_text(encoding="utf-8")
for line in client_py.splitlines():
    s = line.strip()
    if s.startswith("_driver = ") and "None" not in s:
        errors.append(
            "app/graph/client.py defines a module-level _driver singleton — "
            "the bug pattern that caused phantom DatabaseNotFound."
        )

graph_dir = ROOT / "app" / "graph"
if graph_dir.exists():
    for py in graph_dir.glob("*.py"):
        text = py.read_text(encoding="utf-8")
        if "from app.config.settings import settings" in text:
            errors.append(
                f"{py.relative_to(ROOT)} imports `settings` at module scope — "
                f"use `get_settings()` inside functions instead."
            )

if errors:
    print("Preflight check FAILED:\n")
    for e in errors:
        print(f"  ✗ {e}")
    sys.exit(1)

print("Preflight check passed — no stale-singleton patterns found.")
