---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of submitting edits when the schema allows no Fluid handles

SharedTree no longer searches its ops for Fluid handles when the document's stored schema does not allow handles.
This reduces the work needed to send each local edit to collaborators, especially for large edits.