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
export { singleMapTreeCursor, mapTreeFromCursor } from "./mapTreeCursor";
export { MemoizedIdRangeAllocator, IdRange } from "./memoizedIdRangeAllocator";
export { buildForest } from "./object-forest";
export { SchemaSummarizer, SchemaEditor, encodeTreeSchema } from "./schemaSummarizer";
// This is exported because its useful for doing comparisons of schema in tests.
export { makeSchemaCodec } from "./schemaIndexFormat";
export {
	singleStackTreeCursor,
	CursorAdapter,
	prefixPath,
	prefixFieldPath,
	CursorWithNode,
} from "./treeCursorUtils";
export {
	singleTextCursor,
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
	LeafSchema,
	MapSchema,
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
	Sequence as SequenceFieldKind,
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

export { TreeEvent, EditableTreeEvents } from "./untypedTree";

export {
	AssignableFieldKinds,
	FieldNode,
	FlexibleFieldContent,
	FlexibleNodeContent,
	InternalEditableTreeTypes,
	Leaf,
	MapNode,
	OptionalField,
	RequiredField,
	Sequence,
	Skip,
	ObjectNode,
	ObjectNodeTyped,
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
	getProxyForField,
	ObjectFields,
	ProxyField,
	ProxyFieldInner,
	ProxyNode,
	ProxyNodeUnion,
	SharedTreeList,
	SharedTreeMap,
	SharedTreeObject,
	ProxyRoot,
	node,
	NodeApi,
	SharedTreeNode,
	Typed,
	SharedTreeObjectFactory,
	FactoryTreeSchema,
	addFactory,
	Context,
} from "./editable-tree-2";

export { treeSchemaFromStoredSchema } from "./storedToViewSchema";

// Split into separate import and export for compatibility with API-Extractor.
import * as SchemaAware from "./schema-aware";
export { SchemaAware };

export { DetachedFieldIndexSummarizer } from "./detachedFieldIndexSummarizer";
