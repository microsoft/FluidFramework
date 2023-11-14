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
	isPrimitiveValue,
	getPrimaryField,
	PrimitiveValue,
	ContextuallyTypedNodeDataObject,
	ContextuallyTypedNodeData,
	MarkedArrayLike,
	isContextuallyTypedNodeDataObject,
	getFieldKind,
	getFieldSchema,
	ArrayLikeMut,
	cursorFromContextualData,
	cursorsFromContextualData,
	ContextuallyTypedFieldData,
	cursorForTypedData,
	cursorForTypedTreeData,
	cursorsForTypedFieldData,
	FieldGenerator,
	TreeDataContext,
	normalizeNewFieldContent,
	NewFieldContent,
	assertAllowedValue,
} from "./contextuallyTyped";

export { ForestSummarizer } from "./forestSummarizer";
export { cursorForMapTreeField, cursorForMapTreeNode, mapTreeFromCursor } from "./mapTreeCursor";
export { MemoizedIdRangeAllocator, IdRange } from "./memoizedIdRangeAllocator";
export { buildForest } from "./object-forest";
export { SchemaSummarizer, SchemaEditor, encodeTreeSchema } from "./schemaSummarizer";
// This is exported because its useful for doing comparisons of schema in tests.
export { makeSchemaCodec } from "./schemaIndexFormat";
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
	EditDescription,
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
	Multiplicity,
	FullSchemaPolicy,
	allowsRepoSuperset,
	GenericChangeset,
	genericFieldKind,
	RevisionIndexer,
	RevisionMetadataSource,
	RevisionInfo,
	HasFieldChanges,
	revisionMetadataSourceFromInfo,
	NodeExistsConstraint,
	NodeExistenceState,
	FieldKindWithEditor,
	RemovedTreesFromChild,
} from "./modular-schema";

export {
	TreeNodeSchema,
	AllowedTypes,
	TreeFieldSchema,
	TreeSchema,
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

export { mapFieldChanges, mapFieldsChanges, mapMark, mapMarkList } from "./deltaUtils";

export {
	TreeChunk,
	chunkTree,
	buildChunkedForest,
	defaultChunkPolicy,
	makeTreeChunker,
	decode,
	uncompressedEncode,
	schemaCompressedEncode,
	EncodedChunk,
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
} from "./default-field-kinds";

export {
	AssignableFieldKinds,
	FlexTreeFieldNode,
	FlexibleFieldContent,
	FlexibleNodeContent,
	InternalEditableTreeTypes,
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
	FlexTreeTyped,
	Context,
	TreeEvent,
	EditableTreeEvents,
} from "./flex-tree";

export {
	getProxyForField,
	ObjectFields,
	ProxyField,
	ProxyFieldInner,
	ProxyNode,
	ProxyNodeUnion,
	TreeList,
	SharedTreeMap,
	SharedTreeObject,
	ProxyRoot,
	Tree,
	TreeApi,
	SharedTreeNode,
	SharedTreeObjectFactory,
	FactoryTreeSchema,
	addFactory,
} from "./simple-tree";

export { treeSchemaFromStoredSchema } from "./storedToViewSchema";

export { TreeCompressionStrategy } from "./treeCompressionUtils";

// Split into separate import and export for compatibility with API-Extractor.
import * as SchemaAware from "./schema-aware";
export { SchemaAware };

export { DetachedFieldIndexSummarizer } from "./detachedFieldIndexSummarizer";
