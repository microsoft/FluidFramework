/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	isNeverField,
	isNeverTree,
	allowsRepoSuperset,
	allowsTreeSchemaIdentifierSuperset,
	allowsFieldSuperset,
	allowsTreeSuperset,
} from "./comparison";
export {
	ChangesetLocalId,
	ChangesetLocalIdSchema,
	CrossFieldManager,
	CrossFieldQuerySet,
	CrossFieldTarget,
	idAllocatorFromMaxId,
} from "./crossFieldQueries";
export { FieldKind, FullSchemaPolicy, Multiplicity } from "./fieldKind";
export {
	IdAllocator,
	FieldChange,
	FieldChangeHandler,
	FieldChangeMap,
	FieldChangeRebaser,
	FieldChangeset,
	FieldEditor,
	getIntention,
	HasFieldChanges,
	ModularChangeset,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeChangeset,
	NodeReviver,
	referenceFreeFieldChangeRebaser,
	RevisionMetadataSource,
	RevisionIndexer,
	RevisionInfo,
	ToDelta,
	ValueChange,
	ValueConstraint,
	NodeExistsConstraint,
	NodeExistenceState,
} from "./fieldChangeHandler";
export { convertGenericChange, genericChangeHandler, genericFieldKind } from "./genericFieldKind";
export { GenericChange, GenericChangeset } from "./genericFieldKindTypes";
export {
	ModularChangeFamily,
	ModularEditBuilder,
	EditDescription,
	revisionMetadataSourceFromInfo,
} from "./modularChangeFamily";
export { ITreeSchema, SchemaCollection, ViewSchema, IFieldSchema, Sourced } from "./view";

export {
	SchemaBuilder,
	TreeSchema,
	FieldSchema,
	GlobalFieldSchema,
	Any,
	AllowedTypes,
	InternalTypedSchemaTypes,
	allowedTypesToTypeSet,
	TypedSchemaCollection,
	SchemaLibrary,
	SchemaLibraryData,
} from "./typedSchema";
