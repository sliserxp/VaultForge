from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
from pathlib import Path
import os

app = FastAPI(title="MCP Server", description="Serve repo file metadata and chunked content")

ROOT = Path(__file__).resolve().parent.parent

class FileEntry(BaseModel):
    path: str
    size: int
    mtime: float


def safe_path(path: str) -> Path:
    p = (ROOT / path).resolve()
    if not str(p).startswith(str(ROOT)):
        raise HTTPException(status_code=400, detail="Invalid path")
    return p


@app.get("/files", response_model=List[FileEntry])
def list_files(prefix: Optional[str] = Query(None, description="Filter by path prefix")):
    entries = []
    for p in ROOT.rglob("*"):
        if p.is_file():
            rel = str(p.relative_to(ROOT))
            if prefix and not rel.startswith(prefix):
                continue
            stat = p.stat()
            entries.append(FileEntry(path=rel, size=stat.st_size, mtime=stat.st_mtime))
    return entries


@app.get("/file")
def get_file(path: str = Query(...), start: int = 0, length: Optional[int] = None):
    p = safe_path(path)
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    size = p.stat().st_size
    if start < 0 or start > size:
        raise HTTPException(status_code=400, detail="Invalid start")
    with p.open("rb") as f:
        f.seek(start)
        data = f.read(length) if length else f.read()
    # Return base64 to keep binary-safe if needed; for now return text when possible
    try:
        text = data.decode("utf-8")
        return JSONResponse({"path": path, "start": start, "length": len(data), "data": text})
    except UnicodeDecodeError:
        import base64

        return JSONResponse({"path": path, "start": start, "length": len(data), "data_b64": base64.b64encode(data).decode("ascii")})

@app.get("/search")
def search(q: str = Query(..., description="search term"), prefix: Optional[str] = Query(None, description="filter by path prefix"), limit: int = 50, content: bool = Query(False, description="also search file contents")):
    """
    Filename/path and optional content search (case-insensitive).
    If content=True, scan text files for occurrences and return snippets with line numbers.
    """
    ql = q.lower()
    results = []
    for p in ROOT.rglob("*"):
        if p.is_file():
            rel = str(p.relative_to(ROOT))
            if prefix and not rel.startswith(prefix):
                continue
            matched = False
            entry = {"path": rel, "matches": []}
            # path match
            if ql in rel.lower():
                entry["matches"].append({"matched_in": "path"})
                matched = True
            if content:
                try:
                    text = p.read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    text = None
                if text:
                    lines = text.splitlines()
                    occ = 0
                    for i, line in enumerate(lines):
                        if ql in line.lower():
                            start = max(0, i - 2)
                            end = min(len(lines), i + 3)
                            snippet = "\n".join(lines[start:end])
                            entry["matches"].append({"matched_in": "content", "line": i + 1, "snippet": snippet})
                            occ += 1
                            matched = True
                            if occ >= 3:
                                break
            if matched:
                results.append(entry)
            if len(results) >= limit:
                break
    return {"query": q, "count": len(results), "results": results}
