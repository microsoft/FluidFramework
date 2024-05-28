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
	DataBinder,
	BinderOptions,
	Flushable,
	FlushableBinderOptions,
	FlushableDataBinder,
	MatchPolicy,
	SubtreePolicy,
	BindSyntaxTree,
	indexSymbol,
	BindPolicy,
	BindTree,
	BindTreeDefault,
	DownPath,
	BindPath,
	PathStep,
	BindingType,
	BindingContextType,
	BindingContext,
	VisitorBindingContext,
	RemoveBindingContext,
	InsertBindingContext,
	BatchBindingContext,
	InvalidationBindingContext,
	OperationBinderEvents,
	InvalidationBinderEvents,
	CompareFunction,
	BinderEventsCompare,
	AnchorsCompare,
	toDownPath,
	comparePipeline,
	compileSyntaxTree,
} from "./editableTreeBinder.js";
export {
	typeNameSymbol,
	valueSymbol,
	ContextuallyTypedNodeDataObject,
	ContextuallyTypedNodeData,
	MarkedArrayLike,
	isContextuallyTypedNodeDataObject,
	getFieldKind,
	ArrayLikeMut,
	cursorFromContextualData,
	cursorsFromContextualData,
	ContextuallyTypedFieldData,
	cursorForTypedData,
	cursorForTypedTreeData,
	cursorsForTypedFieldData,
	normalizeNewFieldContent,
	NewFieldContent,
	getPossibleTypes,
	getAllowedTypes,
} from "./contextuallyTyped.js";

export { allowsValue, assertAllowedValue, isTreeValue } from "./valueUtilities.js";

export { FieldGenerator, TreeDataContext } from "./fieldGenerator.js";

export { ForestSummarizer } from "./forest-summary/index.js";
export { cursorForMapTreeField, cursorForMapTreeNode, mapTreeFromCursor } from "./mapTreeCursor.js";
export { MemoizedIdRangeAllocator, IdRange } from "./memoizedIdRangeAllocator.js";
export { buildForest } from "./object-forest/index.js";
export { SchemaSummarizer, encodeTreeSchema, makeSchemaCodec } from "./schema-index/index.js";
export {
	stackTreeNodeCursor,
	CursorAdapter,
	prefixPath,
	prefixFieldPath,
	CursorWithNode,
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
	FieldEditDescription as EditDescription,
	FieldChangeHandler,
	FieldChangeRebaser,
	FieldEditor,
	FieldChangeMap,
	FieldChange,
	FieldChangeset,
	ToDelta,
	ModularChangeset,
	makeModularChangeCodecFamily,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeChangePruner,
	CrossFieldManager,
	CrossFieldTarget,
	FlexFieldKind,
	FullSchemaPolicy,
	allowsRepoSuperset,
	GenericChangeset,
	genericFieldKind,
	HasFieldChanges,
	NodeExistsConstraint,
	NodeExistenceState,
	FieldKindWithEditor,
	ModularChangeFamily,
	RelevantRemovedRootsFromChild,
	EncodedModularChangeset,
	updateRefreshers,
	NodeId,
	FieldChangeEncodingContext,
	FieldKindConfiguration,
	FieldKindConfigurationEntry,
} from "./modular-schema/index.js";

export {
	FlexTreeNodeSchema,
	FlexAllowedTypes,
	FlexFieldSchema,
	FlexTreeSchema,
	Any,
	SchemaLibraryData,
	LazyTreeNodeSchema,
	ViewSchema,
	SchemaLintConfiguration,
	FlexFieldNodeSchema,
	LeafNodeSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
	Unenforced,
	AllowedTypeSet,
	markEager,
	FlexMapFieldSchema,
	SchemaCollection,
	TreeNodeSchemaBase,
	FlexListToUnion,
	LazyItem,
	isLazy,
	NormalizeObjectNodeFields,
	NormalizeField as NormalizeFieldSchema,
	FlexObjectNodeFields,
	intoStoredSchema,
	intoStoredSchemaCollection,
	ExtractItemType,
	NormalizeLazyItem,
	FlexList,
} from "./typed-schema/index.js";

export {
	SchemaBuilderBase,
	SchemaLibrary,
	FlexImplicitFieldSchema,
	NormalizeField,
	FlexImplicitAllowedTypes,
	NormalizeAllowedTypes,
	SchemaBuilderOptions,
	normalizeAllowedTypes,
	normalizeField,
} from "./schemaBuilderBase.js";
export { SchemaBuilderInternal } from "./schemaBuilder.js";

export { mapRootChanges } from "./deltaUtils.js";

export {
	TreeChunk,
	chunkTree,
	chunkFieldSingle,
	buildChunkedForest,
	defaultChunkPolicy,
	FieldBatch,
	FieldBatchCodec,
	makeTreeChunker,
	makeFieldBatchCodec,
	FieldBatchEncodingContext,
} from "./chunked-forest/index.js";

export {
	compareLocalNodeKeys,
	createNodeKeyManager,
	isStableNodeKey,
	LocalNodeKey,
	MockNodeKeyManager,
	NodeKeyIndex,
	NodeKeyManager,
	nodeKeyTreeIdentifier,
	StableNodeKey,
} from "./node-key/index.js";

export {
	FieldKinds,
	Required,
	Optional,
	Sequence,
	Identifier,
	Forbidden,
	DefaultChangeset,
	DefaultChangeFamily,
	DefaultEditBuilder,
	IDefaultEditBuilder,
	ValueFieldEditBuilder,
	OptionalFieldEditBuilder,
	SequenceFieldEditBuilder,
	defaultSchemaPolicy,
	fieldKinds,
	fieldKindConfigurations,
	intoDelta,
	relevantRemovedRoots,
	SchemaValidationErrors,
	isNodeInSchema,
} from "./default-schema/index.js";

export {
	AssignableFieldKinds,
	FlexTreeFieldNode,
	FlexibleFieldContent,
	FlexibleNodeContent,
	FlexTreeLeafNode,
	FlexTreeMapNode,
	FlexTreeOptionalField,
	FlexTreeRequiredField,
	FlexTreeSequenceField,
	Skip,
	FlexTreeObjectNode,
	FlexTreeObjectNodeTyped,
	FlexTreeContext,
	FlexTreeTypedField,
	FlexTreeTypedNode,
	FlexTreeTypedNodeUnion,
	FlexTreeEntity,
	FlexTreeField,
	FlexTreeNode,
	getTreeContext,
	CheckTypesOverlap,
	TreeStatus,
	Context,
	FlexTreeNodeEvents,
	FlexTreeUnknownUnboxed,
	isFlexTreeNode,
	ContextSlot,

	// Internal
	FlexTreeTypedFieldInner,
	FlexTreeUnboxFieldInner,
	FlexTreeObjectNodeFields,
	FlexTreeUnboxField,
	FlexTreeUnboxNode,
	FlexTreeUnboxNodeUnion,
	FlexTreeNodeKeyField,
	IsArrayOfOne,
	FlexibleNodeSubSequence,
	flexTreeMarker,
	FlexTreeEntityKind,
	PropertyNameFromFieldKey,
	ReservedObjectNodeFieldPropertyNames,
	ReservedObjectNodeFieldPropertyNamePrefixes,
	reservedObjectNodeFieldPropertyNames,
	reservedObjectNodeFieldPropertyNamePrefixes,
	FlexTreeObjectNodeFieldsInner,
	assertFlexTreeEntityNotFreed,
	flexTreeSlot,
	getSchemaAndPolicy,
} from "./flex-tree/index.js";

export { treeSchemaFromStoredSchema } from "./storedToViewSchema.js";

export { TreeCompressionStrategy } from "./treeCompressionUtils.js";

export { valueSchemaAllows } from "./valueUtilities.js";

export {
	InsertableFlexNode,
	InsertableFlexField,
	AllowedTypesToFlexInsertableTree,
	ApplyMultiplicity,

	// Internal
	CollectOptions,
	TypedFields,
	UnbrandedName,
	EmptyObject,
} from "./schema-aware/index.js";

export { DetachedFieldIndexSummarizer } from "./detachedFieldIndexSummarizer.js";

export { SchemaChange, makeSchemaChangeCodecs, EncodedSchemaChange } from "./schema-edits/index.js";

export { makeMitigatedChangeFamily } from "./mitigatedChangeFamily.js";
