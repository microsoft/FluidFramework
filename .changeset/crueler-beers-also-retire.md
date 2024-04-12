---
"fluid-framework": minor
"@fluidframework/tree": minor
---

tree: 'nodeChanged' and 'treeChanged' events on nodes

Nodes now expose `nodeChanged` and `treeChanged` events that fire in response to changes in the node, and to changes in the subtree rooted at the node, respectively. Their documentation includes important details about how they work / when exactly they fire, so we recommend to go over it if you plan to use these events.