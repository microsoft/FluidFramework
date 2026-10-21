---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the bundle size of schema hashing

Schema hashing uses a browser-oriented SHA-256 implementation without Node.js Buffer compatibility dependencies.
This reduces browser bundle size when using [`identifySchemaAlpha`](https://fluidframework.com/docs/api/tree#identifyschemaalpha-function).
