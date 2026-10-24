---
"@fluidframework/build-tools": minor
"__section": fix
---
Correct incremental builds with TypeScript 6

Incremental builds now interpret compiler options and build information using the project's TypeScript version.
Builds no longer treat pending output or unchecked diagnostics as up to date.
Composite projects and bundled output are checked correctly, and TypeScript build mode runs outside the single-project worker.
