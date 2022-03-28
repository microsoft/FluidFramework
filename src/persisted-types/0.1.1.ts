/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import type { DetachedSequenceId, EditId, InternedStringId, NodeId } from '../Identifiers';
import type {
	BuildInternal,
	ChangeInternal,
	ChangeTypeInternal,
	EditWithoutId,
	Payload,
	SharedTreeSummaryBase,
	TraitLocationInternal_0_0_2,
	TreeNode,
	TreeNodeSequence,
	WriteFormat,
} from './0.0.2';

/**
 * Specifies the location of a trait (a labeled sequence of nodes) within the tree.
 * @public
 */
export interface TraitLocationInternal extends Omit<TraitLocationInternal_0_0_2, 'parent'> {
	readonly parent: NodeId;
}

/**
 * Alternating list of label then children list under that label.
 * The label is interned, and children are {@link CompressedPlaceholderTree}.
 * @public
 */
export type CompressedTraits<TPlaceholder extends number | never> = (
	| InternedStringId
	| (CompressedPlaceholderTree<TPlaceholder> | TPlaceholder)[]
)[];

/**
 * A TreeNode that has been compressed into the following array format:
 * [identifier, definition, traits, payload],
 * where traits is also an array of [label, [trait], label, [trait], ...].
 * Payload is omitted if empty, and traits will be an empty subarray if no traits exist but a payload exists.
 * If both traits and payload does not exist, then both are omitted.
 * All trait labels and node definitions are also string interned.
 * @public
 */
export type CompressedPlaceholderTree<TPlaceholder extends number | never> =
	| TPlaceholder
	| [
			NodeId,
			InternedStringId, // The node Definition's interned string ID
			CompressedTraits<TPlaceholder>?,
			Payload?
	  ];

/**
 * JSON-compatible Node type. Objects of this type will be persisted in internal change objects (under Edits) in the SharedTree history.
 * @public
 */
export type ChangeNode = TreeNode<ChangeNode, NodeId>;

/**
 * A ChangeNode that has been compressed into a {@link CompressedPlaceholderTree}.
 * @public
 */
export type CompressedChangeNode = CompressedPlaceholderTree<never>;

/**
 * The contents of a SharedTree summary for write format 0.1.1.
 * Contains the current tree in a compressed format,
 * the edits needed to get from `initialTree` to the current tree,
 * and the interned strings that can be used to retrieve the interned summary.
 */
export interface SharedTreeSummary<TChange> extends SharedTreeSummaryBase {
	readonly currentTree?: CompressedChangeNode;

	/**
	 * Information that can populate an edit log.
	 */
	readonly editHistory?: EditLogSummary<TChange, FluidEditHandle>;

	/**
	 * List of interned strings to retrieve interned summaries with.
	 */
	readonly internedStrings?: readonly string[];
}

/**
 * Information used to populate an edit log.
 * In 0.1.1, this is a persisted type only for `EditLogSummary<CompressedChangeInternal, FluidEditHandle>`,
 * where calling `FluidEditHandle.get` returns an array buffer of compressed `editChunk` contents.
 * The type is parameterized to avoid nearly identical type definitions for uncompressed forms of the edit
 * log, and abstracting away the fact that handle fetching needs to invoke decompression.
 * @public
 */
export interface EditLogSummary<TChange, THandle> {
	/**
	 * A of list of serialized chunks and their corresponding keys.
	 * Start revision is the index of the first edit in the chunk in relation to the edit log.
	 */
	readonly editChunks: readonly {
		readonly startRevision: number;
		/**
		 * Either a chunk of edits or a handle that can be used to load that chunk.
		 */
		readonly chunk: THandle | readonly EditWithoutId<TChange>[];
	}[];

	/**
	 * A list of edits IDs for all sequenced edits.
	 */
	readonly editIds: readonly EditId[];
}

/**
 * FluidEditHandles are used to load edit chunks stored outside of the EditLog.
 * Can be satisfied by IFluidHandle<ArrayBufferLike>.
 * Note that though this is in `PersistedTypes`, it isn't directly serializable (e.g. `get` is a function).
 * Its serialization relies on being encoded via an IFluidSerializer.
 * @public
 */
export interface FluidEditHandle {
	readonly get: () => Promise<ArrayBuffer>;
	readonly absolutePath: string;
}

// Future write formats should make this a union type and append to it (e.g. `EditChunkContents_0_1_1 | EditChunkContents_2_0_0`).
export type EditChunkContents = EditChunkContents_0_1_1;

export interface EditChunkContents_0_1_1 {
	version: WriteFormat.v0_1_1;
	edits: readonly EditWithoutId<CompressedChangeInternal>[];
	internedStrings: readonly string[];
}

/**
 * Edits per edit chunk. This value is in persisted types because it requires consensus to change.
 */
export const editsPerChunk = 100;

/**
 * Compressed change format type.
 * Encodes the same information as a {@link ChangeInternal}, but uses a more compact object format for `build` changes.
 */
export type CompressedChangeInternal<TCompressedTree = CompressedBuildNode> =
	| Exclude<ChangeInternal, BuildInternal>
	| CompressedBuildInternal<TCompressedTree>;

/**
 * A compressed version of {@link BuildInternal} where the source is a sequence of compressed nodes.
 * @public
 */
export interface CompressedBuildInternal<TCompressedTree = CompressedBuildNode> {
	/** {@inheritdoc Build.destination } */
	readonly destination: DetachedSequenceId;
	/** A sequence of nodes to build in some compressed format. */
	readonly source: TreeNodeSequence<TCompressedTree>;
	/** {@inheritdoc Build."type" } */
	readonly type: typeof ChangeTypeInternal.CompressedBuild;
}

/**
 * A BuildNode that has been compressed into a {@link CompressedPlaceholderTree}.
 * @public
 */
export type CompressedBuildNode = CompressedPlaceholderTree<DetachedSequenceId>;
