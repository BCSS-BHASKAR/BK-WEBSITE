#!/usr/bin/env python3

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("{}", end="")
        return 1

    db_path = Path(sys.argv[1])
    try:
        det_ids = json.loads(sys.argv[2])
    except json.JSONDecodeError:
        print("{}", end="")
        return 1

    if not db_path.is_file() or not det_ids:
        print("{}", end="")
        return 0

    ids = sorted({int(x) for x in det_ids if str(x).isdigit() or isinstance(x, int)})
    if not ids:
        print("{}", end="")
        return 0

    placeholders = ",".join("?" for _ in ids)
    out: dict[str, str] = {}

    with sqlite3.connect(str(db_path)) as conn:
        rows = conn.execute(
            f"SELECT id, extra FROM detections WHERE id IN ({placeholders})",
            ids,
        ).fetchall()
        for det_id, extra_raw in rows:
            frame_path = ""
            try:
                extra = json.loads(extra_raw or "{}")
                frame_path = str(extra.get("frame_path") or "").strip()
            except Exception:
                frame_path = ""
            if frame_path:
                out[str(int(det_id))] = frame_path

    print(json.dumps(out), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
