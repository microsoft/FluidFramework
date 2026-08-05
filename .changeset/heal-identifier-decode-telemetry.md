---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
SharedTree now emits telemetry when it heals an unresolvable identifier on decode

When [`SharedTreeOptionsBeta.healUnresolvableIdentifiersOnDecode`](https://fluidframework.com/docs/api/tree/sharedtreeoptionsbeta-interface#healunresolvableidentifiersondecode-propertysignature) is enabled and an unresolvable identifier is healed while loading a summary, SharedTree now records a `HealUnresolvableIdentifierOnDecode` telemetry event (at `LogLevel.essential`). This lets applications relying on the healing workaround detect which documents actually required healing.

This only affects applications that have opted into `healUnresolvableIdentifiersOnDecode`; the telemetry is emitted through the same logger the DDS already uses, and no behavior other than the added telemetry has changed.
