/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	EmptyKey,
	type FieldKey,
	type TreeValue,
	type FieldMapObject,
	type NodeData,
	type GenericTreeNode,
	type JsonableTree,
	type GenericFieldsNode,
	type TreeNodeSchemaIdentifier,
	type TreeFieldStoredSchema,
	ValueSchema,
	TreeNodeStoredSchema,
	type FieldKindIdentifier,
	type TreeTypeSet,
	type TreeStoredSchema,
	type Revertible,
	CommitKind,
	RevertibleStatus,
	type CommitMetadata,
	type StoredSchemaCollection,
	type ErasedTreeNodeSchemaDataFormat,
	ObjectNodeStoredSchema,
	MapNodeStoredSchema,
	LeafNodeStoredSchema,
} from "./core/index.js";
export { type Brand } from "./util/index.js";

export {
	type Listeners,
	type IsListener,
	type Listenable,
	type Off,
} from "./events/index.js";

export {
	type LazyItem,
	TreeStatus,
	type Unenforced,
	TreeCompressionStrategy,
} from "./feature-libraries/index.js";

export {
	type ISharedTree,
	type SharedTreeOptions,
	ForestType,
	type SharedTreeContentSnapshot,
	type RevertibleFactory,
	type SharedTreeFormatOptions,
	SharedTreeFormatVersion,
	Tree,
	type TransactionConstraint,
	type NodeInDocumentConstraint,
	type RunTransaction,
	rollback,
} from "./shared-tree/index.js";

export {
	TreeArrayNode,
	type Unhydrated,
	IterableTreeArrayContent,
	TreeNode,
	type ITree,
	type TreeNodeSchema,
	TreeViewConfiguration,
	type ITreeViewConfiguration,
	type ITreeConfigurationOptions,
	type TreeView,
	type TreeViewEvents,
	SchemaFactory,
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
	type TreeChangeEvents,
	type NodeFromSchema,
	type TreeMapNode,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type TreeLeafValue,
	FieldKind,
	FieldSchema,
	type ImplicitAllowedTypes,
	type InsertableTreeFieldFromImplicitField,
	type InsertableTypedNode,
	NodeKind,
	type TreeObjectNode,
	type TreeNodeFromImplicitAllowedTypes,
	type TreeNodeSchemaClass,
	type SchemaCompatibilityStatus,
	type FieldProps,
	type InternalTreeNode,
	// Types not really intended for public use, but used in links.
	// Can not be moved to internalTypes since doing so causes app code to throw errors like:
	// Error: src/simple-tree/objectNode.ts:72:1 - (ae-unresolved-link) The @link reference could not be resolved: The package "@fluidframework/tree" does not have an export "TreeNodeApi"
	type TreeNodeApi,
	type TreeNodeSchemaCore,
	// Types not really intended for public use, but used in inferred types exposed in the public API.
	// Can not be moved to internalTypes since doing so causes app code to throw errors like:
	// error TS2742: The inferred type of 'Inventory' cannot be named without a reference to '../node_modules/@fluidframework/tree/lib/internalTypes.js'. This is likely not portable. A type annotation is necessary.
	type AllowedTypes,
	type WithType,
	type TreeObjectNodeUnsafe,
	type InsertableTreeNodeFromImplicitAllowedTypesUnsafe,
	type TreeArrayNodeUnsafe,
	type TreeMapNodeUnsafe,
	type InsertableObjectFromSchemaRecordUnsafe,
	type InsertableTreeFieldFromImplicitFieldUnsafe,
	type FieldSchemaUnsafe,
	// Recursive Schema APIs
	type ValidateRecursiveSchema,
	type FixRecursiveArraySchema,
	// experimental @internal APIs:
	adaptEnum,
	enumFromStrings,
	singletonSchema,
	typedObjectValues,
	type EmptyObject,
	// test recursive schema for checking that d.ts files handles schema correctly
	test_RecursiveObject,
	test_RecursiveObject_base,
	test_RecursiveObjectPojoMode,
	type JsonTreeSchema,
	type JsonSchemaId,
	type JsonNodeSchema,
	type JsonNodeSchemaBase,
	type JsonLeafNodeSchema,
	type JsonMapNodeSchema,
	type JsonArrayNodeSchema,
	type JsonObjectNodeSchema,
	type JsonFieldSchema,
	type JsonSchemaRef,
	type JsonRefPath,
	type JsonSchemaType,
	type JsonLeafSchemaType,
	getJsonSchema,
} from "./simple-tree/index.js";
export { SharedTree, configuredSharedTree } from "./treeFactory.js";

export type { ICodecOptions, JsonValidator, SchemaValidationFunction } from "./codec/index.js";
export { noopValidator } from "./codec/index.js";
export { typeboxValidator } from "./external-utilities/index.js";

export {
	type Covariant,
	BrandedType,
	type RestrictiveReadonlyRecord,
	type MakeNominal,
} from "./util/index.js";

import * as InternalTypes from "./internalTypes.js";
export {
	/**
	 * Contains types used by the API, but which serve mechanical purposes and do not represent semantic concepts.
	 * They are used internally to implement API aspects, but are not intended for use by external consumers.
	 */
	InternalTypes,
};

// Internal/System types:
// These would be put in `internalTypes` except doing so tents to cause errors like:
// The inferred type of 'NodeMap' cannot be named without a reference to '../../node_modules/@fluidframework/tree/lib/internalTypes.js'. This is likely not portable. A type annotation is necessary.
export type { MapNodeInsertableData } from "./simple-tree/index.js";
