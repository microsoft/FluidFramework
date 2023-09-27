---
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
---

sequence: New API for specifying spatial positioning of intervals

Previously intervals were specified with only an index. Now the model is a bit more nuanced in that you can specify positions that lie before or after a given index. This makes it more clear how interval endpoints should interact with changes to the sequence. See the docs for SequencePlace for additional context.
