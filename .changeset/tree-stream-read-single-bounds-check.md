---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Slightly reduce the cost of decoding encoded tree content

SharedTree now checks each read from its encoded tree content against the end of the data only once.
This slightly reduces the work needed to decode ops that insert content and to load content from summaries.