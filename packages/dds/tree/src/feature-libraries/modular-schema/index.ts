/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	allowsFieldSuperset,
	allowsMultiplicitySuperset,
	allowsRepoSuperset,
	allowsTreeSchemaIdentifierSuperset,
	allowsTreeSuperset,
} from "./comparison.js";
export {
	type CrossFieldManager,
	type CrossFieldMap,
	type CrossFieldQuerySet,
	CrossFieldTarget,
	addCrossFieldQuery,
	setInCrossFieldMap,
} from "./crossFieldQueries.js";
export { DefaultRevisionReplacer } from "./defaultRevisionReplacer.js";
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
	type ToDelta,
	referenceFreeFieldChangeRebaser,
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
export {
	ModularChangeFormatVersion,
	makeModularChangeCodecFamily,
} from "./modularChangeCodecs.js";
export {
	type EditDescription,
	type FieldEditDescription,
	type GlobalEditDescription,
	ModularChangeFamily,
	ModularEditBuilder,
	intoDelta,
	rebaseRevisionMetadataFromInfo,
	relevantRemovedRoots,
	updateRefreshers,
} from "./modularChangeFamily.js";
export {
	ChangesetLocalIdSchema,
	EncodedChangeAtomId,
	EncodedModularChangesetV1,
	EncodedNodeChangeset,
	EncodedRevisionInfo,
} from "./modularChangeFormatV1.js";
export { EncodedModularChangesetV2 } from "./modularChangeFormatV2.js";
export type {
	CrossFieldKey,
	CrossFieldKeyRange,
	FieldChange,
	FieldChangeMap,
	FieldChangeset,
	HasFieldChanges,
	ModularChangeset,
	NoChangeConstraint,
	NodeExistsConstraint,
	NodeId,
} from "./modularChangeTypes.js";
