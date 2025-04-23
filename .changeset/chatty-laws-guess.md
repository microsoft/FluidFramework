---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Remote edits to nodes which have never been accessed locally now correctly trigger "treeChanged" events

There was a bug where "treeChanged" events would not always trigger if the node which was edited had never been accessed in the current view.
This has been fixed.
