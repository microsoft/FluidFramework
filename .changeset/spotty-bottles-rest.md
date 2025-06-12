---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Persisted metadata for Shared Tree schemas

The persisted metadata feature for Shared Tree allows an application author to write metadata along with the schema. This feature is supported for both object node and field schemas.

#### Using the persisted metadata feature

As of now, persisted metadata support is available via the SchemaFactoryAlpha API:

```ts
// Construct a schema factory with alpha APIs
const schemaFactory = new SchemaFactoryAlpha("com.example");
```

Persisted metadata can take the shape of any JSON-serializable object, e.g.:

```ts
const persistedMetadata = { a: 2 };
```

#### Feature flag

(TODO)

#### Examples

##### Field schemas with persisted metadata

```ts
// Construct a schema factory with alpha APIs
const schemaFactory = new SchemaFactoryAlpha("com.example");

// Define metadata. This can take the shape of any JSON-serializable object.
const persistedMetadata = { "a": 2 };

// Foo is an object type with metadata
class Foo extends schemaFactory.objectAlpha("Foo", {
    // Metadata for a required number field
    bar: schemaFactory.required(schemaFactory.number, { persistedMetadata }),

    // Metadata for an optional string field   
    baz: schemaFactory.optional(schemaFactory.string, { persistedMetadata }),
// Metadata for the object type Foo       
}, { persistedMetadata }) {}
```

##### Recursive field schemas

```ts
// Construct a schema factory with alpha APIs
const schemaFactory = new SchemaFactoryAlpha("com.example");

// Define metadata. This can take the shape of any JSON-serializable object.
const persistedMetadata = { "a": 2 };

// Recursive object schema with persisted metadata
class RecursiveObject extends schemaFactory.objectRecursive("RecursiveObject", {
    x: [() => RecursiveObject, schemaFactory.number],
}, { persistedMetadata }) {}

// Recursive field schema with metadata
const recursiveField = schemaFactory.optionalRecursive(
    [() => RecursiveObject, schemaFactory.number],
    { persistedMetadata });
```

##### Recursive object schemas

```ts
// Construct a schema factory with alpha APIs
const schemaFactory = new SchemaFactoryAlpha("com.example");

// Define metadata. This can take the shape of any JSON-serializable object.
const persistedMetadata = { "a": 2 };

// Recursive array schema
class Foos extends schemaFactory.arrayRecursive(
    "FooList",
    [() => Foo],
    { persistedMetadata }) {}

// Recursive object schema
class Foo extends schemaFactory.objectRecursive(
    "Foo",
    { fooList: Foos },
    { persistedMetadata }) {}

// Recursive map schema
class FooMap extends schemaFactory.mapRecursive(
    "FooMap",
    [() => Foo],
    { persistedMetadata }) {}
```
