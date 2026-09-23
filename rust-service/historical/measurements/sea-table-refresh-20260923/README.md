# SEA Overview Table Refresh, 2026-09-23

This dataset supports the refreshed SEA values in the [project overview](../../PROJECT_OVERVIEW.md#sea-table-refresh-2026-09-23).
It contains 24 native throughput probes and 20 Node/WASM matched-load samples at `c9ce497936d6ecbbacb3e529dd64bf5706816638`.

## Evidence

[`results.json.gz`](results.json.gz) contains the four collection manifests and all raw benchmark results, including worker outcomes and backlog samples.
Its SHA-256 digest is `a2f0648bbc98735446ecd7381f212df3e66b38467f2a6277414110248d8a0041`.

The release service binary was `bdfd9567b662c84a3fea1b4bbf89cb500ac242d79dfbd23b4f7820db29222799`.
The release native generator was `e164503fba639021beef6ee2163bed5d60d515cbaf9fc0a6e755086b66f5d617`.
The Node WebSocket WASM artifact was `74233eb6f8c395fa846e22407901dcdf8e30c67031541390350b0d18ad4679ae`.

## Method

All samples used 32 documents, one writer and observer for each document, four separate generator cores, three warmup seconds, and ten measured seconds.
Throughput probes used native WebSocket clients and eight service cores.
Matched-load samples used Node/WASM WebSocket clients, four service cores, and 500 offered operations per second.
Every output directory and storage directory was fresh.

The throughput set contains ten passes, 13 completed threshold failures, and one failure before workers were ready.
The matched-load set contains ten passing samples for each payload size.
The pass criteria and measurement boundaries are defined in the [benchmark scripts guide](../../../scripts/README.md#stress-setup).

The host was a shared AMD EPYC 7763 virtual machine running Linux `6.8.0-1064-azure`.
The toolchain was Rust 1.98.1 and Node.js 22.23.2.
The workspace filesystem reported `ext2/ext3`.
An unrelated host file scan was stopped before retained collection began.

These are short single-host measurements.
They do not establish stable maximum capacity, equal durability, or physical power-loss behavior.
