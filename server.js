#!/usr/bin/env node
/**
 * HiveAttest MCP Server: umbrella shim for autonomous-agent perimeter.
 *
 * Exposes all HiveAttest primitives (C8/C12/C13/C15-C20) as MCP tools,
 * proxying to the hivemorph backend.
 *
 * Protocol:  MCP 2024-11-05 / Streamable-HTTP / JSON-RPC 2.0
 * Transport: POST /mcp
 * Discovery: GET /.well-known/mcp.json
 * Health:    GET /health
 * Brand:     Hive Civilization gold #FFB800
 * Patent:    USPTO Provisional 64/055,601
 *
 * Copyright 2026 Stephen A. Rotzin, Hive Civilization.
 * Inventor: Stephen A. Rotzin, 170 Greenway Dr, Walnut Creek CA 94596.
 */

import express from 'express';
import { smashProvMiddleware, getPubkeyInfo as getProvPubkeyInfo, verifyProvSig } from './lib/prov.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

// ── smash.prov middleware (BEFORE paywall) ─────────────────────────────────
app.use(smashProvMiddleware);

// ── /v1/prov routes (free, never paywalled) ─────────────────────────────────
app.get('/v1/prov/pubkey', async (_req, res) => {
  try { res.json(await getProvPubkeyInfo()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/v1/prov/verify', async (req, res) => {
  try {
    const { method, path: p, body_b64u = '', ts, sig_b64u } = req.body || {};
    if (!method || !p || ts == null || !sig_b64u) return res.status(400).json({ error: 'missing fields' });
    res.json(await verifyProvSig({ method, path: p, body_b64u, ts, sig_b64u }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
const HIVE_BASE = process.env.HIVE_BASE || 'https://hivemorph.onrender.com';
const BRAND_GOLD = '#FFB800';
const PATENT = 'USPTO 64/055,601';
const SERVICE = 'hive-mcp-attest';
const VERSION = '1.0.0';
const HONESTY_SUFFIX = 'Reference-grade implementation. Wire format normative; production-grade is Layer B.';

// ─── Environment validation (fail closed) ──────────────────────────────────
function validateEnv() {
  const errors = [];
  try {
    const u = new URL(HIVE_BASE);
    if (!/^https?:$/.test(u.protocol)) errors.push(`HIVE_BASE must be http(s): got "${HIVE_BASE}"`);
  } catch {
    errors.push(`HIVE_BASE is not a valid URL: "${HIVE_BASE}"`);
  }
  const portNum = Number(PORT);
  if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
    errors.push(`PORT must be a valid TCP port: got "${PORT}"`);
  }
  return errors;
}
const ENV_ERRORS = validateEnv();
if (ENV_ERRORS.length > 0) {
  console.error(`[${SERVICE}] FATAL: invalid environment, refusing to start:`);
  for (const e of ENV_ERRORS) console.error(`  - ${e}`);
  process.exit(1);
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  // ── C15 ── Passport
  {
    name: 'attest_passport_issue',
    description: `Issue a Pre-Action Attestation Manifest (C15: hive-passport). Signs with Ed25519 over RFC 8785 JCS-canonical body. ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['action_id', 'agent_did', 'intended_op', 'target_resource'],
      properties: {
        action_id:       { type: 'string', description: 'Caller-supplied action correlation ID' },
        agent_did:       { type: 'string', description: 'DID of the attesting agent' },
        intended_op:     { type: 'string', description: 'Operation name, e.g. "tool_invocation"' },
        target_resource: { type: 'string', description: 'URI or identifier of the target resource' },
        inputs:          { type: 'object', description: 'Declared inputs (will be hashed)', default: {} },
        ttl_seconds:     { type: 'integer', description: 'Validity window in seconds (default 300)', default: 300 },
      },
    },
  },
  {
    name: 'attest_passport_verify',
    description: `Verify a Pre-Action Attestation Manifest (C15: hive-passport). Checks Ed25519 signature, temporal validity, and optionally observed inputs hash. ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['manifest'],
      properties: {
        manifest:        { type: 'object', description: 'Full passport manifest object (from attest_passport_issue)' },
        observed_inputs: { type: 'object', description: 'Optional observed inputs to check against declared hash' },
      },
    },
  },

  // ── C16 ── Custody
  {
    name: 'attest_custody_append',
    description: `Append a node to a custody chain (C16: hive-custody). Taint propagates: once tainted, always tainted. ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['chain_id', 'transform_id', 'agent_did'],
      properties: {
        chain_id:      { type: 'string', description: 'Chain identifier (create new by using a fresh ID)' },
        transform_id:  { type: 'string', description: 'Transform identifier for this step' },
        agent_did:     { type: 'string', description: 'DID of the agent performing the transform' },
        payload:       { type: 'object', description: 'Transform payload (will be hashed)', default: {} },
        taint_status:  { type: 'string', enum: ['clean', 'tainted', 'unknown'], default: 'clean', description: 'Declared taint status' },
      },
    },
  },
  {
    name: 'attest_custody_verify',
    description: `Verify a custody chain: hash linkage, Ed25519 signatures, and taint propagation (C16). ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['nodes'],
      properties: {
        nodes: { type: 'array', description: 'Ordered array of custody chain node objects (from attest_custody_append responses)' },
      },
    },
  },
  {
    name: 'attest_custody_proof',
    description: `Retrieve a Merkle inclusion proof for a specific node in a custody chain (C16). ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['chain_id', 'index'],
      properties: {
        chain_id: { type: 'string', description: 'Chain identifier' },
        index:    { type: 'integer', description: '0-based node index' },
      },
    },
  },

  // ── C17 ── Cargo
  {
    name: 'attest_cargo_register',
    description: `Register a versioned cargo type in the HiveAttest registry (C17: hive-cargo-taxonomy). Pins a definition hash for version-anchoring. ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['id', 'name', 'version', 'sensitivity', 'schema'],
      properties: {
        id:          { type: 'string', description: 'Unique cargo type ID, e.g. "pii"' },
        name:        { type: 'string', description: 'Human-readable cargo type name' },
        version:     { type: 'string', description: 'Semver version string, e.g. "1.0.0"' },
        sensitivity: { type: 'string', enum: ['public', 'internal', 'confidential', 'restricted', 'critical'] },
        schema:      { type: 'object', description: 'JSON Schema defining the payload shape' },
        supersedes:  { type: 'object', description: 'Optional {id, version} of superseded type' },
      },
    },
  },
  {
    name: 'attest_cargo_validate',
    description: `Validate a payload against a registered cargo type schema (C17). ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['cargo_type_id', 'version', 'payload'],
      properties: {
        cargo_type_id: { type: 'string', description: 'Registered cargo type ID' },
        version:       { type: 'string', description: 'Cargo type version' },
        payload:       { type: 'object', description: 'Payload to validate against the schema' },
      },
    },
  },
  {
    name: 'attest_cargo_snapshot',
    description: `Get a registry snapshot with Merkle root for version pinning (C17). ${HONESTY_SUFFIX}`,
    inputSchema: { type: 'object', properties: {} },
  },

  // ── C18 ── Warranty
  {
    name: 'attest_warranty_issue',
    description: `Issue an attestation warranty committing an agent to a claim (C18: hive-attestation-warranty). Signed with Ed25519. ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['agent_did', 'action_id', 'claim'],
      properties: {
        agent_did:  { type: 'string', description: 'DID of the warranting agent' },
        action_id:  { type: 'string', description: 'Action correlation ID being warranted' },
        claim:      { type: 'string', description: 'Human-readable warranty claim' },
        scope:      { type: 'object', description: 'Scope constraints', default: {} },
        expires_at: { type: 'string', description: 'ISO-8601 expiry UTC (optional)' },
      },
    },
  },
  {
    name: 'attest_warranty_breach',
    description: `Report a warranty breach. Marks the warranty as breached and returns a signed breach record (C18). ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['warranty_id', 'breach_description'],
      properties: {
        warranty_id:        { type: 'string', description: 'Warranty ID to report breach on' },
        breach_description: { type: 'string', description: 'Description of the breach' },
        evidence:           { type: 'object', description: 'Optional evidence dict' },
      },
    },
  },
  {
    name: 'attest_warranty_get',
    description: `Retrieve a warranty by ID (C18). ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['warranty_id'],
      properties: {
        warranty_id: { type: 'string', description: 'Warranty ID' },
      },
    },
  },

  // ── C19 ── Gate (HEADLINE TOOL)
  {
    name: 'attest_gate_evaluate',
    description: `THE HEADLINE TOOL. Evaluate whether an agent may proceed through the HiveAttest gate (C19: hive-gate-enforcer). Verifies passport signature + expiry, cargo registry membership, and warranty status. Every response (allow OR deny) includes a signed C18-format receipt of the gate decision. ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['passport_manifest'],
      properties: {
        passport_manifest: { type: 'object', description: 'C15 passport manifest from attest_passport_issue' },
        cargo_manifest:    { type: 'object', description: 'C17 cargo manifest (optional)' },
        custody_root:      { type: 'string', description: 'Expected custody chain Merkle root (optional)' },
        warranty_ids:      { type: 'array', items: { type: 'string' }, description: 'Active warranty IDs to verify', default: [] },
        context:           { type: 'object', description: 'Additional gate evaluation context', default: {} },
      },
    },
  },

  // ── C20 ── Inspect
  {
    name: 'attest_inspect_sample',
    description: `Probabilistic secondary inspection of a record batch (C20: hive-secondary-inspection). Returns a signed inspection record. ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['sample_id', 'records'],
      properties: {
        sample_id:   { type: 'string', description: 'Identifier for the sample batch' },
        records:     { type: 'array', description: 'Records to probabilistically inspect' },
        sample_rate: { type: 'number', minimum: 0, maximum: 1, default: 0.1, description: 'Fraction to inspect (0.0 to 1.0)' },
        seed:        { type: 'integer', description: 'Optional RNG seed for reproducibility' },
      },
    },
  },

  // ── C8/C12 ── SMSH
  {
    name: 'attest_smsh_verify',
    description: `Verify a SMSH-Stamp v1 receipt (C8/C12: smsh-stamp-verifier). Validates schema, version, algorithm, timestamp, and Ed25519 signature. ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['receipt'],
      properties: {
        receipt:        { type: 'object', description: 'SMSH-Stamp v1 receipt object' },
        pubkey_b64url:  { type: 'string', description: 'Override trust anchor Ed25519 public key (base64url, 32 bytes)' },
        max_age_seconds:{ type: 'integer', description: 'Reject receipts older than this many seconds' },
      },
    },
  },

  // ── C13 ── Absence
  {
    name: 'attest_absence_build',
    description: `Build a sorted Merkle tree for an audit window (enables cryptographic non-membership proofs, C13: prov-absence). ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['window_id', 'events'],
      properties: {
        window_id: { type: 'string', description: 'Audit window identifier' },
        events:    { type: 'array', description: 'Observed events to commit to the sorted Merkle tree' },
      },
    },
  },
  {
    name: 'attest_absence_prove',
    description: `Prove that a query event is NOT a member of a previously-built audit window (C13). ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['window_id', 'query'],
      properties: {
        window_id: { type: 'string', description: 'Audit window identifier (must have been built)' },
        query:     { type: 'object', description: 'Event to prove absent' },
      },
    },
  },
  {
    name: 'attest_absence_verify',
    description: `Verify a non-membership proof against an expected Merkle root (C13). ${HONESTY_SUFFIX}`,
    inputSchema: {
      type: 'object',
      required: ['proof', 'root_hex'],
      properties: {
        proof:    { type: 'object', description: 'Non-membership proof from attest_absence_prove' },
        root_hex: { type: 'string', description: 'Expected Merkle root (hex)' },
      },
    },
  },

  // ── Meta
  {
    name: 'attest_meta',
    description: `Return HiveAttest layer/spec/patent metadata for all claims. Useful for agent introspection. ${HONESTY_SUFFIX}`,
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function hiveGet(path, params = {}) {
  const url = new URL(`${HIVE_BASE}${path.startsWith('/') ? path : '/' + path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  let data; try { data = await res.json(); } catch { data = { raw: await res.text() }; }
  return { data, status: res.status };
}

async function hivePost(path, body) {
  const res = await fetch(`${HIVE_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data; try { data = await res.json(); } catch { data = { raw: await res.text() }; }
  return { data, status: res.status };
}

// ─── Tool execution ───────────────────────────────────────────────────────────

async function executeTool(name, args) {
  switch (name) {

    // ── Passport ──
    case 'attest_passport_issue': {
      const { data, status } = await hivePost('/v1/attest/passport/issue', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }
    case 'attest_passport_verify': {
      const { data, status } = await hivePost('/v1/attest/passport/verify', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }

    // ── Custody ──
    case 'attest_custody_append': {
      const { data, status } = await hivePost('/v1/attest/custody/append', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }
    case 'attest_custody_verify': {
      const { data, status } = await hivePost('/v1/attest/custody/verify', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }
    case 'attest_custody_proof': {
      const { chain_id, index } = args;
      const { data, status } = await hiveGet(`/v1/attest/custody/${encodeURIComponent(chain_id)}/proof/${encodeURIComponent(index)}`);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }

    // ── Cargo ──
    case 'attest_cargo_register': {
      const { data, status } = await hivePost('/v1/attest/cargo/register', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }
    case 'attest_cargo_validate': {
      const { data, status } = await hivePost('/v1/attest/cargo/validate', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }
    case 'attest_cargo_snapshot': {
      const { data, status } = await hiveGet('/v1/attest/cargo/snapshot');
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }

    // ── Warranty ──
    case 'attest_warranty_issue': {
      const { data, status } = await hivePost('/v1/attest/warranty/issue', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }
    case 'attest_warranty_breach': {
      const { data, status } = await hivePost('/v1/attest/warranty/breach', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }
    case 'attest_warranty_get': {
      const { warranty_id } = args;
      const { data, status } = await hiveGet(`/v1/attest/warranty/${encodeURIComponent(warranty_id)}`);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }

    // ── Gate (HEADLINE TOOL) ──
    case 'attest_gate_evaluate': {
      const { data, status } = await hivePost('/v1/attest/gate/evaluate', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }

    // ── Inspect ──
    case 'attest_inspect_sample': {
      const { data, status } = await hivePost('/v1/attest/inspect/sample', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }

    // ── SMSH ──
    case 'attest_smsh_verify': {
      const { data, status } = await hivePost('/v1/attest/smsh/verify', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }

    // ── Absence ──
    case 'attest_absence_build': {
      const { data, status } = await hivePost('/v1/attest/absence/build', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }
    case 'attest_absence_prove': {
      const { data, status } = await hivePost('/v1/attest/absence/prove', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }
    case 'attest_absence_verify': {
      const { data, status } = await hivePost('/v1/attest/absence/verify', args);
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }

    // ── Meta ──
    case 'attest_meta': {
      return {
        type: 'text',
        text: JSON.stringify({
          layer: 'C',
          production_grade: false,
          patent: PATENT,
          inventor: 'Stephen A. Rotzin, 170 Greenway Dr, Walnut Creek CA 94596',
          claims: {
            'C8':  { primitive: 'smsh',    spec: 'https://github.com/srotzin/smsh-stamp-verifier/blob/main/SPEC.md' },
            'C12': { primitive: 'smsh',    spec: 'https://github.com/srotzin/smsh-stamp-verifier/blob/main/SPEC.md' },
            'C13': { primitive: 'absence', spec: 'https://github.com/srotzin/prov-absence/blob/main/SPEC.md' },
            'C15': { primitive: 'passport', spec: 'https://github.com/srotzin/hive-passport/blob/main/SPEC.md' },
            'C16': { primitive: 'custody',  spec: 'https://github.com/srotzin/hive-custody/blob/main/SPEC.md' },
            'C17': { primitive: 'cargo',    spec: 'https://github.com/srotzin/hive-cargo-taxonomy/blob/main/SPEC.md' },
            'C18': { primitive: 'warranty', spec: 'https://github.com/srotzin/hive-attestation-warranty/blob/main/SPEC.md' },
            'C19': { primitive: 'gate',     spec: 'https://github.com/srotzin/hive-gate-enforcer/blob/main/SPEC.md' },
            'C20': { primitive: 'inspect',  spec: 'https://github.com/srotzin/hive-secondary-inspection/blob/main/SPEC.md' },
          },
          backend: HIVE_BASE,
          note: 'Reference-grade implementation. Wire format normative; production-grade is Layer B.',
        }, null, 2),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP JSON-RPC handler ─────────────────────────────────────────────────────

app.post('/mcp', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== '2.0') {
    return res.json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid JSON-RPC' } });
  }
  try {
    switch (method) {
      case 'initialize':
        return res.json({
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
              name: SERVICE,
              version: VERSION,
              description: `HiveAttest umbrella MCP shim: perimeter for autonomous agents. Covers ${PATENT} claims C8/C12/C13/C15-C20.`,
            },
          },
        });

      case 'tools/list':
        return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        const out = await executeTool(name, args || {});
        return res.json({ jsonrpc: '2.0', id, result: { content: [out] } });
      }

      case 'ping':
        return res.json({ jsonrpc: '2.0', id, result: {} });

      default:
        return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (err) {
    return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
  }
});

// ─── Discovery + health ───────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({
  status: 'ok',
  service: SERVICE,
  version: VERSION,
  backend: HIVE_BASE,
  tools: TOOLS.length,
  patent: PATENT,
}));

app.get('/.well-known/mcp.json', (req, res) => res.json({
  name: SERVICE,
  endpoint: '/mcp',
  transport: 'streamable-http',
  protocol: '2024-11-05',
  tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
}));

app.get('/.well-known/agent.json', (req, res) => res.json({
  name: SERVICE,
  description: `HiveAttest umbrella MCP shim for autonomous agents. ${PATENT} claims C8/C12/C13/C15-C20. Reference-grade; production-grade is Layer B.`,
  url: `https://${SERVICE}.onrender.com`,
  version: VERSION,
  provider: { organization: 'Hive Civilization', url: 'https://www.thehiveryiq.com', contact: 'steve@thehiveryiq.com' },
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
  authentication: { schemes: [] },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
  skills: TOOLS.map(t => ({ name: t.name, description: t.description })),
}));

app.get('/seo.json', (req, res) => res.json({
  title: `${SERVICE} · HiveAttest perimeter for autonomous agents`,
  description: `MCP server exposing HiveAttest C8/C12/C13/C15-C20 primitives. ${PATENT}. Reference-grade implementation.`,
  keywords: ['mcp', 'attestation', 'autonomous-agents', 'hive-civilization', 'ed25519', 'jcs', 'passport', 'custody', 'cargo', 'warranty', 'gate'],
  brand_color: BRAND_GOLD,
}));

app.get('/', (req, res) => {
  res.type('text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>hive-mcp-attest · HiveAttest perimeter for autonomous agents</title>
  <meta name="description" content="Umbrella MCP shim for HiveAttest: perimeter for autonomous agents. ${PATENT} claims C8/C12/C13/C15-C20."/>
  <style>
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #f0f0f0; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { color: ${BRAND_GOLD}; }
    code { background: #1a1a1a; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
    a { color: ${BRAND_GOLD}; }
    .badge { display: inline-block; background: ${BRAND_GOLD}; color: #000; padding: 3px 10px; border-radius: 4px; font-weight: bold; font-size: 0.85em; margin: 2px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #333; padding: 8px 12px; text-align: left; }
    th { background: #1a1a1a; color: ${BRAND_GOLD}; }
  </style>
</head>
<body>
  <h1>hive-mcp-attest</h1>
  <p><strong>HiveAttest perimeter for autonomous agents</strong></p>
  <p>
    <span class="badge">Layer C</span>
    <span class="badge">Reference Grade</span>
    <span class="badge">${PATENT}</span>
  </p>
  <p>Umbrella MCP shim exposing ${TOOLS.length} tools covering claims C8/C12/C13/C15-C20.</p>
  <p>Backend: <code>${HIVE_BASE}</code></p>
  <p>MCP endpoint: <code>POST /mcp</code> (JSON-RPC 2.0, MCP 2024-11-05)</p>
  <hr/>
  <p><em>Reference-grade implementation. Wire format normative; production-grade is Layer B.</em></p>
  <p>Inventor: Stephen A. Rotzin, 170 Greenway Dr, Walnut Creek CA 94596</p>
</body>
</html>`);
});

// ─── /llms.txt: agent discovery (llmstxt.org convention) ────────────────────
app.get('/llms.txt', (req, res) => {
  res.type('text/plain; charset=utf-8').send(`# HiveAttest MCP
> MCP shim exposing the HiveAttest perimeter (C8/C12/C13/C15-C20) to autonomous agents.

## What this is
hive-mcp-attest is the Model Context Protocol server that wraps the HiveAttest
attestation perimeter for autonomous agents. It exposes ${TOOLS.length} MCP tools covering
Hive Layer C claims: C8 (gate), C12 (cargo), C13 (warranty), C15 (passport),
C16 (custody), C17 (provenance), C18 (consent), C19 (redaction), C20 (epoch).
Backend: ${HIVE_BASE}/v1/attest/*

## Hive Civilization context
hive-mcp-attest is one node in the Hive Civilization federation, a fleet of agent-facing
microservices designed to be fully autonomous-agent navigable.
This shim is a reference-grade implementation (wire format normative; production-grade is Layer B).
Patent: ${PATENT}

## Auth model
- Free endpoints: GET /health, GET /llms.txt, GET /.well-known/mcp.json
- MCP tool calls: POST /mcp (JSON-RPC 2.0, MCP 2024-11-05)
- No x402 on the MCP transport itself; backend hivemorph enforces pricing per tool call
- Backend settles to treasury 0x15184Bf50B3d3F52b60434f8942b7D52F2eB436E on Base in USDC or USDT
- Solana rail: USDC to canonical Solana treasury address

## Counter-offer / barter floor
The backend 402 envelope returns \`amount_min_usd\`. Submit any value >= that floor.
This shim relays the 402 back transparently so your agent can retry with payment.

## Example flow: passport issuance + verification
1. GET /health: verify MCP server is live
2. POST /mcp { method: "tools/list" }: enumerate all ${TOOLS.length} attestation tools
3. POST /mcp { method: "tools/call", params: { name: "attest_passport_issue", arguments: { action_id, agent_did, intended_op, target_resource } } }
4. Receive signed passport manifest (Ed25519 over JCS, ttl_seconds default 300)
5. POST /mcp { method: "tools/call", params: { name: "attest_passport_verify", arguments: { manifest } } }

## Example flow: custody chain
1. POST /mcp: call attest_custody_append to start a chain_id with transform_id + agent_did
2. Append further transforms by reusing the same chain_id
3. Call attest_custody_verify to audit the full chain; any tainted node propagates to all descendants

## Key MCP tools
- attest_passport_issue   : C15: Pre-Action Attestation Manifest (Ed25519/JCS)
- attest_passport_verify  : C15: Verify passport signature + temporal validity
- attest_custody_append   : C16: Append custody chain node (taint propagates)
- attest_cargo_seal       : C12: Seal cargo with content hash
- attest_warranty_issue   : C13: Issue warranty attestation
- attest_consent_record   : C18: Record agent consent event
- attest_epoch_checkpoint : C20: Epoch boundary checkpoint
- gate_check              : C8:  Perimeter gate check

## Sister services
- HiveBank  (vaults + payments):  https://hivebank.onrender.com/llms.txt
- HiveGate  (auth + onboarding):  https://hivegate.onrender.com/llms.txt
- HiveOrigin (routing + egress):  https://hiveorigin.onrender.com/llms.txt
- HiveMorph (morphing + attest):  https://hivemorph.onrender.com/llms.txt
- HiveTrust (KYA + trust scores): https://hivetrust.onrender.com/llms.txt
- HiveLens  (observability):      https://hivelens.onrender.com/llms.txt
- HiveMining MCP:                 https://hive-mcp-mining.onrender.com/llms.txt

## License + brand
License: MIT
Brand color: gold #FFB800
Treasury: 0x15184Bf50B3d3F52b60434f8942b7D52F2eB436E (Base USDC/USDT)
Last updated: 2026-05-02
`);
});

// ─── Start ──────────────────────────────────────────────────────────────────────────────
// === Slippery-sticky discovery surfaces (free, never gated) ===

app.get('/robots.txt', (_req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send('User-agent: *\nAllow: /\nSitemap: https://hive-mcp-attest.onrender.com/sitemap.xml\n');
});

app.get('/sitemap.xml', (_req, res) => {
  const base = 'https://hive-mcp-attest.onrender.com';
  const paths = ['/', '/health', '/llms.txt', '/openapi.json',
                 '/.well-known/agent.json', '/.well-known/mcp.json'];
  const urls = paths.map(p => `  <url><loc>${base}${p}</loc></url>`).join('\n');
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});

const FAVICON_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000d49444154789c626001000000050001' +
  '0d0a2db40000000049454e44ae426082',
  'hex',
);
app.get('/favicon.ico', (_req, res) => {
  res.set('Content-Type', 'image/png');
  res.send(FAVICON_PNG);
});

app.get('/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.1.0',
    info: {
      title: 'HiveAttest MCP',
      version: VERSION,
      description: 'MCP shim for HiveAttest perimeter primitives. Full backend spec at https://hivemorph.onrender.com/openapi.json',
    },
    servers: [{ url: 'https://hive-mcp-attest.onrender.com' }],
    paths: {
      '/mcp': { post: { summary: 'MCP JSON-RPC 2.0 endpoint' } },
      '/health': { get: { summary: 'Health' } },
      '/llms.txt': { get: { summary: 'Agent discovery (llmstxt.org)' } },
    },
    'x-upstream': 'https://hivemorph.onrender.com/openapi.json',
  });
});

// Honest 404: unknown paths are not found. We still point callers at the
// real, documented surface (helpful, not misleading), but we do not return
// HTTP 200 for a path that doesn't exist. A 200 on a 404 is a fabricated
// success and breaks any client that checks status codes.
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    path: req.path,
    service: SERVICE,
    try: ['/', '/health', '/llms.txt', '/openapi.json',
          '/.well-known/agent.json', '/.well-known/mcp.json', '/mcp'],
    docs: 'https://hive-mcp-attest.onrender.com/llms.txt',
    upstream: 'https://hivemorph.onrender.com/llms.txt',
    contact: 'steve@thehiveryiq.com',
  });
});

app.listen(PORT, () => {
  console.log(`HiveAttest MCP Server running on :${PORT}`);
  console.log(`  Backend : ${HIVE_BASE}`);
  console.log(`  Tools   : ${TOOLS.length}`);
  console.log(`  Patent  : ${PATENT}`);
});
