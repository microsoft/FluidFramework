# Schema 2

Proposal for changes to the [schema system](./stored-and-view-schema.md).

## Motivation

The current schema system has several issues:

1. It's cluttered with features that are not used in most cases. (ex: extraLocalFields, extraGlobalFields, global fields and values are not used on almost all schema)
2. It's not clear to users which features to use when and why they all exist.
3. global value fields and extra global fields don't interact in a clear well defined way (would such value fields be required on all nodes with extraGlobalFields or are they implicitly made optional when used via extra global fields?)
4. Extra local fields can result in types TypeScript can't model, since our schema system only applies the schema for the extra fields to all fields not explicitly listed. This [can't be done in TypeScript](https://www.typescriptlang.org/play?noPropertyAccessFromIndexSignature=true&ts=4.5.5#code/PTAEBUCcE9QFwPagLYEMDWBTUr7QA7YDuAFppNgGYCWmANgCagBEqzo1AzqJ3JNQDsA5gBocAphV44KoAQFdkAI3IAuAFDqQoACIJM3AQjigiCSOnVwC2AMrVk+OtgC8oAN7qAkAG0ssQR4+QSEAXVVQf1BMAA84TAluVnYAfiD+YVAIhWVyAG51AF8CrTA9AzljU3N0DWtCUFtg4U4AeTgySHASVAEAHnBouISGbl4MoQA+UDd-BEoPUD9MAIFQAApBgB90kIBKcMiVofjEiFA0gUwAN3Iso9hiqxtG5qE2jvJu3oAmAZORmM3tM3ABRGIAYzo8gYmD64xCYnAkxK2gAQsYSPAyJxsKhZAAreTSAAGCOEJOeDVsM1eEw+nW+-WSKKpdh+tKa9PajJ6Aj+LNRZX0hiqSnk1EY6kE8UglFQELsDicmA5ni8qAi5KEBV8UUCnEOckUKkgBSepV0IsqJnFkoY0oEsvlisayucau8mt2wl1y1WjSNOVN5pKEIQAmkAH0GKg4KgAIwReyOZy09w4CLMGLsJ7hyMmGNx1A-ZPu1yLb3Z5hiJQRACsoCe2gAAnBOABaWKECFwLuQSDmUyDzL504meqYdT56Ox+MAZjLqYrGe9jebYDbne7mF7-cHkGHEaEoDHCQnNmnEdnxYALEuVenMywc7Ws9Bc7rNF4gA)
5. It requires use of symbols to avoid colliding with local field names in many places in the API, which has been confusing users (many TypeScript developers don't even know what Symbols are).
6. Supporting all the things in all the nodes makes APIs complex. This is extra annoying since this complicates the schema-aware API.
7. Extra fields require proxies to implement the desired TypeScript APIs for nodes.
8. Having both global and local fields adds complexity, particularly to schema and path storage where symbols can't be used.
9. Supporting extraLocalFields and extraGlobalFields on nodes while providing a JavaScript object like API requires a Proxy, which adds overhead and complicates code implementation and maintenance.

## Proposal

Instead of one kind of node in view schema, have 4, each with a subset of our current functionality:

1. Leaf Node: holds a value, but no children.
   Don't support `undefined` as a value: an empty Struct can be used for that case if needed.
2. Struct Node: finite list of fields (key+field type).
3. Map Node: A node which maps all strings (as field keys) to fields.
   All possible fields get a single field schema (just like existing extraLocalFields).
   This field schema allow the field to be empty (for example an optional or sequence field, but not a value field):
   otherwise the tree would be required to have a non-empty field for all possible string keys (which would be an infinite sized tree) to be in schema.
   This is the same functionality currently done by making a node schema with extra local fields.
4. Field Node: Has a single unnamed field (using the empty field key).
   When reading in the editable tree API implicitly, unwraps to the field.
   This provides the functionality currently done by making a node schema with a primary field (empty field key), which is used for "array nodes".

Each of these will get a separate API to declare (similar to SchemaBuilder.object and SchemaBuilder.primitive, except we will have 4 options).
Each will also get its own API for accessing it in editable tree, though all will extend a common generic tree traversal API as well.

This will mirror how field kinds work, where we have a small collection of supported kinds in schema, and each gets its own editable tree API.

Struct Nodes will also get an additional feature: custom field names.
Custom field names allow the view schema to declare the string to be used for the name of the field in schema-aware APIs instead of just using the field key.
This can default to the field key, but can optionally be a distinct string.

Customizable field names are great for app maintainability: a field can be renamed as used in code without breaking existing data.
There are also some further benefits:
it makes it practical to ban specific field names for use in APIs if they collide with our framework APIs.
Since an app can rename the field without changing how data is persisted, requiring them to do this remaining if a framework update causes a name collision will be ok.
This means Struct Nodes can have scheme-aware APIs that don't have to use symbols to avoid field name collisions.
We will keep a method to look up fields by their keys to cover generic code as well.

Custom field names make it practical to use long collision resistant names for fields, and this usage pattern can replace most of the need for global field keys.
The other use case, where the same field is desired on multiple schema can be handled in other ways, like putting it on a reused child node, or just putting the field directly on each schema it is desired on.

Map nodes will not expose a JavaScript object like API, and instead expose a JavaScript Map like API.
This avoids the need to use a Proxy for any of the node implementations, as well as avoids needing to support custom field names for Map nodes to deal with possible API name collisions.

### Annotation Pattern

ExtraGlobalFields in the previous design existed to support an "annotations pattern" where an app could opt some or all of their schema into allowing annotation subtrees to be placed on nodes.
This addressed use-cases where multiple users of the same tree (might be different applications entirely, or just different views within the same app, different versions of an app etc.) want to store extra data ("annotations") on a tree, without interfering with each-other.

ExtraGlobalFields isn't really a full solution to this.
The real challenge is that different applications may have different view schema, each with a different set of known annotations.
Our stored vs view schema already can model this, even without ExtraGlobalFields:
each application can add their annotations as optional fields to the stored schema.

The only thing that's really missing is how the applications should handle opening documents with stored fields like these.
This can be addressed by supporting either one or both of the following:

1.  Allow fields in the schema (stored and view) to indicate how applications which do not understand the field should treat the type containing the field.
    Some options are:
    1.  read+write, preserve unknown field where possible
    1.  read+write, clear unknown field on mutation
    1.  readonly
    1.  Treat as out of schema / unsupported
2.  Allow nodes to declare if they support unrecognized fields (in the view schema only).
    This would generate an API that could enumerate unexpected fields in the schema-aware API.

Additionally an API could be added to struct nodes to enumerate all unexpected fields.
API wise this looks similar to the existing extra fields support, but it is distinct in its use-case and performance characteristics.
Extra local fields were designed to allow arbitrary fields, without bloating the stored schema:
in the previous system adding and removing N extra local fields with different keys currently makes no schema changes whereas adding a bunch of fields to the stored schema as unrecognized fields in the proposed schema system would bloat the document schema proportionally.
Instead this feature is only intended for when an application has a view schema for a field that other applications using the document might not have.
Thus any actual schema editing done as part of supporting these fields can be done implicitly as part of schematize based on the comparison of the view and stored schema,
and does not involve exposing any stored schema editing to users.

## Schedule

### Near Term

Workstream 1

1. (Done) Add the 4 node type builders to SchemaBuilder. Use the existing schema features, but just limit which features each can use (like is already done for primitive).
2. (Done) Update all schema to use new API.
3. (Done) Remove old schema builder API.
4. Capture which kind of node schema the view schema are in the data and type produced by the schema builder.

Workstream 2

1. (Done) Replace existing usages of global field keys with string constants.
2. (Done) Implement alternative design for root field.
3. (Done) Remove support for global fields.
4. (Done) Cleanup code now that it can assume only local fields (ex: extra objects to separate local and global can be renamed or removed).

Workstream 3

1.  Adjust stored schema (encoding and/or validation) so that having one type have more than one of value, fields and extra local fields is invalid.
2.  Simplify code where possible based on this above assumption (for example schema compatibility comparisons).

### Mid term

-   Add support for custom field names for struct fields.
-   Update editable tree (and schema aware APIs) to leverage node kinds.
-   Define base node API and implementation
-   Extend base for each kind.
-   Remove use of symbols on editable tree APIs
-   Remove use of proxies for nodes: dynamically generate custom struct node subclasses from schema.
-   Remove support for "undefined" values from Leaf nodes.

### Longer term

Full support for "annotation pattern".

More unified Nodes vs Fields:
This design provides a clear answer for what to do when you want to use a node as a field (Use a Value Field) or a field as a node (Use a Field Node).
If desired we could use this to make the schema language more tolerant, implicitly handling fields as nodes and nodes as fields.
Doing this properly would still need a type identifier for the Field Nodes and field key for Value Fields, but shorthand syntaxes in these cases could be supported.
When/If generic types are supported, the need for an identifier for Field Nodes could be removed (and default to some standard generic type).
Alternatively (or additionally) in the even longer term we can revisit the whole alternating map like and and sequence like data model:
this new schema setup gets us closer to having a single unifying abstraction for both nodes and fields, though a lot would still need to be worked out in this area if truly combined
(how lifetime/identity would work, how to handle paths, generic access APIs and tree storage etc.).
Details about how and if we would do this are out of scope for this document other than noting that proposed change would likely make such further changes easier if we choose to do them.
