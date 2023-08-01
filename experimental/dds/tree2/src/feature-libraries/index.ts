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
	typeSymbol,
	isEditableField,
	isPrimitive,
	isEditableTree,
	proxyTargetSymbol,
	UnwrappedEditableField,
	UnwrappedEditableTree,
	getField,
	parentField,
	EditableTreeEvents,
	on,
	contextSymbol,
	NewFieldContent,
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
	BindSyntaxTree,
	indexSymbol,
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
} from "./contextuallyTyped";

export { ForestSummarizer } from "./forestSummarizer";
export { singleMapTreeCursor, mapTreeFromCursor } from "./mapTreeCursor";
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
	ChangesetLocalId,
	idAllocatorFromMaxId,
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
	IdAllocator,
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
	ViewSchema,
	SchemaCollection,
	IFieldSchema,
	ITreeSchema,
	Sourced,
	NodeExistsConstraint,
	NodeExistenceState,
	BrandedFieldKind,
	ChangeAtomId,
} from "./modular-schema";

export {
	SchemaBuilder,
	TreeSchema,
	AllowedTypes,
	FieldSchema,
	TypedSchemaCollection,
	Any,
	SchemaLibrary,
	SchemaLibraryData,
	LazyTreeSchema,
	InternalTypedSchemaTypes,
} from "./typed-schema";

export { mapFieldMarks, mapMark, mapMarkList, populateChildModifications } from "./deltaUtils";

export { ForestRepairDataStore, ForestRepairDataStoreProvider } from "./forestRepairDataStore";
export { dummyRepairDataStore } from "./fakeRepairDataStore";

export { mapFromNamed, namedTreeSchema } from "./viewSchemaUtil";

export { TreeChunk, chunkTree, buildChunkedForest, defaultChunkPolicy } from "./chunked-forest";

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
	ValueFieldKind,
	Optional,
	Sequence,
	NodeKeyFieldKind,
	Forbidden,
	FieldKindTypes,
	DefaultChangeset,
	DefaultChangeFamily,
	DefaultEditBuilder,
	IDefaultEditBuilder,
	ValueFieldEditBuilder,
	OptionalFieldEditBuilder,
	SequenceFieldEditBuilder,
	defaultSchemaPolicy,
	emptyField,
} from "./default-field-kinds";

export {
	UntypedField,
	UntypedTree,
	UntypedTreeContext,
	UntypedTreeCore,
	UnwrappedUntypedField,
	UnwrappedUntypedTree,
	UntypedTreeOrPrimitive,
} from "./untypedTree";

// Split into separate import and export for compatibility with API-Extractor.
import * as SchemaAware from "./schema-aware";
export { SchemaAware };
