---
"@fluidframework/devtools": minor
"@fluidframework/devtools-core": minor
---
---
"section": other
---

API clarifications for devtools packages

APIs that were never intended for direct consumer use have been marked as `@system`.
These are:

- HasContainerKey

APIs that were not intended to be extended by consumers have been marked as `@sealed`.
These are:

- ContainerDevtoolsProps
- DevtoolsProps
- HasContainerKey
- IDevtools

Additionally, interface properties have been marked as `readonly`.
