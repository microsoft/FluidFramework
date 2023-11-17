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
	addCrossFieldQuery,
	CrossFieldManager,
	CrossFieldMap,
	CrossFieldQuerySet,
	CrossFieldTarget,
	setInCrossFieldMap,
} from "./crossFieldQueries";
export { ChangesetLocalIdSchema, EncodedChangeAtomId } from "./modularChangeFormat";
export { FieldKind, FullSchemaPolicy, Multiplicity, FieldKindWithEditor } from "./fieldKind";
export {
	FieldChangeHandler,
	FieldChangeRebaser,
	FieldEditor,
	getIntention,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeChangePruner,
	referenceFreeFieldChangeRebaser,
	RemovedTreesFromChild,
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
	GlobalEditDescription,
	FieldEditDescription,
	revisionMetadataSourceFromInfo,
} from "./modularChangeFamily";
