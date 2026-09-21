# Decision 0013: Shared WASM Session Foundation

Status: accepted
Date: 2026-09-18
Iteration: none; lightweight combined stages 1 and 2
Owners: Craig Macomber and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

The [integration plan](../SERVICE_CLIENT_PLAN.md) requires local and remote JavaScript sessions, optional decorators, and independently generated minimal bundles.
Existing generated bindings belong to `sea-webtransport` and mix protocol values with general session operations.
The native typed session client already implements the contracts consumed by the compression decorator, but was excluded from browser builds.

## Decision Drivers

- Reuse session operations and existing decorators across concrete configurations.
- Preserve availability evidence, error classification, and cancellation semantics.
- Keep local-only bundles independent of the transport crate and remote-only bundles independent of local storage.
- Keep package ownership non-Fluid-specific and migrate existing consumers only after validating the shared foundation.

## Options and Evidence

Copying generated operations for each decorator or transport would duplicate behavior and make additional stacks expensive.
Replacing availability handles with bare identities would discard evidence required by the core publication contract.
Generalizing the typed transport session client and wrapping concrete sessions in a shared adapter preserves both contracts.

The initial implementation passes native session-composition tests, shared adapter tests over local and compressed sessions, and WASM compilation.
Node package tests exercise shared and isolated memory services, immutable content, events, snapshots, cancellation, and capability rejection.
Chromium 152 inside the Codespace exercised real WebTransport sessions with and without compression, including snapshot reopening.

## Decision

Use one typed transport session implementation for native and browser transport primitives while preserving the native connection API.
Place generated session operations in `sea-wasm` above an object-safe adapter that retains original concrete availability handles.
Compose optional decorators before adapting the concrete session.
Keep transport, memory, and compression dependencies feature-gated with empty default features in `sea-wasm`.

The `sea-typescript` package owns generated Node/web artifacts, neutral application values, and lazy initialization.
Build named configurations in separate Cargo invocations and target/output directories.
Create explicit memory services independently of module initialization.
Keep the legacy transport bindings enabled by default during consumer migration; the new WASM owner disables those exports in its transport dependency.

## Consequences

New stack configurations can reuse the same session exports.
Concrete handle types remain hidden without changing their provenance checks.
The initial generic adapter adds dynamic dispatch and retains boxed handle evidence; size and performance measurements remain follow-up work.
Temporary legacy exports remain until existing consumers migrate.
This decision does not enable encryption, automatic reconnect, full loader presets, ServiceClient integration, or external Codespaces WebTransport access.

## Validation and Follow-Up

Run the [development gates](../../DEVELOPMENT.md), capability-specific dependency checks, and package and browser tests.
Complete migration without moving Fluid interpretation into the neutral package.
Complete the error and lifecycle contract, generated-asset packaging checks, and combined-stage acceptance before stage 3.
Revisit the adapter representation only if evidence shows that preserved semantics or practical bundle costs require a different approach.
