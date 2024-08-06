# @fluid-experimental/property-shared-tree-interop

This package contains tools and utilities that should help application developers migrate their projects
from `PropertyDDS` to the new `SharedTree` DDS (see the
[@fluidframework/tree](https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/README.md)).

## Schema converter (runtime)

This packages used to contain a [runtime schema converter](https://github.com/microsoft/FluidFramework/blob/614392a6ff0f83e279d851a009fb4fd37de10201/experimental/PropertyDDS/packages/property-shared-tree-interop/src/schemaConverter.ts) to converts a `PropertyDDS` schema template into a `SharedTree` schema.

This converter had two main issues:

1. It targeted the "FlexTree" schema system, which is now internal and planned to be removed from the tree package. Resolving this requires porting the schema converter to target either the stored schema abstraction or the new public [`TreeSchema`](https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/src/simple-tree/schemaFactory.ts). Doing so would require some rework with support for `any` is likely the biggest change since it is not supported anymore so instead an explicit list of all types would have to be used.
2. A more appropriate workflow, allowing use of schema aware APIs and a more standard tree usage experience, will require generating source code for the new tree schema which can be pasted into the updated application. A tool to take in a schema at runtime and generate such code was planned, but never implemented.

Usage if restored and updated could look something like:

```ts
PropertyFactory.register(propertyDDSSchemas);
const rootSchema = convertPropertyToSharedTreeStorageSchema(
	rootFieldKind,
	new Set([...allowedRootTypeNames]),
);
writeSource(fullDocumentSchema, "schema.ts");
```

The converter comprehensively added `array` and `map` collection schemas for all types referenced in the `PropertyDDS` schema.

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

### Additional Limitations

In addition, the following concepts are currently not supported by the schema converter and/or the `SharedTree`:

-   annotations;
-   length constraints for arrays / strings;
-   constants;
-   enums (currently supported as just a primitive number schema);
-   default values;
-   implicit type definitions. The `PropertyDDS` schema allows to define a structure of a child property in-place instead of explicitly defining its type using a `typeid` attribute. Such "implicit" types would probably require auto-generating their type names in order to be properly converted into the `SharedTree` schema.
