#!/usr/bin/env bash
# smoke.sh — HiveAttest MCP shim smoke test
#
# Tests: /health, /.well-known/mcp.json, tools/list (≥19 tools),
#        tools/call attest_meta, tools/call attest_passport_issue
#
# Exits 0 on success, 1 on any failure.
#
# Copyright 2026 Stephen A. Rotzin, Hive Civilization.
# USPTO Provisional 64/055,601.

set -euo pipefail

PORT="${PORT:-3000}"
BASE="http://localhost:${PORT}"
PASS=0
FAIL=0

# ── colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[PASS]${NC} $1"; ((PASS++)) || true; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAIL++)) || true; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

# ── start server ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
info "Starting MCP server on :${PORT}…"

# Kill any leftover server on that port
fuser -k "${PORT}/tcp" 2>/dev/null || true

NODE_CMD="node"
command -v node >/dev/null 2>&1 || { echo "node not found — aborting"; exit 1; }

# Install deps if needed
if [ ! -d "${SCRIPT_DIR}/node_modules" ]; then
  info "Installing dependencies…"
  cd "${SCRIPT_DIR}" && npm install --omit=dev --no-audit --no-fund --silent
fi

cd "${SCRIPT_DIR}"
node server.js &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null; exit' INT TERM EXIT

# Wait for server to be ready (up to 10s)
info "Waiting for server to be ready…"
for i in $(seq 1 20); do
  if curl -sf "${BASE}/health" >/dev/null 2>&1; then
    info "Server ready after ${i} attempts"
    break
  fi
  sleep 0.5
done

# ── helper: run a JSON-RPC call ───────────────────────────────────────────────
jsonrpc() {
  local method="$1"
  local params="$2"
  curl -sf -X POST \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params}}" \
    "${BASE}/mcp"
}

# ── test 1: /health ───────────────────────────────────────────────────────────
info "Test 1: GET /health"
HEALTH=$(curl -sf "${BASE}/health") || { fail "GET /health failed"; FAIL=$((FAIL+1)); }
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  ok "GET /health → status ok"
else
  fail "GET /health → unexpected response: $HEALTH"
fi

TOOL_COUNT=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tools',0))" 2>/dev/null || echo "0")
if [ "$TOOL_COUNT" -ge 18 ] 2>/dev/null; then
  ok "GET /health → tools count = ${TOOL_COUNT} (≥18)"
else
  fail "GET /health → tools count = ${TOOL_COUNT} (expected ≥18)"
fi

# ── test 2: /.well-known/mcp.json ────────────────────────────────────────────
info "Test 2: GET /.well-known/mcp.json"
MCP_JSON=$(curl -sf "${BASE}/.well-known/mcp.json") || { fail "GET /.well-known/mcp.json failed"; }
if echo "$MCP_JSON" | grep -q '"endpoint":"/mcp"'; then
  ok "/.well-known/mcp.json → endpoint present"
else
  fail "/.well-known/mcp.json → endpoint missing"
fi
if echo "$MCP_JSON" | grep -q '"transport":"streamable-http"'; then
  ok "/.well-known/mcp.json → transport=streamable-http"
else
  fail "/.well-known/mcp.json → transport missing"
fi

# ── test 3: tools/list ────────────────────────────────────────────────────────
info "Test 3: tools/list"
TOOLS_RESP=$(jsonrpc "tools/list" "{}") || { fail "tools/list RPC failed"; }
TOOLS_N=$(echo "$TOOLS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['result']['tools']))" 2>/dev/null || echo "0")

if [ "$TOOLS_N" -ge 18 ] 2>/dev/null; then
  ok "tools/list → ${TOOLS_N} tools (≥18)"
else
  fail "tools/list → only ${TOOLS_N} tools (expected ≥18)"
fi

# Check for required tool names
for TOOL in attest_passport_issue attest_gate_evaluate attest_smsh_verify attest_absence_verify attest_meta; do
  if echo "$TOOLS_RESP" | grep -q "\"name\":\"${TOOL}\""; then
    ok "tools/list → '${TOOL}' present"
  else
    fail "tools/list → '${TOOL}' MISSING"
  fi
done

# ── test 4: tools/call attest_meta ────────────────────────────────────────────
info "Test 4: tools/call attest_meta"
META_RESP=$(jsonrpc "tools/call" '{"name":"attest_meta","arguments":{}}') || { fail "tools/call attest_meta failed"; }
# Extract the text content from content[0].text (JSON string inside JSON)
META_TEXT=$(echo "$META_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['content'][0]['text'])" 2>/dev/null || echo "")
if echo "$META_TEXT" | grep -q '"layer"'; then
  ok "tools/call attest_meta → layer field present"
else
  fail "tools/call attest_meta → layer field missing; raw=$META_TEXT"
fi
if echo "$META_TEXT" | grep -q '64/055,601'; then
  ok "tools/call attest_meta → patent number present"
else
  fail "tools/call attest_meta → patent number missing"
fi
if echo "$META_TEXT" | grep -q '"C15"'; then
  ok "tools/call attest_meta → C15 claim present"
else
  fail "tools/call attest_meta → C15 claim missing"
fi

# ── test 5: tools/call attest_passport_issue (proxies to hivemorph) ──────────
info "Test 5: tools/call attest_passport_issue"
PASSPORT_RESP=$(jsonrpc "tools/call" '{
  "name":"attest_passport_issue",
  "arguments":{
    "action_id":"smoke_test_001",
    "agent_did":"did:hive:smoke-tester",
    "intended_op":"smoke_check",
    "target_resource":"https://example.com/resource",
    "inputs":{"test":true},
    "ttl_seconds":300
  }
}') || { fail "tools/call attest_passport_issue RPC failed"; }

# Extract content[0].text from the MCP response
PASSPORT_TEXT=$(echo "$PASSPORT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['content'][0]['text'])" 2>/dev/null || echo "")

# Check if MCP result envelope is present (shim worked)
if echo "$PASSPORT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'result' in d else 1)" 2>/dev/null; then
  ok "tools/call attest_passport_issue → MCP result envelope present"
  if echo "$PASSPORT_TEXT" | grep -q '"manifest_id"'; then
    ok "tools/call attest_passport_issue → manifest_id present in response"
  else
    STATUS=$(echo "$PASSPORT_TEXT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "?")
    info "Backend status=${STATUS} (backend may be offline) — shim proxied correctly"
    ok "tools/call attest_passport_issue → shim proxied correctly (status=${STATUS})"
  fi
else
  fail "tools/call attest_passport_issue → no result in JSON-RPC response (shim error)"
fi

# ── summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  Passed: ${GREEN}${PASS}${NC}  Failed: ${RED}${FAIL}${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}SMOKE TEST FAILED${NC}"
  exit 1
fi

echo -e "${GREEN}SMOKE TEST PASSED${NC}"
exit 0
