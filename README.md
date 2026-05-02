<!-- HIVE_BANNER_V1 -->
<p align="center">
  <a href="https://hive-mcp-attest.onrender.com/health">
    <img src="https://hivemorph.onrender.com/og.svg" alt="Hive Civilization · HiveAttest perimeter for autonomous agents" width="100%"/>
  </a>
</p>

<h1 align="center">hive-mcp-attest</h1>

<p align="center"><strong>HiveAttest perimeter for autonomous agents — C8/C12/C13/C15-C20</strong></p>

<p align="center">
  <a href="https://glama.ai/mcp/servers"><img alt="Glama" src="https://img.shields.io/badge/Glama-hive--mcp--attest-FFB800?style=flat-square"/></a>
  <a href="https://hive-mcp-attest.onrender.com/health"><img alt="Status" src="https://img.shields.io/badge/status-reference--grade-FFB800?style=flat-square"/></a>
  <a href="https://github.com/srotzin/hive-mcp-attest/releases"><img alt="Release" src="https://img.shields.io/github/v/release/srotzin/hive-mcp-attest?style=flat-square&color=FFB800"/></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-FFB800?style=flat-square"/></a>
</p>

<p align="center">
  <code>https://hive-mcp-attest.onrender.com/mcp</code>
</p>

---

> **Layer C — Reference Grade**
>
> This is the reference implementation of the HiveAttest claim family. Wire format is normative. Production-grade (Layer B) is a future hardened deployment.

---

Reference implementation of **USPTO Provisional 64/055,601** — HiveAttest claims C8/C12/C13/C15-C20.

**Inventor:** Stephen A. Rotzin, 170 Greenway Dr, Walnut Creek CA 94596

---

## What this is

`hive-mcp-attest` is a Model Context Protocol (MCP) server that exposes the complete HiveAttest perimeter as 19 tools, proxying to the live hivemorph backend.

- **Protocol:** MCP 2024-11-05 over Streamable-HTTP / JSON-RPC 2.0
- **Transport:** `POST /mcp`
- **Discovery:** `GET /.well-known/mcp.json`
- **Health:** `GET /health`
- **Backend:** `https://hivemorph.onrender.com`
- **Crypto:** Ed25519, RFC 8785 JCS, SHA-256 — real signatures, no mocks
- **Brand gold:** `#FFB800`

---

## Tools

| Tool | Claim | Description |
|---|---|---|
| `attest_passport_issue` | C15 | Issue a Pre-Action Attestation Manifest (Ed25519 signed) |
| `attest_passport_verify` | C15 | Verify a passport manifest (signature + temporal + inputs hash) |
| `attest_custody_append` | C16 | Append a signed node to a custody chain (taint propagation) |
| `attest_custody_verify` | C16 | Verify hash linkage, signatures, and taint propagation |
| `attest_custody_proof` | C16 | Get a Merkle inclusion proof for a custody node |
| `attest_cargo_register` | C17 | Register a versioned cargo type (definition_hash pinned) |
| `attest_cargo_validate` | C17 | Validate a payload against a registered cargo schema |
| `attest_cargo_snapshot` | C17 | Registry snapshot with Merkle root for version pinning |
| `attest_warranty_issue` | C18 | Issue a signed warranty committing an agent to a claim |
| `attest_warranty_breach` | C18 | Report a breach — signed breach record returned |
| `attest_warranty_get` | C18 | Retrieve a warranty by ID |
| `attest_gate_evaluate` | **C19** | **THE HEADLINE TOOL** — Gate evaluation with signed C18 receipt |
| `attest_inspect_sample` | C20 | Probabilistic secondary inspection, signed inspection record |
| `attest_smsh_verify` | C8/C12 | Verify a SMSH-Stamp v1 receipt |
| `attest_absence_build` | C13 | Build a sorted Merkle tree for provable non-membership |
| `attest_absence_prove` | C13 | Prove an event is absent from an audit window |
| `attest_absence_verify` | C13 | Verify a non-membership proof against a root |
| `attest_meta` | — | Return layer/spec/patent metadata for all claims |

---

## Endpoints

| Tool | Backend URL |
|---|---|
| `attest_passport_issue` | `POST https://hivemorph.onrender.com/v1/attest/passport/issue` |
| `attest_passport_verify` | `POST https://hivemorph.onrender.com/v1/attest/passport/verify` |
| `attest_custody_append` | `POST https://hivemorph.onrender.com/v1/attest/custody/append` |
| `attest_custody_verify` | `POST https://hivemorph.onrender.com/v1/attest/custody/verify` |
| `attest_custody_proof` | `GET  https://hivemorph.onrender.com/v1/attest/custody/{chain_id}/proof/{index}` |
| `attest_cargo_register` | `POST https://hivemorph.onrender.com/v1/attest/cargo/register` |
| `attest_cargo_validate` | `POST https://hivemorph.onrender.com/v1/attest/cargo/validate` |
| `attest_cargo_snapshot` | `GET  https://hivemorph.onrender.com/v1/attest/cargo/snapshot` |
| `attest_warranty_issue` | `POST https://hivemorph.onrender.com/v1/attest/warranty/issue` |
| `attest_warranty_breach` | `POST https://hivemorph.onrender.com/v1/attest/warranty/breach` |
| `attest_warranty_get` | `GET  https://hivemorph.onrender.com/v1/attest/warranty/{id}` |
| `attest_gate_evaluate` | `POST https://hivemorph.onrender.com/v1/attest/gate/evaluate` |
| `attest_inspect_sample` | `POST https://hivemorph.onrender.com/v1/attest/inspect/sample` |
| `attest_smsh_verify` | `POST https://hivemorph.onrender.com/v1/attest/smsh/verify` |
| `attest_absence_build` | `POST https://hivemorph.onrender.com/v1/attest/absence/build` |
| `attest_absence_prove` | `POST https://hivemorph.onrender.com/v1/attest/absence/prove` |
| `attest_absence_verify` | `POST https://hivemorph.onrender.com/v1/attest/absence/verify` |
| `attest_meta` | (local — no backend call) |

---

## Connect (Claude Desktop)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hive-mcp-attest": {
      "command": "node",
      "args": ["/path/to/hive-mcp-attest/server.js"],
      "env": {
        "HIVE_BASE": "https://hivemorph.onrender.com"
      }
    }
  }
}
```

Or connect via Streamable-HTTP (MCP 2024-11-05):

```json
{
  "mcpServers": {
    "hive-mcp-attest": {
      "url": "https://hive-mcp-attest.onrender.com/mcp",
      "transport": "streamable-http"
    }
  }
}
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `HIVE_BASE` | `https://hivemorph.onrender.com` | Backend hivemorph URL |
| `PORT` | `3000` | Server port |

---

## Cryptographic guarantees

All attestation primitives use:
- **Ed25519** — signing key generated at backend startup (or loaded from `HIVE_ATTEST_PRIVATE_KEY_B64URL`)
- **RFC 8785 JCS** — deterministic canonicalization for all signing operations
- **SHA-256** — payload hashing, Merkle tree nodes
- **No mocked signatures** — every signature is a real 64-byte Ed25519 output

---

## Patent

Reference implementation of **USPTO Provisional 64/055,601** — HiveAttest claims C8/C12/C13/C15-C20.

Inventor: Stephen A. Rotzin, 170 Greenway Dr, Walnut Creek CA 94596. Filed May 2 2026.

---

## Layer

> **Layer C — Reference Grade.** Wire format is normative. Production-grade is Layer B.
>
> Every tool description ends with: "Reference-grade implementation. Wire format normative; production-grade is Layer B."

---

## License

MIT © 2026 Stephen A. Rotzin / Hive Civilization
