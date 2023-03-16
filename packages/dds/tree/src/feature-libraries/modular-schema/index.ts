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
	FieldChangeEncoder,
	FieldChangeHandler,
	FieldChangeMap,
	FieldChangeRebaser,
	FieldChangeset,
	FieldEditor,
	ModularChangeset,
	NodeChangeComposer,
	NodeChangeDecoder,
	NodeChangeEncoder,
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
export { ModularChangeFamily, ModularEditBuilder, EditDescription } from "./modularChangeFamily";
export { FieldTypeView, TreeViewSchema, ViewSchemaCollection, ViewSchema } from "./view";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as TypedSchema from "./typedSchema";
export { TypedSchema };
