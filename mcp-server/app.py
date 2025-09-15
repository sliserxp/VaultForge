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
