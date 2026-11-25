---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Hydrated nodes use about a third of the memory they used before

Each node read from a SharedTree now retains about a third of the heap it used to.
In a benchmark reading 6,000 object nodes, retained heap per hydrated node fell from about 7,140 bytes to about 2,415 bytes, and reading them was also faster.
Nodes with event listeners also use less memory: about 1,130 bytes per listened node instead of about 1,815.

Reading a property that holds a single leaf value or node no longer creates an internal field object for it, and nodes allocate their event buffers only when an event is first buffered.
