---
"@fluidframework/tree": minor
---
---
section: tree
---

Exposes the view schema from the TreeView interface.

Users of TreeView can now access the type-safe view schema directly on the view object via `TreeView.schema`.
This allows users to avoid passing the schema around in addition to the view in scenarios where both are needed.
It also avoids scenarios in which code wants to accept both a view and its schema and thus must constrain both to be of the same schema type.
