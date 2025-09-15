MCP Server

Purpose:
- Serve repository file metadata and chunked content to a local client or LLM.

Quick start:

1) Create a Python virtualenv and install requirements:

python -m venv .venv
source .venv/bin/activate
pip install -r mcp-server/requirements.txt

2) Run the server (from mcp-server directory):

cd mcp-server
# Prefer the venv inside mcp-server if present
if [ -x .venv/bin/python ]; then
  .venv/bin/python -m uvicorn app:app --reload --host 127.0.0.1 --port 8001
else
  # fallback to workspace venv if available
  ../.venv/bin/python -m uvicorn mcp-server.app:app --reload --host 127.0.0.1 --port 8001
fi

Once the server is running, configure Continue to connect to the running endpoint (so Continue only queries the service and does not need to spawn it):

http://127.0.0.1:8001/search?q={query}&content=true

(If Continue has Flatpak networking issues, run the server with --host 0.0.0.0 and use the same URL above.)

3) Example requests:

List files:
curl "http://127.0.0.1:8001/files"

Get a file chunk (first 1000 bytes):
curl "http://127.0.0.1:8001/file?path=README.md&start=0&length=1000"

Notes:
- The server is read-only and only serves files under the repo root.
- Keep it local (127.0.0.1) to avoid exposing your repo.
- Add authentication or rate-limiting if you plan to expose beyond localhost.
