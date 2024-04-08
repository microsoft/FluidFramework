---
"@fluidframework/tree": minor
---

Allow root editing and make TreeView parameterized over schema.

TreeView now is parameterized over the field schema instead of the root field type. This was needed to infer the correct input type when reassigning the root.
Code providing an explicit type to TreeView, like `TreeView<Foo>` can usually be updated by replacing that with `TreeView<typeof Foo>`.
