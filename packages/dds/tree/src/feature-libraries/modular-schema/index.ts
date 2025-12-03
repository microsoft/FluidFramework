/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	allowsFieldSuperset,
	allowsRepoSuperset,
	allowsTreeSchemaIdentifierSuperset,
	allowsTreeSuperset,
} from "./comparison.js";
export {
	addCrossFieldQuery,
	type CrossFieldManager,
	type CrossFieldMap,
	type CrossFieldQuerySet,
	CrossFieldTarget,
	setInCrossFieldMap,
} from "./crossFieldQueries.js";
export {
	type FieldChangeDelta,
	type FieldChangeEncodingContext,
	type FieldChangeHandler,
	type FieldChangeRebaser,
	type FieldEditor,
	type NestedChangesIndices,
	NodeAttachState,
	type NodeChangeComposer,
	type NodeChangeInverter,
	type NodeChangePruner,
	type NodeChangeRebaser,
	type RebaseRevisionMetadata,
	type RelevantRemovedRootsFromChild,
	referenceFreeFieldChangeRebaser,
	type ToDelta,
} from "./fieldChangeHandler.js";
export { FlexFieldKind, type FullSchemaPolicy } from "./fieldKind.js";
export type {
	FieldKindConfiguration,
	FieldKindConfigurationEntry,
} from "./fieldKindConfiguration.js";
export {
	convertGenericChange,
	genericChangeHandler,
	genericFieldKind,
} from "./genericFieldKind.js";
export type { GenericChangeset } from "./genericFieldKindTypes.js";
export { isNeverField, isNeverTree } from "./isNeverTree.js";
export { makeModularChangeCodecFamily } from "./modularChangeCodecs.js";
export {
	type EditDescription,
	type FieldEditDescription,
	type GlobalEditDescription,
	intoDelta,
	ModularChangeFamily,
	ModularEditBuilder,
	rebaseRevisionMetadataFromInfo,
	relevantRemovedRoots,
	updateRefreshers,
} from "./modularChangeFamily.js";
export {
	ChangesetLocalIdSchema,
	EncodedChangeAtomId,
	EncodedModularChangeset,
	EncodedNodeChangeset,
	EncodedRevisionInfo,
} from "./modularChangeFormat.js";
export type {
	CrossFieldKey,
	CrossFieldKeyRange,
	FieldChange,
	FieldChangeMap,
	FieldChangeset,
	HasFieldChanges,
	ModularChangeset,
	NodeExistsConstraint,
	NodeId,
} from "./modularChangeTypes.js";
