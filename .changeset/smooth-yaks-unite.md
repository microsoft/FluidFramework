---
"@fluidframework/tree": minor
---
---
"section": "tree"
---
Refactor code for emitting events to make it easier to copy paste into other projects.

Factored event emitting utilities into their own file, `events/emitter.ts`.
Applications wishing to use SharedTree's eventing library for custom events can copy this file (and its referenced utility function) as a starting point for defining and emitting their own custom events.
See `createEmitter`'s documentation for example usage.

Currently there are no published or officially supported versions of these utilities, but they are relatively simple, and can be copied and customized as needed.
