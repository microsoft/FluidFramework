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
	DeleteBindingContext,
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
} from "./editableTreeBinder";
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
} from "./contextuallyTyped";

export { allowsValue, assertAllowedValue, isFluidHandle } from "./valueUtilities";

export { FieldGenerator, TreeDataContext } from "./fieldGenerator";

export { ForestSummarizer } from "./forest-summary";
export { cursorForMapTreeField, cursorForMapTreeNode, mapTreeFromCursor } from "./mapTreeCursor";
export { MemoizedIdRangeAllocator, IdRange } from "./memoizedIdRangeAllocator";
export { buildForest } from "./object-forest";
export { SchemaSummarizer, SchemaEditor, encodeTreeSchema, makeSchemaCodec } from "./schema-index/";
export {
	stackTreeNodeCursor,
	CursorAdapter,
	prefixPath,
	prefixFieldPath,
	CursorWithNode,
	stackTreeFieldCursor,
} from "./treeCursorUtils";
export {
	cursorForJsonableTreeNode,
	cursorForJsonableTreeField,
	jsonableTreeFromCursor,
	jsonableTreeFromFieldCursor,
	jsonableTreeFromForest,
} from "./treeTextCursor";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as SequenceField from "./sequence-field";
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
	RelevantRemovedRootsFromChild,
} from "./modular-schema";

export { Multiplicity } from "./multiplicity";

export {
	TreeNodeSchema,
	AllowedTypes,
	TreeFieldSchema,
	FlexTreeSchema,
	Any,
	SchemaLibraryData,
	LazyTreeNodeSchema,
	InternalTypedSchemaTypes,
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
} from "./typed-schema";

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
} from "./schemaBuilderBase";
export { SchemaBuilderInternal } from "./schemaBuilder";

export {
	mapRootChanges,
	mapFieldChanges,
	mapFieldsChanges,
	mapMark,
	mapMarkList,
} from "./deltaUtils";

export {
	TreeChunk,
	chunkTree,
	buildChunkedForest,
	defaultChunkPolicy,
	makeTreeChunker,
	makeFieldBatchCodec,
} from "./chunked-forest";

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
} from "./node-key";

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
	intoDelta,
	relevantRemovedRoots,
} from "./default-schema";

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
	boxedIterator,
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
} from "./flex-tree";

export { treeSchemaFromStoredSchema } from "./storedToViewSchema";

export { TreeCompressionStrategy } from "./treeCompressionUtils";

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
} from "./schema-aware";

export { DetachedFieldIndexSummarizer } from "./detachedFieldIndexSummarizer";
export { makeMitigatedChangeFamily } from "./mitigatedChangeFamily";
