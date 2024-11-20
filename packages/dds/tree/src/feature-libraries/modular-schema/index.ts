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
	type CrossFieldManager,
	type CrossFieldMap,
	type CrossFieldQuerySet,
	CrossFieldTarget,
	setInCrossFieldMap,
} from "./crossFieldQueries.js";
export {
	ChangesetLocalIdSchema,
	EncodedChangeAtomId,
	EncodedRevisionInfo,
	EncodedModularChangeset,
	EncodedNodeChangeset,
} from "./modularChangeFormat.js";
export { FlexFieldKind, type FullSchemaPolicy } from "./fieldKind.js";
export { FieldKindWithEditor } from "./fieldKindWithEditor.js";
export {
	type FieldChangeHandler,
	type FieldChangeRebaser,
	type FieldEditor,
	type NodeChangeComposer,
	type NodeChangeInverter,
	type NodeChangeRebaser,
	type NodeChangePruner,
	referenceFreeFieldChangeRebaser,
	type RebaseRevisionMetadata,
	type RelevantRemovedRootsFromChild,
	type ToDelta,
	NodeAttachState,
	type FieldChangeEncodingContext,
} from "./fieldChangeHandler.js";
export type {
	CrossFieldKeyRange,
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
export type { GenericChangeset } from "./genericFieldKindTypes.js";
export {
	ModularChangeFamily,
	ModularEditBuilder,
	type EditDescription,
	type GlobalEditDescription,
	type FieldEditDescription,
	rebaseRevisionMetadataFromInfo,
	intoDelta,
	relevantRemovedRoots,
	updateRefreshers,
} from "./modularChangeFamily.js";
export { makeModularChangeCodecFamily } from "./modularChangeCodecs.js";
export type {
	FieldKindConfiguration,
	FieldKindConfigurationEntry,
} from "./fieldKindConfiguration.js";
export {
	getAllowedContentDiscrepancies,
	isRepoSuperset,
} from "./discrepancies.js";
