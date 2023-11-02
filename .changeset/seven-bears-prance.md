---
"@fluidframework/ink": major
---

Renames `@fluidframework/ink` to `@fluid-experimental/ink`.

This package was never really meant for public consumption. Its documentation indicates its "experimental" status, but the package itself predates our `fluid-experimental` package namespace. This change makes the experimental status more explicit.

Existing consumers will need to migrate to the new package name.
