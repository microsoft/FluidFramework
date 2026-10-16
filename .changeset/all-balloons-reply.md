---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix an infinite loop bug in revertTo

Fixes a bug in [`UntypedTreeViewAlpha.revertTo`](https://fluidframework.com/docs/api/tree/untypedtreeviewalpha-interface#revertto-methodsignature) which could trigger an infinite loop when called.
This bug is not known to cause document corruption.
