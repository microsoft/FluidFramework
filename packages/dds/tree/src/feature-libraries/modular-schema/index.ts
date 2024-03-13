/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	allowsRepoSuperset,
	allowsTreeSchemaIdentifierSuperset,
	allowsFieldSuperset,
	allowsTreeSuperset,
} from "./comparison.js";
export { isNeverField, isNeverTree } from "./isNeverTree.js";
export {
	addCrossFieldQuery,
	CrossFieldManager,
	CrossFieldMap,
	CrossFieldQuerySet,
	CrossFieldTarget,
	setInCrossFieldMap,
} from "./crossFieldQueries.js";
export {
	ChangesetLocalIdSchema,
	EncodedChangeAtomId,
	EncodedRevisionInfo,
	EncodedModularChangeset,
} from "./modularChangeFormat.js";
export { FlexFieldKind, FullSchemaPolicy } from "./fieldKind.js";
export { FieldKindWithEditor } from "./fieldKindWithEditor.js";
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
	RebaseRevisionMetadata,
	RelevantRemovedRootsFromChild,
	ToDelta,
	NodeExistenceState,
} from "./fieldChangeHandler.js";
export {
	FieldChange,
	FieldChangeMap,
	FieldChangeset,
	HasFieldChanges,
	ModularChangeset,
	NodeExistsConstraint,
	NodeId,
} from "./modularChangeTypes.js";
export {
	convertGenericChange,
	genericChangeHandler,
	genericFieldKind,
} from "./genericFieldKind.js";
export { GenericChange, GenericChangeset } from "./genericFieldKindTypes.js";
export {
	ModularChangeFamily,
	ModularEditBuilder,
	EditDescription,
	GlobalEditDescription,
	FieldEditDescription,
	rebaseRevisionMetadataFromInfo,
	intoDelta,
	relevantRemovedRoots,
} from "./modularChangeFamily.js";
export { makeV0Codec } from "./modularChangeCodecs.js";
