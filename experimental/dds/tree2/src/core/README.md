# core

Reexports the contents of the "core" libraries.
This is the set of libraries on which [shared-tree-core](../shared-tree-core/README.md) depends.

This mainly exists to simplify imports (and `fence.json` files) for code like [feature-libraries](../feature-libraries/README.md) and [shared-tree](../shared-tree/README.md).

The core libraries could be nested inside this directory (as is done with [feature-libraries](../feature-libraries/README.md));
for now this was avoided to keep the nesting levels lower and avoid having to move a lot of code.
