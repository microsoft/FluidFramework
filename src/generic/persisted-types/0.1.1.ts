/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import type { EditId, NodeId } from '../../Identifiers';
import type {
	ChangeNode_0_0_2,
	EditWithoutId,
	SharedTreeSummaryBase,
	TraitLocationInternal_0_0_2,
	TreeNode,
} from './0.0.2';

/**
 * Specifies the location of a trait (a labeled sequence of nodes) within the tree.
 * @public
 */
export interface TraitLocationInternal extends Omit<TraitLocationInternal_0_0_2, 'parent'> {
	readonly parent: NodeId;
}

/**
 * JSON-compatible Node type. Objects of this type will be persisted in internal change objects (under Edits) in the SharedTree history.
 * @public
 */
export type ChangeNode = TreeNode<ChangeNode, NodeId>;

/**
 * The contents of a SharedTree summary: the current tree, and the edits needed to get from `initialTree` to the current tree.
 * @public
 */
export interface SharedTreeSummary<TChange> extends SharedTreeSummaryBase {
	readonly currentTree?: ChangeNode_0_0_2;

	/**
	 * Information that can populate an edit log.
	 */
	readonly editHistory?: EditLogSummary<TChange>;
}

/**
 * Information used to populate an edit log.
 * @public
 */
export interface EditLogSummary<TChange> {
	/**
	 * A of list of serialized chunks and their corresponding keys.
	 * Start revision is the index of the first edit in the chunk in relation to the edit log.
	 */
	readonly editChunks: readonly {
		readonly startRevision: number;
		/**
		 * Either a chunk of edits or a handle that can be used to load that chunk.
		 */
		readonly chunk: EditHandle | readonly EditWithoutId<TChange>[];
	}[];

	/**
	 * A list of edits IDs for all sequenced edits.
	 */
	readonly editIds: readonly EditId[];
}

/**
 * EditHandles are used to load edit chunks stored outside of the EditLog.
 * Can be satisfied by IFluidHandle<ArrayBufferLike>.
 * Note that though this is in `PersistedTypes`, it isn't directly serializable (e.g. `get` is a function).
 * Its serialization relies on being encoded via an IFluidSerializer.
 * @public
 */
export interface EditHandle {
	readonly get: () => Promise<ArrayBufferLike>;
	readonly absolutePath: string;
}

/**
 * A sequence of edits that may or may not to be downloaded into the EditLog from an external service
 */
export interface EditChunk<TChange> {
	handle?: EditHandle;
	edits?: EditWithoutId<TChange>[];
}
