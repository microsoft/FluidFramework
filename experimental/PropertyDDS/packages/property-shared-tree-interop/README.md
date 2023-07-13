# @fluid-experimental/property-shared-tree-interop

This package contains tools and utilities that should help application developers migrate their projects
from `PropertyDDS` to the new `SharedTree` DDS (see the
[@fluid-experimental/tree2](https://github.com/microsoft/FluidFramework/blob/main/experimental/dds/tree2/README.md)).

## Schema converter (runtime)

A [`schema-converter`](./src/schemaConverter.ts) converts a `PropertyDDS` schema template into a [`TypedSchemaCollection`](https://github.com/microsoft/FluidFramework/blob/main/experimental/dds/tree2/src/feature-libraries/modular-schema/typedSchema/schemaBuilder.ts) at runtime, so that the resulting schema can be used by the `SharedTree`, for example:

```ts
PropertyFactory.register(propertyDDSSchemas);
const fullDocumentSchema = convertPropertyToSharedTreeStorageSchema(
	rootFieldKind,
	new Set([...allowedRootTypeNames]),
);
sharedTree.storedSchema.update(fullDocumentSchema);
```

The converter comprehensively adds `array` and `map` collection schemas for all types referenced in the `PropertyDDS` schema.

### Built-in schemas

The converter automatically adds built-in PropertyDDS types to the resulting schema,
including their `array` and `map` collection schemas (`set` collections are not supported yet).
This includes the following primitive types:

-   `Bool`,
-   `String`,
-   `Reference`,
-   `Int8`,
-   `Uint8`,
-   `Int16`,
-   `Uint16`,
-   `Int32`,
-   `Int64`,
-   `Uint32`,
-   `Uint64`,
-   `Float32`,
-   `Float64`,
-   `Enum`,

as well as `NodeProperty`, `NamedProperty`, `NamedNodeProperty` and `RelationshipProperty` types.

### Limitations

The main limitation is currently the runtime nature of the converter, which means that developers can only buid applications using the general purpose APIs of the `EditableTree` without static types. Using the resulting schema to generate static types using e.g. a `schema-aware` API (see [`schema-aware`](https://github.com/microsoft/FluidFramework/blob/main/experimental/dds/tree2/src/feature-libraries/schema-aware/README.md)) of the `SharedTree` is currently still a work in progress.

In addition, the following concepts are currently not supported by the schema converter and/or the `SharedTree`:

-   annotations;
-   length constraints for arrays / strings;
-   constants;
-   enums (currently supported as just a primitive number schema);
-   default values;
-   implicit type definitions. The `PropertyDDS` schema allows to define a structure of a child property in-place instead of explicitly defining its type using a `typeid` attribute. Such "implicit" types would probably require auto-generating their type names in order to be properly converted into the `SharedTree` schema.
