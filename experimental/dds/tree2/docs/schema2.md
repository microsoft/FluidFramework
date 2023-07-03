# Schema 2

Proposal for changes to the schema system.

## Motivation

The current schema system has several issues:

1. It's cluttered with features that are not used in most cases. (ex: extraLocalFields, extraGlobalFields, global fields and values are not used on almost all schema)
2. It's not clear to users which features when and why they all exist.
3. global value fields and extra global fields don't interact in a clear well defined way (would such value fields be required on all nodes with extraGlobalFields or are they implicitly made optional when used via extra global fields?)
4. Extra local fields can result in types typescript can't model, since our schema system only applies the schema for the extra fields to all fields not explicitly listed. This [can't be done in TypeScript](https://www.typescriptlang.org/play?noPropertyAccessFromIndexSignature=true&ts=4.5.5#code/PTAEBUCcE9QFwPagLYEMDWBTUr7QA7YDuAFppNgGYCWmANgCagBEqzo1AzqJ3JNQDsA5gBocAphV44KoAQFdkAI3IAuAFDqQoACIJM3AQjigiCSOnVwC2AMrVk+OtgC8oAN7qAkAG0ssQR4+QSEAXVVQf1BMAA84TAluVnYAfiD+YVAIhWVyAG51AF8CrTA9AzljU3N0DWtCUFtg4U4AeTgySHASVAEAHnBouISGbl4MoQA+UDd-BEoPUD9MAIFQAApBgB90kIBKcMiVofjEiFA0gUwAN3Iso9hiqxtG5qE2jvJu3oAmAZORmM3tM3ABRGIAYzo8gYmD64xCYnAkxK2gAQsYSPAyJxsKhZAAreTSAAGCOEJOeDVsM1eEw+nW+-WSKKpdh+tKa9PajJ6Aj+LNRZX0hiqSnk1EY6kE8UglFQELsDicmA5ni8qAi5KEBV8UUCnEOckUKkgBSepV0IsqJnFkoY0oEsvlisayucau8mt2wl1y1WjSNOVN5pKEIQAmkAH0GKg4KgAIwReyOZy09w4CLMGLsJ7hyMmGNx1A-ZPu1yLb3Z5hiJQRACsoCe2gAAnBOABaWKECFwLuQSDmUyDzL504meqYdT56Ox+MAZjLqYrGe9jebYDbne7mF7-cHkGHEaEoDHCQnNmnEdnxYALEuVenMywc7Ws9Bc7rNF4gA)
5. It requires use of symbols to avoid colliding with local field names in many places in the API, which has been confusing users (many TypeScript developers don't even know what Symbols are).
6. Supporting all the things in all the nodes makes APIs complex. This is extra annoying since this complicates the schema-aware API.
7. Extra fields require proxies to implement the desired TypeScript APIs for nodes.
8. Having both global and local fields adds complexity, particularly to tree, schema and paths storage where symbols can't be used.

## Proposal

Instead of one kind of node in view schema, have 4, each with a subset of our current functionality:

1. Terminal Node: holds a value, but no children.
   Don't support `undefined` as a value: an empty struct can be used for that case if needed.
2. Struct Node: finite list of fields (key+field type).
3. Map Node: single field type which must permit empty.
   Allows all string field keys.
   Provides the functionality currently done by making a node schema with extra local fields.
4. Field Node: Implicitly unwraps to field in the schema aware tree API.
   Provides the functionality currently done by making a node schema with a primary field (empty field key).

Each of these will get a seperate API to declare (similar to SchemaBuilder.object and SchemaBuilder.primative, except we will have 4 options).
Each will also get its own API for accessing it in editable tree, though all will extend a common generic tree traversal API as well.

This will mirror how field kinds work, where we have a small collection of supported kinds in schema, and each gets its own editable tree API.

Struct Nodes will also get an addational feature: custom field names.
Custom field names allow the view schema to delcare the string to be used for the name of the field in schmea-aware APIs insread of just using the field key.
This can default to the field key, but can optionally be a distinct string.

Custiomizable field names are great for app maintainability: a field in coded can be renamed as used in code without breakign existing data.
There are also some further benifits:
it makes it practical to ban specific field names for use in APIs if they collide with our framework APIs.
Since an app can rename the field without changing how data is persisted, requiring them to do this renamining if a framework update causes a name collision will be ok.
This means Struct Nodes can have schem-aware APIs that don't have to use symbols to avoid field name collosions.
We will keep a method to look up fields by their keys to cover generic code as well.

Custom field names make it practical to to use long collision resistant names for fields, and this ussage pattern can replace most of the need for global field keys.
The other use case, where the same field is desired on multiple schema can be handled in other ways, like putting it on a reused child node, or just putting the field directly on each schema its desired on.

### Annotation Pattern

ExtraGlobalFields in the previous design existed to support an "annotations pattern" where a an app could opt some or all of their schema into alowing annotation subtrees to be placed on nodes.
This addressed usecases where multiple users of the same tree (might be different applications entirly, or just different views withing the same app, different versions of an app etc.) want to store extra data ("annodations") on a tree, without interfearing with eachother.

ExtraGlobalFields isn't really a full solution to this.
The real challance is that different applications may have different view schema, each with a different set of known annotations.
Our stored vs view schema already can model this, even without ExtraGlobalFields:
each application can add their annotations as optional fields to the stored schema.

The only thing thats really missing is how the applications should handle opening documents with exexpected stored fields like these.
This an be addressed by doing either one or both of the following:

1.  Allow field in the schema (stored and view) to indicate how applications which do not understand the field should tret the type.
    Some options:
    1.  read+write, preserve where posible
    1.  read+write, clear on mutation
    1.  readonly
    1.  Treat as outof schema / unsupported
2.  Allow nodes to delcare if they support unrecognized fields (in the view schema only).
    This would generate an API that could enumerate unexpected fields in the schema-aware API.

## Schedule

### Near Term

Workstream 1

1. Add the 4 node type builders to SchemaBuilder. Use the existing schema features, but just limit which features each can use (like is already done for primative)
2. Update all schema to use new API.
3. Remove old API.
4. Capture which kind of node schema the view schema are in the data and type produced by the schema builder.
5. Update editiable tree (and schema aware APIs) to leverage node kinds.

Workstream 2

1. Replace existing ussages of global field keys with string constants.
2. Remove support for global fields
3. Cleanup code now that it can assume only local fields (ex: extra objects to seperate local and global can be renamed or removed).

Workstream 3

1.  Adjust stored schema (encoding and/or validation) so that having one type have more than one of value, fields and extra local fields is invalid.
2.  Simplify code where possible based on this above assumption (for example schema compatibility comparisons).

### Mid term

-   Add support for custom field names for struct fields.
-   Remove unneeded use of symbols.
-   Remove support for "undefined" values.

### Longer term

Full support for "annotation pattern".

More unified Nodes vs Fields:
Since will have a clear answer for what to do when you want to use a node as a field (Use a Value Field) or a field as a node (Use a Field Node).
If desired we could make the schema language more tolerant, impllicitly handling fields as nodes and nodes as fields.
Doing this properly would still need a type for the Field Nodes, so it may depend on having proper generic type support and thus not be viable initally.
Alternativly (or addationally) in the even longer term we can revisite the whole alternatiting map like and and sequence like data model:
this new schema setup gets us closer to having a single unifying abstraction for both nodes and fields, though a lot would still neewd to be worked out in this area if truly combined
(how lifetime/identity would work, how to handle paths, generic access APIs and stree storage etc.).
Details about how if if we would do this are out of scope for this document other than noting that such a change would likley be easuer with this new schema system than the old one.
