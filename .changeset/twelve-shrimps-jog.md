---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": "tree"
---
Implicitly constructed object nodes now only consider own properties during validation

When determining if some given data is compatible with a particular ObjectNode schema, both inherited and own properties were considered.
However, when constructing the node from this data, only own properties were used.
This allowed input which provided required values in inherited fields to pass validation.
When the node was constructed, it would lack these fields, and end up out of schema.
This has been fixed: both validation and node construction now only consider own properties.

This may cause some cases which previously exhibited data corruption to now throw a usage error reporting the data is incompatible.
Such cases may need to copy data from the objects with inherited properties into new objects with own properties before constructing nodes from them.
