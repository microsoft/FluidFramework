# `packages/test` — shared & cross‑cutting test infrastructure

> Part of the [Fluid Framework documentation tree](../../CONCEPTS.md#testing). For the big‑picture
> testing guide that spans the **whole repo** (including the unit and fuzz tests that live inside
> each package), start at [`/TESTING.md`](../../TESTING.md). This page describes only what lives in
> **this directory**.

`packages/test` holds the tests and utilities that **don't belong to any single package** —
because they exercise the whole client stack, run against real services, or run across multiple
versions. Per‑package unit and fuzz tests live next to their own code, not here.

## Suites

| Package | What it is |
| ------- | ---------- |
| [`test-end-to-end-tests`](./test-end-to-end-tests/README.md) | The main e2e suite: a real container loop, parameterized over drivers and version combinations. |
| [`snapshots`](./snapshots/README.md) | Validates that current code can load older snapshots/summaries (corpus partly in the `FluidFrameworkTestData` submodule). |
| [`test-service-load`](./test-service-load/README.md) | Load/stress tool: many simulated clients and high op rates against a real or local service. |
| [`local-server-tests`](./local-server-tests/) | Scenarios that need direct local‑server control (disconnect/nack). |
| [`local-server-stress-tests`](./local-server-stress-tests/) | Stress testing against the local server. |
| [`functional-tests`](./functional-tests/) | Functional test suite. |

## Shared infrastructure

| Package | What it provides |
| ------- | ---------------- |
| [`test-version-utils`](./test-version-utils/README.md) | `describeCompat(...)` — generates the mixed‑version (compat) test matrix and installs legacy versions. The engine behind [cross‑version testing](../../CONCEPTS.md#compatibility). |
| [`test-drivers`](./test-drivers/README.md) | The driver abstraction that lets one e2e test run against local, Tinylicious, Routerlicious/AFR, and ODSP. |
| [`test-driver-definitions`](./test-driver-definitions/) | The driver interface the drivers implement. |
| [`test-utils`](./test-utils/README.md) | Core e2e helpers: loaders, `TestFluidObject`, op‑processing controllers. |
| [`stochastic-test-utils`](./stochastic-test-utils/README.md) | The fuzz/stochastic engine (`describeFuzz`, `performFuzzActions`) used by per‑package DDS fuzz tests. |
| [`mocha-test-setup`](./mocha-test-setup/README.md) | Central Mocha config and the `FLUID_TEST_*` environment variables. |
| [`test-pairwise-generator`](./test-pairwise-generator/) | Pairwise test‑case generation. |
| [`types_jest-environment-puppeteer`](./types_jest-environment-puppeteer/) | Types for browser (Jest + Puppeteer) tests. |

## Writing these tests

- [Writing compat‑correct tests](./test-end-to-end-tests/WritingCompatCorrectTests.md) — using the
  `apis` argument so a test exercises the right versioned types.
- [Writing tests that take summaries](./test-end-to-end-tests/WritingTestsThatTakeSummaries.md) —
  deterministic summarization testing (dedicated summarizer, auto‑summary disabled, synchronization).

For how to run any of this, see [`/TESTING.md` → Running tests](../../TESTING.md#running-tests).
