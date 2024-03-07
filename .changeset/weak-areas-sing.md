---
"fluid-framework": minor
"@fluidframework/fluid-static": minor
---

ContainerSchema is now readonly

ContainerSchema type is intended for defining input to the these packages. This should make the APIs more tolerant and thus be non-breaking, however its possible for some users of ContainerSchema to use it in ways where this could be a breaking change: any such users should remove their mutations and/or use a different type.
