---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---

Improvements to typing of object node schema

Several tweaks to the typing of object node schema have been made to allow exposing an `@alpha` `ObjectNodeSchema` type.

[SchemaFactoryAlpha](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class)'s `object` and `objectRecursive` now return schema which are compatible with the new `ObjectNodeSchema` type.
This new `ObjectNodeSchema` type exposes a `fields: ReadonlyMap<string, FieldSchemaAlpha & SimpleObjectFieldSchema>` property which provides an easy way to get information about the object's fields.

Additionally an alpha `ObjectNodeSchema` object is added to enable support for `schema instanceof ObjectNodeSchema` to safely narrow `TreeNodeSchema` to this new type.

In support of this work, several typing details were fixed including:

- `info` field of `[typeSchemaSymbol]` type brand on recursive object schema was specified to match non-recursive variants.
- Type of field metadata was correctly plumbed through `optionalReclusive` and `requiredRecursive`.
- When fields object provided to [SchemaFactory.object](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#object-method) is typed as `RestrictiveStringRecord<ImplicitFieldSchema>` the resulting [TreeObjectNode](https://fluidframework.com/docs/api/fluid-framework/treeobjectnode-typealias) no longer gets a `Record<string, TreeNode | TreeLeafValue>` signature which could incorrectly conflict with custom members added to the object. Instead `{}` is used to provide no information about felids on the type when the schema provides no information about them. Additionally this case is explicitly made non-constructable: the constructor takes in `never` instead of a `Record<string,never>` which could be erroneously satisfied with an empty object due to how TypeScript assignability rules consider records to have all allowed fields, but also allow objects missing those fields to be assigned to them.

Lastly, `metadata` on the various schema types has been made required instead of optional.
This does not impact the APIs for constructing schema: when `undefined` is provided the schema now defaults to `{}` instead of `undefined`.
This reduces the number of cases code reading metadata from schema has to handle.
