---
"@fluidframework/devtools": minor
"@fluidframework/devtools-core": minor
---
---
"section": other
---

Mark APIs as `@sealed` and `@system` as appropriate, and make interface properties `readonly`

APIs that were never intended for direct consumer use have been marked as `@system`.
These are:

- HasContainerKey

And APIs that were not intended to be extended by consumers have been marked as `@sealed`.
These are:

- ContainerDevtoolsProps
- DevtoolsProps
- HasContainerKey
- IDevtools

Additionally, interface properties have been marked as `readonly`.
