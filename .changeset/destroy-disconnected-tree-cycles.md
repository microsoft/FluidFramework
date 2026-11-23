---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Clean up unreachable content after concurrent moves create a cycle

SharedTree now releases unreachable content and invalidates its anchors when concurrent moves create a cycle.
Nodes moved out of the cycle and unrelated content are preserved.
This cleanup does not fix recovery of the cyclic content through undo or subsequent concurrent edits.
