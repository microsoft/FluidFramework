---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Improve error messages when failing to construct nodes

The error messages when constructing tree nodes have been improved.
Several cases now list not only the schema identifiers, but also schema names which can help when there are identifier collisions and make it easier to find the implementations.
Additionally some cases which did not include what schema were encountered and which were allowed now include both.
