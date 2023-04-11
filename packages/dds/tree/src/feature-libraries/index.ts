/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export {
	DefaultChangeset,
	DefaultChangeFamily,
	defaultChangeFamily,
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
	isUnwrappedNode,
	proxyTargetSymbol,
	UnwrappedEditableField,
	UnwrappedEditableTree,
	getField,
	createField,
	replaceField,
	parentField,
	EditableTreeEvents,
	on,
	contextSymbol,
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
	isWritableArrayLike,
	isContextuallyTypedNodeDataObject,
	getFieldKind,
	getFieldSchema,
	ArrayLikeMut,
	cursorFromContextualData,
	cursorsFromContextualData,
	ContextuallyTypedFieldData,
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
	ModularChangeFamily,
	ModularEditBuilder,
	EditDescription,
	FieldChangeHandler,
	FieldChangeRebaser,
	FieldChangeEncoder,
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
	NodeChangeEncoder,
	NodeChangeDecoder,
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
	TypedSchema,
	revisionMetadataSourceFromInfo,
	ViewSchema,
	ViewSchemaCollection,
	FieldViewSchema,
	TreeViewSchema,
} from "./modular-schema";

export { mapFieldMarks, mapMark, mapMarkList, populateChildModifications } from "./deltaUtils";

export { ForestRepairDataStore } from "./forestRepairDataStore";
export { dummyRepairDataStore } from "./fakeRepairDataStore";

export { mapFromNamed, namedTreeSchema } from "./viewSchemaUtil";

export { TreeChunk, chunkTree, buildChunkedForest, defaultChunkPolicy } from "./chunked-forest";

export {
	Identifier,
	identifierFieldSchema,
	IdentifierIndex,
	identifierSchema,
} from "./identifierIndex";

// Split into separate import and export for compatibility with API-Extractor.
import * as SchemaAware from "./schema-aware";
import * as FieldKindsOriginal from "./defaultFieldKinds";
export { SchemaAware };

// Export subset of FieldKinds in an API-Extractor compatible way:
import { FieldEditor, FieldKind, Multiplicity } from "./modular-schema";

/**
 * @alpha
 */
export const FieldKinds: {
	readonly value: FieldKind<FieldEditor<any>, Multiplicity.Value>;
	readonly optional: FieldKind<FieldEditor<any>, Multiplicity.Optional>;
	readonly sequence: FieldKind<FieldEditor<any>, Multiplicity.Sequence>;
} = FieldKindsOriginal;

export {
	UntypedField,
	UntypedTree,
	UntypedTreeContext,
	UntypedTreeCore,
	UnwrappedUntypedField,
	UnwrappedUntypedTree,
	UntypedTreeOrPrimitive,
} from "./untypedTree";
