---
"@fluid-experimental/tree2": minor
---

tree2: Replace ValueSchema.Serializable with FluidHandle

Replace ValueSchema.Serializable with FluidHandle, removing support for arbitrary objects as tree values and preventing "any" type from Serializable from infecting TreeValue.
