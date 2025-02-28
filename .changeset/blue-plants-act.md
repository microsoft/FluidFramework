---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": tree
---

Creating large transactions and processing inbound changes is now faster

SharedTree sometimes composes several sequential changes into a single change.
It does so whenever a transaction is created and when processing inbound changes.

Version 2.3.0 makes this composition process asymptotically faster.
For example, creating a transaction that performs 1000 edits on a single array now takes 170ms instead of 1.5s (an 89% improvement).

See [Change #23902](https://github.com/microsoft/FluidFramework/pull/23902) for more details.
