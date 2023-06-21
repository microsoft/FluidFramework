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
	CrossFieldManager,
	CrossFieldQuerySet,
	CrossFieldTarget,
	idAllocatorFromMaxId,
} from "./crossFieldQueries";
export { ChangesetLocalId, ChangeAtomId } from "./modularChangeTypes";
export { ChangesetLocalIdSchema, EncodedChangeAtomId } from "./modularChangeFormat";
export { FieldKind, FullSchemaPolicy, Multiplicity } from "./fieldKind";
export {
	IdAllocator,
	FieldChangeHandler,
	FieldChangeRebaser,
	FieldEditor,
	getIntention,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeReviver,
	referenceFreeFieldChangeRebaser,
	RevisionMetadataSource,
	RevisionIndexer,
	ToDelta,
	NodeExistenceState,
} from "./fieldChangeHandler";
export {
	FieldChange,
	FieldChangeMap,
	FieldChangeset,
	HasFieldChanges,
	ModularChangeset,
	NodeChangeset,
	RevisionInfo,
	NodeExistsConstraint,
} from "./modularChangeTypes";
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
