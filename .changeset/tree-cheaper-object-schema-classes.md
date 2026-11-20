---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the memory and time used by object node schema, including enum schema

Each object node schema class keeps its data in one record, and implements its static members once on a shared base class rather than with closures for each class.
Object node schema without fields share their empty field data, and an object node schema creates its `fields` map only when it is first used.
Enum schema created with `enumFromStrings`, `adaptEnum` or `singletonSchema` create one class per value instead of two.
This reduces the memory and time needed to define schema with many object node types or enum values.
