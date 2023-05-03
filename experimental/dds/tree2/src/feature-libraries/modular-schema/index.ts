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
	CrossFieldManager,
	CrossFieldQuerySet,
	CrossFieldTarget,
	idAllocatorFromMaxId,
} from "./crossFieldQueries";
export { FieldKind, FullSchemaPolicy, Multiplicity } from "./fieldKind";
export {
	IdAllocator,
	isolatedFieldChangeRebaser,
	FieldChange,
	FieldChangeHandler,
	FieldChangeMap,
	FieldChangeRebaser,
	FieldChangeset,
	FieldEditor,
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
} from "./fieldChangeHandler";
export {
	convertGenericChange,
	EncodedGenericChange,
	EncodedGenericChangeset,
	GenericChange,
	genericChangeHandler,
	GenericChangeset,
	genericFieldKind,
} from "./genericFieldKind";
export {
	ModularChangeFamily,
	ModularEditBuilder,
	EditDescription,
	revisionMetadataSourceFromInfo,
} from "./modularChangeFamily";
export { ITreeSchema, ViewSchemaCollection, ViewSchema, IFieldSchema } from "./view";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as TypedSchema from "./typedSchema";
export { TypedSchema };

export {
	SchemaBuilder,
	TreeSchema,
	AllowedTypes,
	FieldSchema,
	GlobalFieldSchema,
	Any,
	TypedViewSchemaCollection,
	TreeSchemaSpecification,
	FlexList,
	Assume,
	allowedTypesToTypeSet,
} from "./typedSchema";
