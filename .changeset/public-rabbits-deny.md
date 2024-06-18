---
"fluid-framework": minor
"@fluidframework/tree": minor
---

Move several types into InternalTypes

The stable public API surface for Tree has been reduced.
Several types have been moved into InternalTypes, indicating that they are not fully stable nor intended to be referenced by users of Tree.

-   NodeBuilderData
-   FieldHasDefault
-   TreeNodeSchemaNonClass
-   TreeArrayNodeBase
-   ScopedSchemaName
-   DefaultProvider
-   typeNameSymbol
-   InsertableObjectFromSchemaRecord
-   ObjectFromSchemaRecord
-   FieldHasDefaultUnsafe
-   ObjectFromSchemaRecordUnsafe
-   TreeObjectNodeUnsafe
-   TreeFieldFromImplicitFieldUnsafe
-   TreeNodeFromImplicitAllowedTypesUnsafe
-   InsertableTreeNodeFromImplicitAllowedTypesUnsafe
-   TreeArrayNodeUnsafe
-   TreeMapNodeUnsafe
-   InsertableObjectFromSchemaRecordUnsafe
-   InsertableTreeFieldFromImplicitFieldUnsafe
-   InsertableTypedNodeUnsafe
-   NodeBuilderDataUnsafe
-   NodeFromSchemaUnsafe
-   FlexList
-   TreeApi

Additionally a few more types which could not be moved due to technically limitations have been documented that they should be treated similarly.

-   TreeNodeApi
-   TreeNodeSchemaCore
-   All \*Unsafe type (use for construction of recursive schema).
-   WithType
-   AllowedTypes
-   FieldSchemaUnsafe

Also to reduce confusion `type` was renamed to `typeNameSymbol`, and is now only type exported. `Tree.is` should be used to get type information from `TreeNodes` instead.
