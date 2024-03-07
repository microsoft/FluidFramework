---
"fluid-framework": minor
"@fluidframework/telemetry-utils": minor
---

EventEmitterWithErrorHandling is no longer publicly exported

EventEmitterWithErrorHandling is intended for authoring DDSes, and thus is only intended for use within the Fluid Framework client packages.
It is no longer publicly exported: any users should fine their own solution or be upstreamed.
EventEmitterWithErrorHandling is available for now as `@alpha` to make this migration less disrupting for any existing users.
