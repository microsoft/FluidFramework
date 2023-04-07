# schema-aware

Library for creating "schema aware" APIs, meaning APIs that use strong types based on schema.

TODO:

    - Generate the actual APIs we need for use with Tree:
        - Flexible should align with `ContextuallyTypedNodeData`
        - Normalized should align with `EditableTree`. This will likely require an extra setter on editable fields and on `EditableTree` for extra fields to work around [lacking support for variant accessors for index signatures in TypeScript](https://github.com/microsoft/TypeScript/issues/43826).
    - Allow use in libraries which don't have full schema information:
        - Make unrestricted field types include an extra type in the union that covers the other cases generically.
        - Add API for composing `TypedSchemaData`.
    - Consider removing redundant information that was added to `TypedSchemaData` to make type generation work easier (or make it optional and remove the runtime copy of it).
    - Support global fields.
    - Support extra local fields.
    - Support extra global fields (including in a way that is compatible with use in a library that does not have global schema knowledge).
    - Measure compiler performance, and ensure its good enough and we have a way to track it.

TODO2:

-   Explicit primitive schema and primary fields in schema objects.
-   Schema sanity check somewhere (when building schema data): runtime error on missing schema types, fields, anything thats a Never node etc. Specific Error on infinite recursion.
