---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce PlainText construction overhead with packed string storage

`PlainText.Tree.fromString` stores unhydrated text in shared string pieces instead of creating a node for each character.
Reads and edits preserve logical character boundaries, including separately inserted surrogate halves.
Sequential character iteration does not repeat indexed searches through the pieces.
The existing text and array objects retain their identities when the text is inserted into a tree.

The public API, stored schema, and wire format do not change.
