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
The larger [projection PR](https://github.com/microsoft/FluidFramework/pull/28280) adds the sibling `html/`, `html/test/`, and shared test `harness/` directories.
Keeping the application subdirectories separate preserves the same seed sample and test paths in both PRs.
The models and conversions are application-specific; the shared seed-loading and construction support lives in the framework packages, not in a copied example helper.
The text application needs no copied loader adapter, mock snapshot builder, or test-only summary host.
The consumer guide separates the framework APIs from the format, schema, conversion, and service integration that each application owns.
