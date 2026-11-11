---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of reading nodes after an edit

Reading an object or array node that was already read finds it from its parent's anchor, without moving a cursor to the field that holds it.
An edit invalidates the cursors used for reading, and moving them back to their place in the tree made reading after an edit cost more than twice as much as reading without one.