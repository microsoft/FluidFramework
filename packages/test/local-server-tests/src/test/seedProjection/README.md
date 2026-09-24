# Application Seed and Projection References

This directory separates example application source from its tests.
The seed-only reference uses two named text parts; it does not require the ongoing application-projection runtime changes.

| Goal                                                                   | Starting point                                                                                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Integrate seed creation with your existing application                 | [Consumer guide](../../../../../../docs/content/Architecture/Application-Projections/Seed-Creation.md)                            |
| Follow the example application, supported boundaries, and run commands | [Seed-creation sample README](text/README.md)                                                                                     |
| See the runtime-factory integration                                    | [`text/sampleRuntimeFactory.ts`](text/sampleRuntimeFactory.ts) and [`text/textContainerRuntime.ts`](text/textContainerRuntime.ts) |
| Read assertions and local-service scenarios                            | [`text/test/`](text/test)                                                                                                         |

`text/` contains the seed-creation sample, which uses two named text parts and the exported loader and runtime APIs; `text/test/` contains its tests.
The sibling `html/`, `html/test/`, and shared test `harness/` directories add the ongoing projection reference.
Keeping the application subdirectories separate preserves the same seed sample and test paths in both PRs.
The models and conversions are application-specific; the shared seed-loading and construction support lives in the framework packages, not in a copied example helper.
The text application needs no copied loader adapter, mock snapshot builder, or test-only summary host.
The consumer guide separates the framework APIs from the format, schema, conversion, and service integration that each application owns.

## HTML projection reference

This executable reference creates a seed containing two HTML parts without instantiating a Fluid container.
It loads the content into SharedTree, supports collaboration, and publishes incrementally reusable HTML projections.
It uses an in-process service, not a browser application or external service.

**Runtime state** includes Fluid metadata and distributed data structures (DDSs), including SharedTree.
It is not the original HTML seed.
A later summary stores runtime/DDS state beside an **application projection**: readable HTML for the same checkpoint.

### Choose a starting point

| Task                                                | Read                                                                                                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create/read a seed or integrate a new application   | [Application usage](../../../../../../docs/content/Architecture/Application-Projections/Usage.md): consumer responsibilities, examples, and integration steps                      |
| Maintain the runtime/projection implementation      | [Fluid design](../../../../../../docs/content/Architecture/Application-Projections/Fluid-Design.md): contracts, implementation rationale, acceptance/reuse mechanics, and SDK gaps |
| Understand the wider system and future dependencies | [Architecture](../../../../../../docs/content/Architecture/Application-Projections.md): storage interchange, assets, Markdown, and longer-term direction                           |
| Understand this sample and its test harness         | [DESIGN.md](DESIGN.md): local module responsibilities, instrumentation, and test boundaries                                                                                        |
| Follow the executable scenario                      | [`html/test/htmlWorkflow.spec.ts`](html/test/htmlWorkflow.spec.ts)                                                                                                                 |
| Run the reference                                   | Commands below                                                                                                                                                                     |

`html/` contains the sample application, `html/test/` its adapter and scenarios, and `harness/` the reusable test infrastructure.
Another application supplies the harness contract without adding HTML-specific knowledge to the session or storage helpers.

## Run the reference

Follow the [repository setup instructions](../../../../../../README.md), then run these commands from the repository root:

```bash
pnpm --filter @fluid-internal/local-server-tests build
pnpm --filter @fluid-internal/local-server-tests exec mocha --grep "Seed creation:|Seed projection reference"
```

The first command uses the ordinary dependency-aware build, rather than compiling only the test files.
Rerun it after source or branch changes. If a clean rebuild is needed, use the affected packages' normal `clean` scripts
before rebuilding.

The focused runtime suite is `packages/runtime/container-runtime/src/test/containerRuntime.summaryGeneration.spec.ts`;
related GC cases live beside the existing GC tests.

## What the HTML scenario checks

The workflow covers external creation, independent clients, no initialization writes, concurrent SharedTree edits, summary
failure/retry and real ACKs. It verifies the same runtime's first-full-to-incremental transition, zero serialization or
HTML upload for an unchanged part, stable persisted blob IDs, grouped readback, and runtime-state reload with conversion
disabled. Pending-state cases reconstruct the initial runtime state without the old overlay or original seed-body reads.
The fingerprint suites additionally exercise real operation transport, baseline agreement, reconnect, and mismatch
recovery; the maintainer guide distinguishes per-packet rejection from rollback of an ungrouped batch.
The application accepts a variable number of named parts; the main scenario deliberately uses two.
Additional cases cover zero, one, and three parts, structural edits, and manifest-free/custom metadata.
Identity tests distinguish application metadata, internal materialization rules, and the SharedTree schema namespace.
Manifest-free and custom-metadata cases retain that distinction
through accepted summaries, runtime-state reload, and pending-state restoration.

For the responsibilities and limitations behind these checks, follow the consumer or maintainer guide above rather than
treating the test harness as a supported production SDK.
