# Headless Application-Projection Reference

This executable reference creates a two-part HTML file without instantiating a Fluid Container, then loads it into
SharedTree, collaborates, and publishes native state alongside incrementally reusable HTML projections.
It uses an in-process service, not a browser application or external service.

## Choose a starting point

| Task                                                | Read                                                                                                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create/read a seed or integrate a new application   | [Application usage](../../../../../../docs/content/Architecture/Application-Projections/Usage.md): consumer responsibilities, examples, and integration steps                      |
| Maintain the runtime/projection implementation      | [Fluid design](../../../../../../docs/content/Architecture/Application-Projections/Fluid-Design.md): contracts, implementation rationale, acceptance/reuse mechanics, and SDK gaps |
| Understand the wider system and future dependencies | [Architecture](../../../../../../docs/content/Architecture/Application-Projections.md): storage interchange, assets, Markdown, and longer-term direction                           |
| Understand this sample and its test harness         | [DESIGN.md](DESIGN.md): local module responsibilities, instrumentation, and test boundaries                                                                                        |
| Follow the executable scenario                      | [`html/test/htmlWorkflow.ts`](html/test/htmlWorkflow.ts) and [`html/test/htmlWorkflow.spec.ts`](html/test/htmlWorkflow.spec.ts)                                                    |
| Run the reference                                   | Commands below                                                                                                                                                                     |

`html/` contains the sample application, `html/test/` its adapter and scenarios, and `harness/` the reusable test infrastructure.
Another application supplies the harness contract without adding HTML-specific knowledge to the session or storage helpers.

## Run with normal workspace outputs

```powershell
Set-Location C:\git\FluidFramework
pnpm --filter @fluid-internal/local-server-tests build:test:esm
pnpm --filter @fluid-internal/local-server-tests exec mocha --grep "Seed projection reference"
```

The focused runtime suite is `packages/runtime/container-runtime/src/test/containerRuntime.summaryGeneration.spec.ts`;
related GC cases live beside the existing GC tests.

## Optional current-source fallback

For an already-installed checkout with stale generated outputs, Node 24 can run current implementations directly:

```powershell
Set-Location C:\git\FluidFramework\packages\test\local-server-tests
$env:SEED_TYPECHECK = "1"
$loaderUrl = ([System.Uri](Join-Path (Get-Location).Path 'src\test\seedProjection\seedProjectionSourceLoader.mjs')).AbsoluteUri
node --import $loaderUrl node_modules\mocha\bin\mocha.js --no-config --no-package --exit --timeout 60000 `
    "src\test\seedProjection\**\*.spec.ts" `
    ..\..\runtime\container-runtime\src\test\containerRuntime.summaryGeneration.spec.ts `
    ..\..\runtime\container-runtime\src\test\gc\gcSummaryStateTracker.spec.ts `
    ..\..\runtime\container-runtime\src\test\gc\garbageCollection.spec.ts
```

`seedProjectionSourceLoader.mjs` is only a test preloader. It resolves client workspace packages to source and compiles
in memory using installed TypeScript/Mocha; server packages remain the installed real server packages.
`SEED_TYPECHECK=1` checks the reference, changed runtime code, and GC implementation/tests.
The fallback performs no network access, installation, or generated-file writes. It does not replace normal builds,
lint, or API-report checks. Deliberately failed summary attempts can emit expected error telemetry.

## What the scenario checks

The workflow covers external creation, independent clients, no initialization writes, concurrent native edits, summary
failure/retry and real ACKs. It verifies the same runtime's first-full-to-incremental transition, zero serialization or
HTML upload for an unchanged part, stable persisted blob IDs, grouped readback, and native reload with conversion
disabled. Pending-state cases reconstruct the baseline without the old overlay and with original seed-body reads denied.
The fingerprint suites additionally exercise real operation transport, baseline agreement, reconnect, and mismatch
recovery; the maintainer guide distinguishes per-packet rejection from rollback of an ungrouped batch.
Identity tests distinguish optional application metadata, internal materialization rules, and the native schema namespace.
Manifest-free and custom-metadata cases retain that distinction
through accepted summaries, native reload, and pending-state restoration.

For the responsibilities and limitations behind these checks, follow the consumer or maintainer guide above rather than
treating the test harness as a supported production SDK.
