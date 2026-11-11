---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of setting and inserting content

An edit that changes one field, such as setting a property or inserting into an array, is now built directly instead of by composing a change for the field with a change for its new content.