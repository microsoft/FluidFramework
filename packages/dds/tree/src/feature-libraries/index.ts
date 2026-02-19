/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type DownPath,
	toDownPath,
} from "./editableTreeBinder.js";
export {
	ForestFormatVersion,
	ForestSummarizer,
	getCodecTreeForForestFormat,
} from "./forest-summary/index.js";
export {
	cursorForMapTreeField,
	cursorForMapTreeNode,
	type MapTreeFieldViewGeneric,
	type MapTreeNodeViewGeneric,
	type MinimalFieldMap,
	type MinimalMapTreeNodeView,
	mapTreeFieldFromCursor,
	mapTreeFieldsWithField,
	mapTreeFromCursor,
	mapTreeWithField,
} from "./mapTreeCursor.js";
export { buildForest } from "./object-forest/index.js";
export {
	makeSchemaCodec,
	SchemaSummarizer,
	schemaCodecBuilder,
} from "./schema-index/index.js";
export {
	type CursorAdapter,
	type CursorWithNode,
	prefixFieldPath,
	prefixPath,
	stackTreeFieldCursor,
	stackTreeNodeCursor,
} from "./treeCursorUtils.js";
export {
	cursorForJsonableTreeField,
	cursorForJsonableTreeNode,
	jsonableTreeFromCursor,
	jsonableTreeFromFieldCursor,
	jsonableTreeFromForest,
} from "./treeTextCursor.js";
export { allowsValue, assertAllowedValue, isTreeValue } from "./valueUtilities.js";

import * as SequenceField from "./sequence-field/index.js";
// eslint-disable-next-line unicorn/prefer-export-from -- fixing requires `export * as` (breaks API-Extractor) or named exports (changes public API)
export { SequenceField };

export {
	type ChangeAtomIdBTree,
	getFromChangeAtomIdMap,
	newChangeAtomIdBTree,
	setInChangeAtomIdMap,
} from "./changeAtomIdBTree.js";
export {
	buildChunkedForest,
	chunkField,
	chunkFieldSingle,
	chunkTree,
	combineChunks,
	defaultChunkPolicy,
	defaultIncrementalEncodingPolicy,
	emptyChunk,
	type FieldBatch,
	type FieldBatchCodec,
	type FieldBatchEncodingContext,
	FieldBatchFormatVersion,
	getCodecTreeForFieldBatchFormat,
	type IncrementalEncodingPolicy,
	makeFieldBatchCodec,
	makeTreeChunker,
	type TreeChunk,
} from "./chunked-forest/index.js";
export {
	DefaultChangeFamily,
	type DefaultChangeset,
	DefaultEditBuilder,
	defaultSchemaPolicy,
	FieldKinds,
	fieldKindConfigurations,
	fieldKinds,
	getCodecTreeForModularChangeFormat,
	type IDefaultEditBuilder,
	intoDelta,
	type OptionalFieldEditBuilder,
	relevantRemovedRoots,
	type SequenceFieldEditBuilder,
	type ValueFieldEditBuilder,
} from "./default-schema/index.js";
export { mapRootChanges } from "./deltaUtils.js";
export { DetachedFieldIndexSummarizer } from "./detachedFieldIndexSummarizer.js";
export {
	assertFlexTreeEntityNotFreed,
	Context,
	ContextSlot,
	currentObserver,
	type FlexibleFieldContent,
	type FlexibleNodeContent,
	type FlexTreeContext,
	type FlexTreeEntity,
	FlexTreeEntityKind,
	type FlexTreeField,
	type FlexTreeHydratedContext,
	type FlexTreeHydratedContextMinimal,
	type FlexTreeNode,
	type FlexTreeNodeEvents,
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
	type FlexTreeSequenceField,
	type FlexTreeTypedField,
	type FlexTreeUnknownUnboxed,
	// Internal
	flexTreeMarker,
	flexTreeSlot,
	getOrCreateHydratedFlexTreeNode,
	getSchemaAndPolicy,
	type HydratedFlexTreeNode,
	indexForAt,
	isFlexTreeNode,
	LazyEntity,
	type Observer,
	TreeStatus,
	treeStatusFromAnchorCache,
	withObservation,
} from "./flex-tree/index.js";
export {
	AnchorTreeIndex,
	hasElement,
	type KeyFinder,
	type TreeIndex,
	type TreeIndexNodes,
} from "./indexing/index.js";
export { makeMitigatedChangeFamily } from "./mitigatedChangeFamily.js";
export {
	allowsRepoSuperset,
	type CrossFieldManager,
	CrossFieldTarget,
	DefaultRevisionReplacer,
	EncodedModularChangesetV1,
	EncodedModularChangesetV2,
	type FieldChange,
	type FieldChangeEncodingContext,
	type FieldChangeHandler,
	type FieldChangeMap,
	type FieldChangeRebaser,
	type FieldChangeset,
	type FieldEditDescription as EditDescription,
	type FieldEditor,
	type FieldKindConfiguration,
	type FieldKindConfigurationEntry,
	FlexFieldKind,
	type FullSchemaPolicy,
	type GenericChangeset,
	genericFieldKind,
	type HasFieldChanges,
	isNeverField,
	isNeverTree,
	ModularChangeFamily,
	ModularChangeFormatVersion,
	type ModularChangeset,
	ModularEditBuilder,
	makeModularChangeCodecFamily,
	type NodeChangeComposer,
	type NodeChangeInverter,
	type NodeChangePruner,
	type NodeChangeRebaser,
	type NodeExistsConstraint,
	type NodeId,
	type RelevantRemovedRootsFromChild,
	type ToDelta,
	updateRefreshers,
} from "./modular-schema/index.js";
export {
	compareLocalNodeIdentifiers,
	createNodeIdentifierManager,
	isStableNodeIdentifier,
	type LocalNodeIdentifier,
	MockNodeIdentifierManager,
	type NodeIdentifierManager,
	nodeKeyTreeIdentifier,
	type StableNodeIdentifier,
} from "./node-identifier/index.js";
export {
	EncodedSchemaChange,
	getCodecTreeForSchemaChangeFormat,
	makeSchemaChangeCodecs,
	type SchemaChange,
} from "./schema-edits/index.js";
export {
	isFieldInSchema,
	isNodeInSchema,
	SchemaValidationError,
	throwOutOfSchema,
} from "./schemaChecker.js";
export { TreeCompressionStrategy } from "./treeCompressionUtils.js";
export { valueSchemaAllows } from "./valueUtilities.js";
