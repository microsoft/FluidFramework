---
"fluid-framework": minor
"@fluidframework/shared-object-base": minor
---

SharedObject classes are no longer exported as public

`SharedObject` and `SharedObjectCore` are intended for authoring DDSes, and thus are only intended for use within the Fluid Framework client packages.
They is no longer publicly exported: any users should fine their own solution or be upstreamed.
`SharedObject` and `SharedObjectCore` are available for now as `@alpha` to make this migration less disrupting for any existing users.
