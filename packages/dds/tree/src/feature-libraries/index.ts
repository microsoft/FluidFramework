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
} from "./contextuallyTyped";

export { ForestIndex } from "./forestIndex";
export { singleMapTreeCursor, mapTreeFromCursor } from "./mapTreeCursor";
export { buildForest } from "./object-forest";
export { SchemaIndex, SchemaEditor } from "./schemaIndex";
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
	ValueConstraint,
	TypedSchema,
} from "./modular-schema";

export { mapFieldMarks, mapMark, mapMarkList } from "./deltaUtils";

export {
	EditManagerIndex,
	CommitEncoder,
	parseSummary as loadSummary,
	stringifySummary as encodeSummary,
} from "./editManagerIndex";

export { ForestRepairDataStore } from "./forestRepairDataStore";
export { dummyRepairDataStore } from "./fakeRepairDataStore";

export { mapFromNamed, namedTreeSchema } from "./viewSchemaUtil";

export { TreeChunk, chunkTree, buildChunkedForest, defaultChunkPolicy } from "./chunked-forest";

// Split into separate import and export for compatibility with API-Extractor.
import * as SchemaAware from "./schema-aware";
import * as FieldKinds from "./defaultFieldKinds";
export { SchemaAware, FieldKinds };
