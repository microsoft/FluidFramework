---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix a bug in revertTo

Fixes a bug in [`UntypedTreeViewAlpha.revertTo`](https://fluidframework.com/docs/api/tree/untypedtreeviewalpha-interface#revertto-methodsignature) which could trigger assert codes `0x7ce`, `0x8a1`, `0x695`, and possibly others.
This bug is not known to cause document corruption.
