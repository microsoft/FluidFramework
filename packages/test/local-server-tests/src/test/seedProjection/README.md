# Application Seed and Projection References

This directory separates example application source from its tests.
The seed-only reference uses two named text parts; it does not require the ongoing application-projection runtime changes.

| Goal                                                                 | Starting point                                                                                                                |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Integrate seed creation with your existing application               | [Consumer guide](../../../../../../docs/content/Architecture/Application-Projections/Seed-Creation.md)                        |
| Follow the example application, fixture boundaries, and run commands | [Text application README](text/README.md)                                                                                     |
| See the runtime-factory integration                                  | [`text/sampleRuntimeFactory.ts`](text/sampleRuntimeFactory.ts) and [`text/seedRuntimeAdapter.ts`](text/seedRuntimeAdapter.ts) |
| Read assertions and local-service scenarios                          | [`text/test/`](text/test)                                                                                                     |

`text/` contains the bounded sample implementation; `text/test/` contains its tests.
The larger [projection PR](https://github.com/microsoft/FluidFramework/pull/28280) adds the sibling `html/`, `html/test/`, and shared test `harness/` directories.
Neither example is a published SDK: the consumer guide identifies the internal construction and host support that you must replace or harden before shipping.
