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
	type MapTreeFieldViewGeneric,
	type MapTreeNodeViewGeneric,
	type MinimalFieldMap,
	type MinimalMapTreeNodeView,
	cursorForMapTreeField,
	cursorForMapTreeNode,
	mapTreeFieldFromCursor,
	mapTreeFieldsWithField,
	mapTreeFromCursor,
	mapTreeWithField,
} from "./mapTreeCursor.js";
export { buildForest } from "./object-forest/index.js";
export {
	SchemaSummarizer,
	makeSchemaCodec,
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
	type FieldBatch,
	type FieldBatchCodec,
	type FieldBatchEncodingContext,
	FieldBatchFormatVersion,
	type IncrementalEncodingPolicy,
	type TreeChunk,
	buildChunkedForest,
	chunkField,
	chunkFieldSingle,
	chunkTree,
	combineChunks,
	defaultChunkPolicy,
	defaultIncrementalEncodingPolicy,
	emptyChunk,
	getCodecTreeForFieldBatchFormat,
	makeFieldBatchCodec,
	makeTreeChunker,
} from "./chunked-forest/index.js";
export {
	DefaultChangeFamily,
	type DefaultChangeset,
	DefaultEditBuilder,
	FieldKinds,
	type IDefaultEditBuilder,
	type OptionalFieldEditBuilder,
	type SequenceFieldEditBuilder,
	type ValueFieldEditBuilder,
	defaultSchemaPolicy,
	fieldKindConfigurations,
	fieldKinds,
	getCodecTreeForModularChangeFormat,
	intoDelta,
	relevantRemovedRoots,
} from "./default-schema/index.js";
export { mapRootChanges } from "./deltaUtils.js";
export { DetachedFieldIndexSummarizer } from "./detachedFieldIndexSummarizer.js";
export {
	Context,
	ContextSlot,
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
	type FlexibleFieldContent,
	type FlexibleNodeContent,
	type HydratedFlexTreeNode,
	LazyEntity,
	type Observer,
	TreeStatus,
	assertFlexTreeEntityNotFreed,
	currentObserver,
	// Internal
	flexTreeMarker,
	flexTreeSlot,
	getOrCreateHydratedFlexTreeNode,
	getSchemaAndPolicy,
	indexForAt,
	isFlexTreeNode,
	treeStatusFromAnchorCache,
	withObservation,
} from "./flex-tree/index.js";
export {
	AnchorTreeIndex,
	type KeyFinder,
	type TreeIndex,
	type TreeIndexKey,
	type TreeIndexNodes,
	hasElement,
} from "./indexing/index.js";
export { makeMitigatedChangeFamily } from "./mitigatedChangeFamily.js";
export {
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
	type HasFieldChanges,
	ModularChangeFamily,
	ModularChangeFormatVersion,
	type ModularChangeset,
	ModularEditBuilder,
	type NodeChangeComposer,
	type NodeChangeInverter,
	type NodeChangePruner,
	type NodeChangeRebaser,
	type NodeExistsConstraint,
	type NodeId,
	type RelevantRemovedRootsFromChild,
	type ToDelta,
	allowsRepoSuperset,
	genericFieldKind,
	isNeverField,
	isNeverTree,
	makeModularChangeCodecFamily,
	updateRefreshers,
} from "./modular-schema/index.js";
export {
	type LocalNodeIdentifier,
	MockNodeIdentifierManager,
	type NodeIdentifierManager,
	type StableNodeIdentifier,
	compareLocalNodeIdentifiers,
	createNodeIdentifierManager,
	isStableNodeIdentifier,
	nodeKeyTreeIdentifier,
} from "./node-identifier/index.js";
export {
	EncodedSchemaChange,
	type SchemaChange,
	getCodecTreeForSchemaChangeFormat,
	makeSchemaChangeCodecs,
} from "./schema-edits/index.js";
export {
	SchemaValidationError,
	isFieldInSchema,
	isNodeInSchema,
	throwOutOfSchema,
} from "./schemaChecker.js";
export { TreeCompressionStrategy } from "./treeCompressionUtils.js";
export { valueSchemaAllows } from "./valueUtilities.js";
