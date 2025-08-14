/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type DownPath,
	toDownPath,
} from "./editableTreeBinder.js";
export { allowsValue, assertAllowedValue, isTreeValue } from "./valueUtilities.js";

export { ForestSummarizer } from "./forest-summary/index.js";
export {
	cursorForMapTreeField,
	cursorForMapTreeNode,
	mapTreeFromCursor,
	mapTreeFieldFromCursor,
	type MinimalMapTreeNodeView,
	mapTreeFieldsWithField,
	mapTreeWithField,
	type MapTreeFieldViewGeneric,
	type MapTreeNodeViewGeneric,
	type MinimalFieldMap,
} from "./mapTreeCursor.js";
export { buildForest } from "./object-forest/index.js";
export {
	SchemaSummarizer,
	encodeTreeSchema,
	makeSchemaCodec,
	makeSchemaCodecs,
} from "./schema-index/index.js";
export {
	stackTreeNodeCursor,
	type CursorAdapter,
	prefixPath,
	prefixFieldPath,
	type CursorWithNode,
	stackTreeFieldCursor,
} from "./treeCursorUtils.js";
export {
	cursorForJsonableTreeNode,
	cursorForJsonableTreeField,
	jsonableTreeFromCursor,
	jsonableTreeFromFieldCursor,
	jsonableTreeFromForest,
} from "./treeTextCursor.js";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as SequenceField from "./sequence-field/index.js";
export { SequenceField };

export {
	isNeverField,
	ModularEditBuilder,
	type FieldEditDescription as EditDescription,
	type FieldChangeHandler,
	type FieldChangeRebaser,
	type FieldEditor,
	type FieldChangeMap,
	type FieldChange,
	type FieldChangeset,
	type ToDelta,
	type ModularChangeset,
	makeModularChangeCodecFamily,
	type NodeChangeComposer,
	type NodeChangeInverter,
	type NodeChangeRebaser,
	type NodeChangePruner,
	type CrossFieldManager,
	CrossFieldTarget,
	FlexFieldKind,
	type FullSchemaPolicy,
	allowsRepoSuperset,
	type GenericChangeset,
	genericFieldKind,
	type HasFieldChanges,
	type NodeExistsConstraint,
	FieldKindWithEditor,
	ModularChangeFamily,
	type RelevantRemovedRootsFromChild,
	EncodedModularChangeset,
	updateRefreshers,
	type NodeId,
	type FieldChangeEncodingContext,
	type FieldKindConfiguration,
	type FieldKindConfigurationEntry,
	isNeverTree,
} from "./modular-schema/index.js";

export { mapRootChanges } from "./deltaUtils.js";

export {
	type TreeChunk,
	chunkTree,
	chunkField,
	chunkFieldSingle,
	buildChunkedForest,
	defaultChunkPolicy,
	type FieldBatch,
	type FieldBatchCodec,
	makeTreeChunker,
	makeFieldBatchCodec,
	fluidVersionToFieldBatchCodecWriteVersion,
	type FieldBatchEncodingContext,
	emptyChunk,
} from "./chunked-forest/index.js";

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
	FieldKinds,
	type Required,
	type Optional,
	type Sequence,
	type Identifier,
	type Forbidden,
	type DefaultChangeset,
	DefaultChangeFamily,
	DefaultEditBuilder,
	type IDefaultEditBuilder,
	type ValueFieldEditBuilder,
	type OptionalFieldEditBuilder,
	type SequenceFieldEditBuilder,
	defaultSchemaPolicy,
	fieldKinds,
	fieldKindConfigurations,
	intoDelta,
	relevantRemovedRoots,
	SchemaValidationError,
	isNodeInSchema,
	isFieldInSchema,
	throwOutOfSchema,
} from "./default-schema/index.js";

export {
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
	type FlexTreeSequenceField,
	type FlexTreeContext,
	type FlexTreeHydratedContext,
	type FlexTreeTypedField,
	type FlexTreeEntity,
	type FlexTreeField,
	type FlexTreeNode,
	TreeStatus,
	Context,
	type FlexTreeNodeEvents,
	type FlexTreeUnknownUnboxed,
	isFlexTreeNode,
	ContextSlot,
	// Internal
	flexTreeMarker,
	assertFlexTreeEntityNotFreed,
	flexTreeSlot,
	getSchemaAndPolicy,
	LazyEntity,
	treeStatusFromAnchorCache,
	indexForAt,
	FlexTreeEntityKind,
	type FlexibleNodeContent,
	type FlexibleFieldContent,
	type FlexTreeHydratedContextMinimal,
	type HydratedFlexTreeNode,
	getOrCreateHydratedFlexTreeNode,
} from "./flex-tree/index.js";

export { TreeCompressionStrategy } from "./treeCompressionUtils.js";

export { valueSchemaAllows } from "./valueUtilities.js";

export { DetachedFieldIndexSummarizer } from "./detachedFieldIndexSummarizer.js";

export {
	type SchemaChange,
	makeSchemaChangeCodecs,
	EncodedSchemaChange,
} from "./schema-edits/index.js";

export { makeMitigatedChangeFamily } from "./mitigatedChangeFamily.js";

export {
	type KeyFinder,
	AnchorTreeIndex,
	hasElement,
	type TreeIndex,
	type TreeIndexKey,
	type TreeIndexNodes,
} from "./indexing/index.js";
