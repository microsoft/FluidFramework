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
	isTreeValue,
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

export { allowsValue, assertAllowedValue, isFluidHandle } from "./valueUtilities.js";

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
	NodeChangeset,
	FieldChangeMap,
	FieldChange,
	FieldChangeset,
	ToDelta,
	ModularChangeset,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	CrossFieldManager,
	CrossFieldTarget,
	FieldKind,
	FullSchemaPolicy,
	allowsRepoSuperset,
	GenericChangeset,
	genericFieldKind,
	HasFieldChanges,
	NodeExistsConstraint,
	NodeExistenceState,
	FieldKindWithEditor,
	ModularChangeFamily,
	makeV0Codec,
	RelevantRemovedRootsFromChild,
	EncodedModularChangeset,
} from "./modular-schema/index.js";

export { Multiplicity } from "./multiplicity.js";

export {
	FlexTreeNodeSchema,
	AllowedTypes,
	TreeFieldSchema,
	FlexTreeSchema,
	Any,
	SchemaLibraryData,
	LazyTreeNodeSchema,
	ViewSchema,
	SchemaLintConfiguration,
	FieldNodeSchema,
	LeafNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
	bannedFieldNames,
	fieldApiPrefixes,
	validateObjectNodeFieldName,
	Unenforced,
	AllowedTypeSet,
	markEager,
	MapFieldSchema,
	SchemaCollection,
	TreeNodeSchemaBase,
	FlexListToUnion,
	LazyItem,
	isLazy,
	NormalizeObjectNodeFields,
	NormalizeField as NormalizeFieldSchema,
	Fields,
	intoStoredSchema,
	intoStoredSchemaCollection,
	ArrayToUnion,
	ExtractItemType,
	NormalizeLazyItem,
	FlexList,
} from "./typed-schema/index.js";

export {
	SchemaBuilderBase,
	SchemaLibrary,
	ImplicitFieldSchema,
	NormalizeField,
	ImplicitAllowedTypes,
	NormalizeAllowedTypes,
	SchemaBuilderOptions,
	normalizeAllowedTypes,
	normalizeField,
} from "./schemaBuilderBase.js";
export { SchemaBuilderInternal } from "./schemaBuilder.js";

export {
	mapRootChanges,
	mapFieldChanges,
	mapFieldsChanges,
	mapMark,
	mapMarkList,
} from "./deltaUtils.js";

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
	LocalNodeKey,
	createNodeKeyManager,
	createMockNodeKeyManager,
	StableNodeKey,
	NodeKeyIndex,
	NodeKeyManager,
	nodeKeyFieldKey,
	nodeKeyTreeIdentifier,
} from "./node-key/index.js";

export {
	FieldKinds,
	Required,
	Optional,
	Sequence,
	NodeKeyFieldKind,
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
	intoDelta,
	relevantRemovedRoots,
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
	TreeEvent,
	EditableTreeEvents,
	FlexTreeUnknownUnboxed,
	onNextChange,
	isFlexTreeNode,

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
	NodeKeys,
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

export { SchemaChange, makeSchemaChangeCodec, EncodedSchemaChange } from "./schema-edits/index.js";

export { makeMitigatedChangeFamily } from "./mitigatedChangeFamily.js";
