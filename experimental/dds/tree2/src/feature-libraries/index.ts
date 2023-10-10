/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	EditableField,
	EditableTree,
	EditableTreeContext,
	EditableTreeOrPrimitive,
	getEditableTreeContext,
	isEditableField,
	isPrimitive,
	isEditableTree,
	proxyTargetSymbol,
	UnwrappedEditableField,
	UnwrappedEditableTree,
	localNodeKeySymbol,
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
	setField,
} from "./editable-tree";

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
export { singleMapTreeCursor, mapTreeFromCursor } from "./mapTreeCursor";
export { MemoizedIdRangeAllocator, IdRange } from "./memoizedIdRangeAllocator";
export { buildForest } from "./object-forest";
export { SchemaSummarizer, SchemaEditor } from "./schemaSummarizer";
// This is exported because its useful for doing comparisons of schema in tests.
export { makeSchemaCodec } from "./schemaIndexFormat";
export {
	singleStackTreeCursor,
	CursorAdapter,
	prefixPath,
	prefixFieldPath,
	CursorWithNode,
} from "./treeCursorUtils";
export { singleTextCursor, jsonableTreeFromCursor } from "./treeTextCursor";

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
	NodeReviver,
	RevisionIndexer,
	RevisionMetadataSource,
	RevisionInfo,
	HasFieldChanges,
	revisionMetadataSourceFromInfo,
	NodeExistsConstraint,
	NodeExistenceState,
	FieldKindWithEditor,
} from "./modular-schema";

export {
	TreeSchema,
	AllowedTypes,
	FieldSchema,
	TypedSchemaCollection,
	Any,
	SchemaLibraryData,
	LazyTreeSchema,
	InternalTypedSchemaTypes,
	ViewSchema,
	SchemaLintConfiguration,
	FieldNodeSchema,
	LeafSchema,
	MapSchema,
	StructSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsStruct,
	bannedFieldNames,
	fieldApiPrefixes,
	validateStructFieldName,
} from "./typed-schema";

export { SchemaBuilderBase, SchemaLibrary } from "./schemaBuilderBase";
export { SchemaBuilder, SchemaBuilderInternal } from "./schemaBuilder";

export { mapFieldMarks, mapMark, mapMarkList, populateChildModifications } from "./deltaUtils";

export {
	TreeChunk,
	chunkTree,
	buildChunkedForest,
	defaultChunkPolicy,
	makeTreeChunker,
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
	UntypedField,
	UntypedTree,
	UntypedTreeContext,
	UntypedTreeCore,
	UnwrappedUntypedField,
	UnwrappedUntypedTree,
	UntypedTreeOrPrimitive,
	typeSymbol,
	getField,
	parentField,
	EditableTreeEvents,
	on,
	contextSymbol,
	treeStatus,
} from "./untypedTree";

export {
	FieldNode,
	FlexibleFieldContent,
	FlexibleNodeContent,
	InternalEditableTreeTypes,
	Leaf,
	MapNode,
	OptionalField,
	RequiredField,
	Sequence as Sequence2,
	Skip,
	Struct,
	StructTyped,
	TreeContext,
	TypedField,
	TypedNode,
	TypedNodeUnion,
	Tree,
	TreeField,
	TreeNode,
	getTreeContext,
	boxedIterator,
	CheckTypesOverlap,
	TreeStatus,
} from "./editable-tree-2";

// Split into separate import and export for compatibility with API-Extractor.
import * as SchemaAware from "./schema-aware";
export { SchemaAware };

export { DetachedFieldIndexSummarizer } from "./detachedFieldIndexSummarizer";
