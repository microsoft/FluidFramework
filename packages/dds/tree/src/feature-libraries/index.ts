/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	createDataBinderBuffering,
	createDataBinderDirect,
	createDataBinderInvalidating,
	createBinderOptions,
	createFlushableBinderOptions,
	type DataBinder,
	type BinderOptions,
	type Flushable,
	type FlushableBinderOptions,
	type FlushableDataBinder,
	type MatchPolicy,
	type SubtreePolicy,
	type BindSyntaxTree,
	indexSymbol,
	type BindPolicy,
	type BindTree,
	type BindTreeDefault,
	type DownPath,
	type BindPath,
	type PathStep,
	BindingType,
	type BindingContextType,
	type BindingContext,
	type VisitorBindingContext,
	type RemoveBindingContext,
	type InsertBindingContext,
	type BatchBindingContext,
	type InvalidationBindingContext,
	type OperationBinderEvents,
	type InvalidationBinderEvents,
	type CompareFunction,
	type BinderEventsCompare,
	type AnchorsCompare,
	toDownPath,
	comparePipeline,
	compileSyntaxTree,
} from "./editableTreeBinder.js";

export { allowsValue, assertAllowedValue, isTreeValue } from "./valueUtilities.js";

export type { FieldGenerator, TreeDataContext } from "./fieldGenerator.js";

export { ForestSummarizer } from "./forest-summary/index.js";
export {
	cursorForMapTreeField,
	cursorForMapTreeNode,
	mapTreeFromCursor,
	mapTreeFieldFromCursor,
} from "./mapTreeCursor.js";
export { MemoizedIdRangeAllocator, type IdRange } from "./memoizedIdRangeAllocator.js";
export { buildForest } from "./object-forest/index.js";
export { SchemaSummarizer, encodeTreeSchema, makeSchemaCodec } from "./schema-index/index.js";
export {
	stackTreeNodeCursor,
	type CursorAdapter,
	prefixPath,
	prefixFieldPath,
	type CursorWithNode,
	stackTreeFieldCursor,
} from "./treeCursorUtils.js";
export {
	cursorForJsonableTreeNode,
	cursorForJsonableTreeField,
	jsonableTreeFromCursor,
	jsonableTreeFromFieldCursor,
	jsonableTreeFromForest,
} from "./treeTextCursor.js";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as SequenceField from "./sequence-field/index.js";
export { SequenceField };

export {
	isNeverField,
	ModularEditBuilder,
	type FieldEditDescription as EditDescription,
	type FieldChangeHandler,
	type FieldChangeRebaser,
	type FieldEditor,
	type FieldChangeMap,
	type FieldChange,
	type FieldChangeset,
	type ToDelta,
	type ModularChangeset,
	makeModularChangeCodecFamily,
	type NodeChangeComposer,
	type NodeChangeInverter,
	type NodeChangeRebaser,
	type NodeChangePruner,
	type CrossFieldManager,
	CrossFieldTarget,
	FlexFieldKind,
	type FullSchemaPolicy,
	allowsRepoSuperset,
	type GenericChangeset,
	genericFieldKind,
	type HasFieldChanges,
	type NodeExistsConstraint,
	FieldKindWithEditor,
	ModularChangeFamily,
	type RelevantRemovedRootsFromChild,
	EncodedModularChangeset,
	updateRefreshers,
	type NodeId,
	type FieldChangeEncodingContext,
	type FieldKindConfiguration,
	type FieldKindConfigurationEntry,
	getAllowedContentIncompatibilities,
	isRepoSuperset,
} from "./modular-schema/index.js";

export {
	type FlexTreeNodeSchema,
	type FlexAllowedTypes,
	FlexFieldSchema,
	type FlexTreeSchema,
	Any,
	type SchemaLibraryData,
	type LazyTreeNodeSchema,
	ViewSchema,
	type SchemaLintConfiguration,
	FlexFieldNodeSchema,
	LeafNodeSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
	type Unenforced,
	type AllowedTypeSet,
	markEager,
	type FlexMapFieldSchema,
	type SchemaCollection,
	TreeNodeSchemaBase,
	type LazyItem,
	type FlexListToUnion,
	type ExtractItemType,
	isLazy,
	type NormalizeObjectNodeFields,
	type NormalizeField as NormalizeFieldSchema,
	type FlexObjectNodeFields,
	intoStoredSchema,
	intoStoredSchemaCollection,
	type NormalizeLazyItem,
	type FlexList,
} from "./typed-schema/index.js";

export {
	SchemaBuilderBase,
	type SchemaLibrary,
	type FlexImplicitFieldSchema,
	type NormalizeField,
	type FlexImplicitAllowedTypes,
	type NormalizeAllowedTypes,
	type SchemaBuilderOptions,
	normalizeAllowedTypes,
	normalizeField,
} from "./schemaBuilderBase.js";
export { SchemaBuilderInternal } from "./schemaBuilder.js";

export { mapRootChanges } from "./deltaUtils.js";

export {
	type TreeChunk,
	chunkTree,
	chunkFieldSingle,
	buildChunkedForest,
	defaultChunkPolicy,
	type FieldBatch,
	type FieldBatchCodec,
	makeTreeChunker,
	makeFieldBatchCodec,
	type FieldBatchEncodingContext,
} from "./chunked-forest/index.js";

export {
	compareLocalNodeKeys,
	createNodeKeyManager,
	isStableNodeKey,
	type LocalNodeKey,
	MockNodeKeyManager,
	type NodeKeyManager,
	nodeKeyTreeIdentifier,
	type StableNodeKey,
} from "./node-key/index.js";

export {
	FieldKinds,
	type Required,
	type Optional,
	type Sequence,
	type Identifier,
	type Forbidden,
	type DefaultChangeset,
	DefaultChangeFamily,
	DefaultEditBuilder,
	type IDefaultEditBuilder,
	type ValueFieldEditBuilder,
	type OptionalFieldEditBuilder,
	type SequenceFieldEditBuilder,
	defaultSchemaPolicy,
	fieldKinds,
	fieldKindConfigurations,
	intoDelta,
	relevantRemovedRoots,
	SchemaValidationErrors,
	isNodeInSchema,
	isFieldInSchema,
} from "./default-schema/index.js";

export {
	type AssignableFieldKinds,
	type FlexTreeFieldNode,
	type FlexibleFieldContent,
	type FlexibleNodeContent,
	type FlexTreeLeafNode,
	type FlexTreeMapNode,
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
	type FlexTreeSequenceField,
	Skip,
	type FlexTreeObjectNode,
	type FlexTreeObjectNodeTyped,
	type FlexTreeContext,
	type FlexTreeTypedField,
	type FlexTreeTypedNode,
	type FlexTreeTypedNodeUnion,
	type FlexTreeEntity,
	type FlexTreeField,
	type FlexTreeNode,
	getTreeContext,
	type CheckTypesOverlap,
	TreeStatus,
	Context,
	type FlexTreeNodeEvents,
	type FlexTreeUnknownUnboxed,
	isFlexTreeNode,
	ContextSlot,
	// Internal
	type FlexTreeTypedFieldInner,
	type FlexTreeUnboxFieldInner,
	type FlexTreeObjectNodeFields,
	type FlexTreeUnboxField,
	type FlexTreeUnboxNode,
	type FlexTreeUnboxNodeUnion,
	type IsArrayOfOne,
	type FlexibleNodeSubSequence,
	flexTreeMarker,
	FlexTreeEntityKind,
	type PropertyNameFromFieldKey,
	type ReservedObjectNodeFieldPropertyNames,
	type ReservedObjectNodeFieldPropertyNamePrefixes,
	reservedObjectNodeFieldPropertyNames,
	reservedObjectNodeFieldPropertyNamePrefixes,
	type FlexTreeObjectNodeFieldsInner,
	assertFlexTreeEntityNotFreed,
	flexTreeSlot,
	getSchemaAndPolicy,
	isFreedSymbol,
	LazyEntity,
	treeStatusFromAnchorCache,
} from "./flex-tree/index.js";

export { treeSchemaFromStoredSchema } from "./storedToViewSchema.js";

export { TreeCompressionStrategy } from "./treeCompressionUtils.js";

export { valueSchemaAllows } from "./valueUtilities.js";

export { DetachedFieldIndexSummarizer } from "./detachedFieldIndexSummarizer.js";

export {
	type SchemaChange,
	makeSchemaChangeCodecs,
	EncodedSchemaChange,
} from "./schema-edits/index.js";

export { makeMitigatedChangeFamily } from "./mitigatedChangeFamily.js";

export {
	type MapTreeNode,
	isMapTreeNode,
	getOrCreateMapTreeNode,
	tryGetMapTreeNode,
} from "./flex-map-tree/index.js";
