---
"@fluidframework/odsp-driver": minor
"__section": fix
---
Keep unreferenced flags on the correct snapshot trees

Binary snapshot decoding assigns each unreferenced flag to the tree named by its record instead of that tree's parent.
This keeps snapshot metadata consistent with JSON decoding and corrects datastore reachability counts reported at load.
The change does not alter runtime garbage collection decisions.
