---
"@fluidframework/routerlicious-driver": minor
---

routerlicious-driver: Ephemeral containers now controlled in attach() call rather than as driver policy

Previously, ephemeral containers were created by adding an `isEphemeralContainer` flag in `IRouterliciousDriverPolicies`. Now, it is controlled by a `createAsEphemeral` flag on the resolved URL. See <https://github.com/microsoft/FluidFramework/pull/19544> for an example of how to set this flag via your URL resolver.
