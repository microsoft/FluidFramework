/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ChangeMetadata,
	CommitKind,
	type CommitMetadata,
	type LocalChangeMetadata,
	type RemoteChangeMetadata,
	type Revertible,
	type RevertibleAlpha,
	type RevertibleAlphaFactory,
	type RevertibleFactory,
	RevertibleStatus,
	ValueSchema,
} from "./core/index.js";

import type {
	IsListener as EventIsListener,
	Listenable as EventListenable,
	Listeners as EventListeners,
	Off as EventOff,
} from "@fluidframework/core-interfaces";

/**
 * {@inheritdoc @fluidframework/core-interfaces#Listeners}
 * @public
 * @deprecated Deprecated in `@fluidframework/tree`. Consider importing from `fluid-framework` or `@fluidframework/core-interfaces` instead.
 */
export type Listeners<T extends object> = EventListeners<T>;
/**
 * {@inheritdoc @fluidframework/core-interfaces#IsListener}
 * @public
 * @deprecated Deprecated in `@fluidframework/tree`. Consider importing from `fluid-framework` or `@fluidframework/core-interfaces` instead.
 */
export type IsListener<T> = EventIsListener<T>;
/**
 * {@inheritdoc @fluidframework/core-interfaces#Listenable}
 * @public
 * @deprecated Deprecated in `@fluidframework/tree`. Consider importing from `fluid-framework` or `@fluidframework/core-interfaces` instead.
 */
export type Listenable<T extends object> = EventListenable<T>;
/**
 * {@inheritdoc @fluidframework/core-interfaces#Off}
 * @public
 * @deprecated Deprecated in `@fluidframework/tree`. Consider importing from `fluid-framework` or `@fluidframework/core-interfaces` instead.
 */
export type Off = EventOff;

export {
	type CodecName,
	type CodecWriteOptions,
	type CodecWriteOptionsBeta,
	FluidClientVersion,
	type FormatValidator,
	FormatValidatorNoOp,
	type FormatVersion,
	type ICodecOptions,
} from "./codec/index.js";
export { FormatValidatorBasic } from "./external-utilities/index.js";
export {
	type IncrementalEncodingPolicy,
	TreeCompressionStrategy,
	type TreeIndex,
	type TreeIndexKey,
	type TreeIndexNodes,
	TreeStatus,
} from "./feature-libraries/index.js";
export {
	type BranchableTree,
	type CreateIndependentTreeAlphaOptions,
	type ForestOptions,
	type ForestType,
	ForestTypeExpensiveDebug,
	ForestTypeOptimized,
	ForestTypeReference,
	type ITreeInternal,
	type IndependentViewOptions,
	type ObservationResults,
	type RunTransaction,
	type SharedTreeFormatOptions,
	type SharedTreeOptions,
	type SharedTreeOptionsBeta,
	Tree,
	TreeAlpha,
	type TreeBranchFork,
	type TreeIdentifierUtils,
	type ViewContent,
	createIndependentTreeAlpha,
	createIndependentTreeBeta,
	getBranch,
	independentInitializedView,
	independentView,
	persistedToSimpleSchema,
} from "./shared-tree/index.js";
export { SharedTreeAttributes, SharedTreeFactoryType } from "./sharedTreeAttributes.js";
export {
	type AllowedTypeMetadata,
	// Types not really intended for public use, but used in inferred types exposed in the public API.
	// Can not be moved to internalTypes since doing so causes app code to throw errors like:
	// error TS2742: The inferred type of 'Inventory' cannot be named without a reference to '../node_modules/@fluidframework/tree/lib/internalTypes.js'. This is likely not portable. A type annotation is necessary.
	type AllowedTypes,
	type AllowedTypesFull,
	type AllowedTypesFullEvaluated,
	type AllowedTypesFullFromMixed,
	type AllowedTypesFullFromMixedUnsafe,
	type AllowedTypesFullUnsafe,
	type AllowedTypesMetadata,
	type AnnotateAllowedTypesList,
	type AnnotateAllowedTypesListUnsafe,
	type AnnotatedAllowedType,
	type AnnotatedAllowedTypeUnsafe,
	type AnnotatedAllowedTypes,
	type AnnotatedAllowedTypesUnsafe,
	type ArrayNodeCustomizableSchema,
	type ArrayNodeCustomizableSchemaUnsafe,
	type ArrayNodePojoEmulationSchema,
	ArrayNodeSchema,
	type ArrayPlaceAnchor,
	type ConciseTree,
	type DirtyTreeMap,
	type DirtyTreeStatus,
	type FactoryContent,
	type FactoryContentObject,
	FieldKind,
	type FieldProps,
	type FieldPropsAlpha,
	FieldSchema,
	type FieldSchemaAlpha,
	type FieldSchemaAlphaUnsafe,
	type FieldSchemaMetadata,
	type FixRecursiveArraySchema,
	type FixRecursiveRecursionLimit,
	type HandleConverter,
	type ITree,
	type ITreeAlpha,
	type ITreeConfigurationOptions,
	type ITreeViewConfiguration,
	type IdentifierIndex,
	type ImplicitAllowedTypes,
	type ImplicitFieldSchema,
	type Input,
	type Insertable,
	type InsertableContent,
	type InsertableField,
	type InsertableTreeFieldFromImplicitField,
	type InsertableTreeNodeFromAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type InsertableTypedNode,
	type InternalTreeNode,
	IterableTreeArrayContent,
	type JsonArrayNodeSchema,
	type JsonFieldSchema,
	type JsonLeafNodeSchema,
	type JsonLeafSchemaType,
	type JsonMapNodeSchema,
	type JsonNodeSchema,
	type JsonNodeSchemaBase,
	type JsonObjectNodeSchema,
	type JsonRecordNodeSchema,
	type JsonRefPath,
	type JsonSchemaId,
	type JsonSchemaRef,
	type JsonSchemaType,
	type JsonStringKeyPatternProperties,
	// Back to normal types
	type JsonTreeSchema,
	KeyEncodingOptions,
	type LazyItem,
	type LeafSchema,
	type MapNodeCustomizableSchema,
	type MapNodeCustomizableSchemaUnsafe,
	type MapNodePojoEmulationSchema,
	MapNodeSchema,
	type NoChangeConstraint,
	type NodeChangedData,
	type NodeFromSchema,
	type NodeInDocumentConstraint,
	NodeKind,
	type NodeSchemaMetadata,
	type NodeSchemaOptions,
	type NodeSchemaOptionsAlpha,
	type NumberKeys,
	type ObjectFromSchemaRecord,
	ObjectNodeSchema,
	type ObjectSchemaOptions,
	type ObjectSchemaOptionsAlpha,
	type ReadSchema,
	type ReadableField,
	type ReadonlyArrayNode,
	type RecordNodeCustomizableSchema,
	type RecordNodeInsertableData,
	type RecordNodePojoEmulationSchema,
	RecordNodeSchema,
	type RunTransactionParams,
	type SchemaCompatibilityStatus,
	SchemaFactory,
	SchemaFactoryAlpha,
	SchemaFactoryBeta,
	type SchemaFactory_base,
	type SchemaStatics,
	type SchemaStaticsBeta,
	type SchemaType,
	type SchemaUpgrade,
	type SchemaVisitor,
	type SimpleAllowedTypeAttributes,
	type SimpleArrayNodeSchema,
	type SimpleFieldSchema,
	type SimpleLeafNodeSchema,
	type SimpleMapNodeSchema,
	type SimpleNodeSchema,
	type SimpleNodeSchemaBase,
	type SimpleNodeSchemaBaseAlpha,
	type SimpleObjectFieldSchema,
	type SimpleObjectNodeSchema,
	type SimpleRecordNodeSchema,
	// Index APIs
	type SimpleTreeIndex,
	type SimpleTreeSchema,
	type SnapshotFileSystem,
	type SnapshotSchemaCompatibilityOptions,
	type System_Unsafe,
	type TransactionCallbackStatus,
	type TransactionConstraint,
	type TransactionConstraintAlpha,
	type TransactionResult,
	type TransactionResultExt,
	type TransactionResultFailed,
	type TransactionResultSuccess,
	TreeArrayNode,
	// Beta APIs
	TreeBeta,
	type TreeBranch,
	type TreeBranchAlpha,
	type TreeBranchEvents,
	type TreeChangeEvents,
	type TreeChangeEventsBeta,
	type TreeEncodingOptions,
	type TreeFieldFromImplicitField,
	type TreeLeafValue,
	type TreeMapNode,
	TreeNode,
	// Types not really intended for public use, but used in links.
	// Can not be moved to internalTypes since doing so causes app code to throw errors like:
	// Error: src/simple-tree/objectNode.ts:72:1 - (ae-unresolved-link) The @link reference could not be resolved: The package "@fluidframework/tree" does not have an export "TreeNodeApi"
	type TreeNodeApi,
	type TreeNodeFromImplicitAllowedTypes,
	type TreeNodeSchema,
	type TreeNodeSchemaClass,
	type TreeNodeSchemaCore,
	type TreeNodeSchemaNonClass,
	type TreeObjectNode,
	type TreeParsingOptions,
	type TreeRecordNode,
	type TreeRecordNodeUnsafe,
	type TreeSchema,
	type TreeSchemaEncodingOptions,
	type TreeView,
	type TreeViewAlpha,
	type TreeViewBeta,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	type TreeViewEvents,
	type UnannotateAllowedTypeUnsafe,
	type UnannotateAllowedTypesList,
	type UnannotateAllowedTypesListUnsafe,
	type Unenforced,
	type Unhydrated,
	type UnsafeUnknownSchema,
	// Recursive Schema APIs
	type ValidateRecursiveSchema,
	type ValidateRecursiveSchemaTemplate,
	type VerboseTree,
	// Other
	type VerboseTreeNode,
	type ViewableTree,
	type VoidTransactionCallbackStatus,
	type WithType,
	// experimental @alpha APIs:
	adaptEnum,
	allowUnused,
	asTreeViewAlpha,
	checkCompatibility,
	comparePersistedSchema,
	contentSchemaSymbol,
	createArrayInsertionAnchor,
	createIdentifierIndex,
	createSimpleTreeIndex,
	decodeSchemaCompatibilitySnapshot,
	encodeSchemaCompatibilitySnapshot,
	enumFromStrings,
	eraseSchemaDetails,
	eraseSchemaDetailsSubclassable,
	evaluateLazySchema,
	exportCompatibilitySchemaSnapshot,
	extractPersistedSchema,
	generateSchemaFromSimpleSchema,
	getJsonSchema,
	getSimpleSchema,
	importCompatibilitySchemaSnapshot,
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	normalizeAllowedTypes,
	normalizeFieldSchema,
	replaceConciseTreeHandles,
	replaceHandles,
	replaceVerboseTreeHandles,
	rollback,
	singletonSchema,
	snapshotSchemaCompatibility,
	trackDirtyNodes,
	// System types (not in Internal types for various reasons, like doc links or cannot be named errors).
	type typeSchemaSymbol,
	walkAllowedTypes,
	walkFieldSchema,
	walkNodeSchema,
} from "./simple-tree/index.js";
export {
	SharedTree,
	configuredSharedTree,
	configuredSharedTreeAlpha,
	configuredSharedTreeBeta,
	configuredSharedTreeBetaLegacy,
} from "./treeFactory.js";
export type {
	IsUnion,
	JsonCompatible,
	JsonCompatibleObject,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlyObject,
	MakeNominal,
	PopUnion,
	// Other
	RestrictiveReadonlyRecord,
	RestrictiveStringRecord,
	UnionToIntersection,
	UnionToTuple,
	areSafelyAssignable,
	eitherIsAny,
	isAny,
	isAssignableTo,
	requireAssignableTo,
	requireFalse,
	// Type Testing
	requireTrue,
} from "./util/index.js";
export { cloneWithReplacements } from "./util/index.js";

import * as InternalTypes from "./internalTypes.js";
/**
 * Contains types used by the API, but which serve mechanical purposes and do not represent semantic concepts.
 * They are used internally to implement API aspects, but are not intended for use by external consumers.
 */
// eslint-disable-next-line unicorn/prefer-export-from -- fixing requires `export * as` (breaks API-Extractor)
export { InternalTypes };

export { asAlpha, asBeta } from "./api.js";
export { ExtensibleUnionNode } from "./extensibleUnionNode.js";
export { JsonAsTree } from "./jsonDomainSchema.js";
export { FluidSerializableAsTree } from "./serializableDomainSchema.js";
// Internal/System types:
// These would be put in `internalTypes` except doing so tents to cause errors like:
// The inferred type of 'NodeMap' cannot be named without a reference to '../../node_modules/@fluidframework/tree/lib/internalTypes.js'. This is likely not portable. A type annotation is necessary.
export type { MapNodeInsertableData } from "./simple-tree/index.js";
export { type System_TableSchema, TableSchema } from "./tableSchema.js";
export { FormattedTextAsTree, TextAsTree } from "./text/index.js";
