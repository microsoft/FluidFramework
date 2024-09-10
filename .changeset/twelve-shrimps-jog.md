---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": "tree"
---
Implicitly constructed object nodes now only consider own properties during validation.

When determining if some given data is compatible with a particular ObjectNode schema, both inherited and own properties used to be considered.
However when actually constructing the node from the data, only own properties were used.
This could lead to input containing inherited properties getting validated, but producing out of schema nodes missing fields.
This has been fixed and now both code paths use the same check, for own properties, when evaluating if an input has a property that should be considered for providing the content of the node's field.

This may cause some cases which previously exhibited data corruption to now throw a usage error reporting the data is incompatible.
Such cases may need to copy data from the objects with inherited properties into new objects with own properties before constructing nodes from them.
