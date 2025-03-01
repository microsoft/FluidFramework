---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": tree
---

Faster creation of large transactions and faster processing of inbound changes

SharedTree sometimes composes several sequential changes into a single change.
It does so whenever a transaction is created and when processing inbound changes.
[This PR](https://github.com/microsoft/FluidFramework/pull/23902) makes this composition process asymptotically faster.
For example, creating a transaction that performs 1000 edits on a single array now takes 170ms instead of 1.5s (an 89% improvement).
