MCP Server

Purpose:
- Serve repository file metadata and chunked content to a local client or LLM.

Quick start:

1) Create a Python virtualenv and install requirements:

python -m venv .venv
source .venv/bin/activate
pip install -r mcp-server/requirements.txt

2) Run the server (from repo root):

uvicorn mcp-server.app:app --reload --host 127.0.0.1 --port 8001

3) Example requests:

List files:
curl "http://127.0.0.1:8001/files"

Get a file chunk (first 1000 bytes):
curl "http://127.0.0.1:8001/file?path=README.md&start=0&length=1000"

Notes:
- The server is read-only and only serves files under the repo root.
- Keep it local (127.0.0.1) to avoid exposing your repo.
- Add authentication or rate-limiting if you plan to expose beyond localhost.
