---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Improved Type Checking for Recursive Object Schema Fields

Most ways to provide incorrectly typed data for fields of [recursive object schema](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#objectrecursive-method) now produce simpler type errors without relying on [ValidateRecursiveSchema](https://fluidframework.com/docs/api/fluid-framework/validaterecursiveschema-typealias).

As a sideeffect of this work some schema which violated the documented allowed patterns specified by [SchemaFactory](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#schemafactory-remarks) but used to work (as long as they were not package exported) no longer compile.

The specific case known to break is when:

1. An Object node schema is co-recursive with an Array node schema.
2. The Array does not declared a named subclass.
3. The schema reference from the Object to the Array is not using the [lazy syntax](https://fluidframework.com/docs/api/fluid-framework/lazyitem-typealias).

For example:

```typescript
class Foo extends sf.objectRecursive("Foo", {
	fooList: sf.arrayRecursive("FooList", [() => Foo]), // Bad
}) {}
{
	type _check = ValidateRecursiveSchema<typeof Foo>;
}
```

Such a schema is disallowed according to the documentation [recursive schema must explicitly declare a named class]((https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#schemafactory-remarks)).
This restriction is necessary avoid [Generated `.d.ts` files replacing recursive references with `any`](https://github.com/microsoft/TypeScript/issues/55832).
Fixing this code is now also necessary to avoid a compile error.

```typescript
// Fixed
class FooList extends sf.arrayRecursive("FooList", [() => Foo]) {}
{
	type _check = ValidateRecursiveSchema<typeof FooList>;
}
class Foo extends sf.objectRecursive("Foo", {
	fooList: FooList,
}) {}
{
	type _check = ValidateRecursiveSchema<typeof Foo>;
}
```

This change will also result in much nicer IntelliSense and type errors while fixing the typing if the schema is exported.

There are still several cases which still compile but violate this policy regarding recursive schema and can cause issues when exporting schema:
the should be migrated to the above pattern as well.

It is still valid to use non-recursive structurally named array and map schema inline: this change does not impact them.
