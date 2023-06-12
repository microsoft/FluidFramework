/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export {
	DefaultChangeset,
	DefaultChangeFamily,
	defaultChangeFamily,
	defaultIntoDelta,
	DefaultEditBuilder,
	IDefaultEditBuilder,
	ValueFieldEditBuilder,
	OptionalFieldEditBuilder,
	SequenceFieldEditBuilder,
} from "./defaultChangeFamily";
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
export { getSchemaString } from "./schemaIndexFormat";
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

export { defaultSchemaPolicy, emptyField, neverField, neverTree } from "./defaultSchema";

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
	ValueChange,
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
	ValueConstraint,
	InternalTypedSchemaTypes,
	revisionMetadataSourceFromInfo,
	ViewSchema,
	SchemaCollection,
	IFieldSchema,
	ITreeSchema,
	SchemaBuilder,
	TreeSchema,
	AllowedTypes,
	FieldSchema,
	TypedSchemaCollection,
	Any,
	GlobalFieldSchema,
	SchemaLibrary,
	SchemaLibraryData,
	Sourced,
	NodeExistsConstraint,
	NodeExistenceState,
} from "./modular-schema";

export { mapFieldMarks, mapMark, mapMarkList, populateChildModifications } from "./deltaUtils";

export { ForestRepairDataStore, ForestRepairDataStoreProvider } from "./forestRepairDataStore";
export { dummyRepairDataStore } from "./fakeRepairDataStore";

export { mapFromNamed, namedTreeSchema } from "./viewSchemaUtil";

export { TreeChunk, chunkTree, buildChunkedForest, defaultChunkPolicy } from "./chunked-forest";

export { NodeIdentifierIndex } from "./nodeIdentifierIndex";

export { buildNodeIdentifierSchema, NodeIdentifier } from "./nodeIdentifier";

export {
	FieldKinds,
	BrandedFieldKind,
	ValueFieldKind,
	Optional,
	Sequence,
	NodeIdentifierFieldKind,
	Forbidden,
	FieldKindTypes,
} from "./defaultFieldKinds";

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
