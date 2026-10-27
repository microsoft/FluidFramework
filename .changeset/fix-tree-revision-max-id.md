---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Preserve identifier allocation bounds when tree edit revisions change

Revision normalization now updates the allocation bound when it assigns larger local identifiers to avoid collisions.
This prevents later edit processing from allocating identifiers that normalization has already assigned.
