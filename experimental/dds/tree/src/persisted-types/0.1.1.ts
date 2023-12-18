/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils';
import { assertNotUndefined, ReplaceRecursive } from '../Common';
// These are re-exported from a persisted-types file.
import type {
	IdCreationRange,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
} from '../id-compressor';
import type {
	Definition,
	DetachedSequenceId,
	EditId,
	FinalNodeId,
	InternedStringId,
	NodeId,
	OpSpaceNodeId,
	SessionId,
	TraitLabel,
	UuidString,
} from '../Identifiers';
import {
	BuildInternal_0_0_2,
	ChangeTypeInternal,
	ConstraintEffect,
	ConstraintInternal_0_0_2,
	DetachInternal_0_0_2,
	Edit,
	EditWithoutId,
	InsertInternal_0_0_2,
	NodeData,
	Payload,
	SetValueInternal_0_0_2,
	SharedTreeNoOp,
	SharedTreeOpType,
	SharedTreeSummaryBase,
	SharedTreeUpdateOp,
	Side,
	StablePlaceInternal_0_0_2,
	TraitLocationInternal_0_0_2,
	TreeNode,
	TreeNodeSequence,
	VersionedOp,
	WriteFormat,
} from './0.0.2';

/**
 * Specifies the location of a trait (a labeled sequence of nodes) within the tree.
 * @alpha
 */
export interface TraitLocationInternal extends Omit<TraitLocationInternal_0_0_2, 'parent'> {
	readonly parent: NodeId;
}

/**
 * Alternating list of label then children list under that label.
 * The label may be interned, and children are {@link CompressedPlaceholderTree}.
 */
export type CompressedTraits<TId extends OpSpaceNodeId, TPlaceholder extends number | never> = (
	| InternedStringId
	| TraitLabel
	| (CompressedPlaceholderTree<TId, TPlaceholder> | TPlaceholder)[]
)[];

/**
 * A TreeNode that has been compressed into the following array format:
 * [identifier, definition, traits, payload],
 * where traits is also an array of [label, [trait], label, [trait], ...].
 * Payload is omitted if empty, and traits will be an empty subarray if no traits exist but a payload exists.
 * If both traits and payload does not exist, then both are omitted.
 * All trait labels and node definitions may also be string interned.
 * @internal
 */
export type CompressedPlaceholderTree<TId extends OpSpaceNodeId, TPlaceholder extends number | never> =
	| TPlaceholder
	| [InternedStringId | Definition] // The node Definition's interned string ID
	| [InternedStringId | Definition, TId]
	| [
			InternedStringId | Definition,
			[Payload, ...CompressedTraits<TId, TPlaceholder>] | CompressedTraits<TId, TPlaceholder>,
	  ]
	| [
			InternedStringId | Definition,
			TId,
			[Payload, ...CompressedTraits<TId, TPlaceholder>] | CompressedTraits<TId, TPlaceholder>,
	  ];

/**
 * JSON-compatible Node type. Objects of this type will be persisted in internal change objects (under Edits) in the SharedTree history.
 * @internal
 */
export type ChangeNode = TreeNode<ChangeNode, NodeId>;

/**
 * A ChangeNode that has been compressed into a {@link CompressedPlaceholderTree}.
 */
export type CompressedChangeNode<TId extends OpSpaceNodeId> = CompressedPlaceholderTree<TId, never>;

/**
 * The contents of a SharedTree summary for write format 0.1.1.
 * Contains the current tree in a compressed format,
 * the edits needed to get from `initialTree` to the current tree,
 * and the interned strings that can be used to retrieve the interned summary.
 */
export interface SharedTreeSummary extends SharedTreeSummaryBase {
	readonly version: WriteFormat.v0_1_1;

	readonly currentTree?: CompressedChangeNode<FinalNodeId>;

	/**
	 * Information that can populate an edit log.
	 */
	readonly editHistory: EditLogSummary<CompressedChangeInternal<FinalNodeId>, FluidEditHandle>;

	/**
	 * List of interned strings.
	 * In 0.1.1, definitions and trait labels are interned deterministically on sequenced ops,
	 * and each client maintains a string interner whose lifetime is tied to the SharedTree.
	 */
	readonly internedStrings: readonly string[];

	/**
	 * Information about all IDs compressed in the summary
	 */
	readonly idCompressor: SerializedIdCompressorWithNoSession | SerializedIdCompressorWithOngoingSession;
}

/**
 * Information used to populate an edit log.
 * In 0.1.1, this is a persisted type only for `EditLogSummary<CompressedChangeInternal, FluidEditHandle>`,
 * where calling `FluidEditHandle.get` returns an array buffer of compressed `editChunk` contents.
 * The type is parameterized to avoid nearly identical type definitions for uncompressed forms of the edit
 * log, and abstracting away the fact that handle fetching needs to invoke decompression.
 * @internal
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
 * @internal
 */
export interface FluidEditHandle {
	readonly get: () => Promise<ArrayBuffer>;
	readonly absolutePath: string;
}

// Future write formats should make this a union type and append to it (e.g. `EditChunkContents_0_1_1 | EditChunkContents_2_0_0`).
export type EditChunkContents = EditChunkContents_0_1_1;

export interface EditChunkContents_0_1_1 {
	version: WriteFormat.v0_1_1;
	edits: readonly EditWithoutId<CompressedChangeInternal<FinalNodeId>>[];
}

/**
 * Compressed change format type.
 * Encodes the same information as a {@link ChangeInternal}, but uses a more compact object format for `build` changes.
 */
export type CompressedChangeInternal<TId extends OpSpaceNodeId> =
	| ReplaceRecursive<Exclude<ChangeInternal, BuildInternal>, NodeId, TId>
	| CompressedBuildInternal<TId>;

/**
 * A compressed version of {@link BuildInternal} where the source is a sequence of compressed nodes.
 */
export interface CompressedBuildInternal<TId extends OpSpaceNodeId> {
	/** {@inheritdoc Build.destination } */
	readonly destination: DetachedSequenceId;
	/** A sequence of nodes to build in some compressed format. */
	readonly source: TreeNodeSequence<CompressedBuildNode<TId>>;
	/** {@inheritdoc Build."type" } */
	readonly type: typeof ChangeTypeInternal.CompressedBuild;
}

/**
 * A BuildNode that has been compressed into a {@link CompressedPlaceholderTree}.
 */
export type CompressedBuildNode<TId extends OpSpaceNodeId> = CompressedPlaceholderTree<TId, DetachedSequenceId>;

// TODO: `ChangeInternal`s should be assignable to this type without casting; this will require some test refactoring.
/**
 * This type should be used as an opaque handle in the public API for `ChangeInternal` objects.
 * This is useful for supporting public APIs which involve working with a tree's edit history,
 * which will involve changes that have already been internalized.
 * @alpha
 */
export interface InternalizedChange {
	InternalChangeBrand: '2cae1045-61cf-4ef7-a6a3-8ad920cb7ab3';
}

/**
 * {@inheritdoc (Change:type)}
 * @alpha
 */
export type ChangeInternal = InsertInternal | DetachInternal | BuildInternal | SetValueInternal | ConstraintInternal;

/**
 * {@inheritdoc BuildNode}
 * @alpha
 */
export type BuildNodeInternal = TreeNode<BuildNodeInternal, NodeId> | DetachedSequenceId;

/**
 * {@inheritdoc Build}
 * @alpha
 */
export interface BuildInternal extends Omit<BuildInternal_0_0_2, 'source'> {
	readonly source: TreeNodeSequence<BuildNodeInternal>;
}

/**
 * {@inheritdoc (Insert:interface)}
 * @alpha
 */
export interface InsertInternal extends Omit<InsertInternal_0_0_2, 'destination'> {
	/** {@inheritdoc (Insert:interface).destination } */
	readonly destination: StablePlaceInternal;
}

/**
 * {@inheritdoc Detach}
 * @alpha
 */
export interface DetachInternal extends Omit<DetachInternal_0_0_2, 'source'> {
	/** {@inheritdoc Detach.source } */
	readonly source: StableRangeInternal;
}

/**
 * {@inheritdoc SetValue}
 * @alpha
 */
export interface SetValueInternal extends Omit<SetValueInternal_0_0_2, 'nodeToModify'> {
	/** {@inheritdoc SetValue.nodeToModify } */
	readonly nodeToModify: NodeId;
}

/**
 * {@inheritdoc Constraint}
 * @alpha
 */
export interface ConstraintInternal extends Omit<ConstraintInternal_0_0_2, 'toConstrain' | 'parentNode'> {
	/** {@inheritdoc Constraint.toConstrain } */
	readonly toConstrain: StableRangeInternal;
	/** {@inheritdoc Constraint.parentNode } */
	readonly parentNode?: NodeId;
}

// Note: Documentation of this constant is merged with documentation of the `ChangeInternal` interface.
/**
 * @alpha
 */
export const ChangeInternal = {
	build: (source: TreeNodeSequence<BuildNodeInternal>, destination: DetachedSequenceId): BuildInternal => ({
		destination,
		source,
		type: ChangeTypeInternal.Build,
	}),

	insert: (source: DetachedSequenceId, destination: StablePlaceInternal): InsertInternal => ({
		destination,
		source,
		type: ChangeTypeInternal.Insert,
	}),

	detach: (source: StableRangeInternal, destination?: DetachedSequenceId): DetachInternal => ({
		destination,
		source,
		type: ChangeTypeInternal.Detach,
	}),

	setPayload: (nodeToModify: NodeData<NodeId> | NodeId, payload: Payload): SetValueInternal => ({
		nodeToModify: getNodeId(nodeToModify),
		payload,
		type: ChangeTypeInternal.SetValue,
	}),

	clearPayload: (nodeToModify: NodeData<NodeId> | NodeId): SetValueInternal => ({
		nodeToModify: getNodeId(nodeToModify),
		// Rationale: 'undefined' is reserved for future use (see 'SetValue' interface above.)
		payload: null,
		type: ChangeTypeInternal.SetValue,
	}),

	constraint: (
		toConstrain: StableRangeInternal,
		effect: ConstraintEffect,
		identityHash?: UuidString,
		length?: number,
		contentHash?: UuidString,
		parentNode?: NodeId,
		label?: TraitLabel
	): ConstraintInternal => ({
		toConstrain,
		effect,
		identityHash,
		length,
		contentHash,
		parentNode,
		label,
		type: ChangeTypeInternal.Constraint,
	}),

	/** {@inheritdoc (Change:variable).delete } */
	delete: (stableRange: StableRangeInternal): ChangeInternal => ChangeInternal.detach(stableRange),

	/** {@inheritdoc (Change:variable).insertTree } */
	insertTree: (nodes: TreeNodeSequence<BuildNodeInternal>, destination: StablePlaceInternal): ChangeInternal[] => {
		const build = ChangeInternal.build(nodes, 0 as DetachedSequenceId);
		return [build, ChangeInternal.insert(build.destination, destination)];
	},

	/** {@inheritdoc (Change:variable).move } */
	move: (source: StableRangeInternal, destination: StablePlaceInternal): ChangeInternal[] => {
		const detach = ChangeInternal.detach(source, 0 as DetachedSequenceId);
		return [detach, ChangeInternal.insert(assertNotUndefined(detach.destination), destination)];
	},
};

/**
 * {@inheritdoc (StablePlace:interface) }
 * @alpha
 */
export interface StablePlaceInternal extends Omit<StablePlaceInternal_0_0_2, 'referenceSibling' | 'referenceTrait'> {
	/**
	 * {@inheritdoc (StablePlace:interface).referenceSibling }
	 */
	readonly referenceSibling?: NodeId;

	/**
	 * {@inheritdoc (StablePlace:interface).referenceTrait }
	 */
	readonly referenceTrait?: TraitLocationInternal;
}

/**
 * {@inheritdoc (StableRange:interface) }
 * @alpha
 */
export interface StableRangeInternal {
	/** {@inheritdoc (StableRange:interface).start } */
	readonly start: StablePlaceInternal;
	/** {@inheritdoc (StableRange:interface).end } */
	readonly end: StablePlaceInternal;
}

/**
 * The remainder of this file consists of factory methods duplicated with those for StableRange/StablePlace and are maintained while
 * the new persisted version of SharedTree ops/summaries is rolled out.
 */

/**
 * @alpha
 */
export const StablePlaceInternal = {
	/**
	 * @returns The location directly before `node`.
	 */
	before: (node: NodeData<NodeId> | NodeId): StablePlaceInternal => ({
		side: Side.Before,
		referenceSibling: getNodeId(node),
	}),
	/**
	 * @returns The location directly after `node`.
	 */
	after: (node: NodeData<NodeId> | NodeId): StablePlaceInternal => ({
		side: Side.After,
		referenceSibling: getNodeId(node),
	}),
	/**
	 * @returns The location at the start of `trait`.
	 */
	atStartOf: (trait: TraitLocationInternal): StablePlaceInternal => ({
		side: Side.After,
		referenceTrait: trait,
	}),
	/**
	 * @returns The location at the end of `trait`.
	 */
	atEndOf: (trait: TraitLocationInternal): StablePlaceInternal => ({
		side: Side.Before,
		referenceTrait: trait,
	}),
};

/**
 * @alpha
 */
export const StableRangeInternal = {
	/**
	 * Factory for producing a `StableRange` from a start `StablePlace` to an end `StablePlace`.
	 *
	 * @example
	 *
	 * ```typescript
	 * StableRange.from(StablePlace.before(startNode)).to(StablePlace.after(endNode))
	 * ```
	 */
	from: (start: StablePlaceInternal): { to: (end: StablePlaceInternal) => StableRangeInternal } => ({
		to: (end: StablePlaceInternal): StableRangeInternal => {
			if (start.referenceTrait && end.referenceTrait) {
				assert(
					start.referenceTrait.parent === end.referenceTrait.parent,
					0x65e /* StableRange must be constructed with endpoints from the same trait */
				);
				assert(
					start.referenceTrait.label === end.referenceTrait.label,
					0x65f /* StableRange must be constructed with endpoints from the same trait */
				);
			}
			return { start, end };
		},
	}),
	/**
	 * @returns a `StableRange` which contains only the provided `node`.
	 * Both the start and end `StablePlace` objects used to anchor this `StableRange` are in terms of the passed in node.
	 */
	only: (node: NodeData<NodeId> | NodeId): StableRangeInternal => ({
		start: StablePlaceInternal.before(node),
		end: StablePlaceInternal.after(node),
	}),
	/**
	 * @returns a `StableRange` which contains everything in the trait.
	 * This is anchored using the provided `trait`, and is independent of the actual contents of the trait:
	 * it does not use sibling anchoring.
	 */
	all: (trait: TraitLocationInternal): StableRangeInternal => ({
		start: StablePlaceInternal.atStartOf(trait),
		end: StablePlaceInternal.atEndOf(trait),
	}),
};

/**
 * Discriminated union of valid 0.0.1 SharedTree op types.
 */
export type SharedTreeOp = SharedTreeEditOp | SharedTreeHandleOp | SharedTreeUpdateOp | SharedTreeNoOp;

export interface SharedTreeEditOp extends VersionedOp<WriteFormat.v0_1_1> {
	readonly type: SharedTreeOpType.Edit;
	/** The collection of changes to apply. */
	readonly edit: Edit<CompressedChangeInternal<OpSpaceNodeId>>;
	/** Contains all the IDs generated by the originating client since the last sent op */
	readonly idRange: IdCreationRange;
}

/**
 * A SharedTree op that includes edit handle information.
 * The handle corresponds to an edit chunk in the edit log.
 */
export interface SharedTreeHandleOp extends VersionedOp<WriteFormat.v0_1_1> {
	readonly type: SharedTreeOpType.Handle;
	/** The serialized handle to an uploaded edit chunk. */
	readonly editHandle: string;
	/** The index of the first edit in the chunk that corresponds to the handle. */
	readonly startRevision: number;
}

/** The number of IDs that a SharedTree reserves for current or future internal use */
// This value must never change
export const reservedIdCount = 10;

/** The SessionID of the Upgrade Session */
// This UUID must never change
export const ghostSessionId = '79590933-1c70-4fda-817a-adab57c20318' as SessionId;

/** Accepts either a node or a node's identifier, and returns the identifier */
function getNodeId<TId>(node: TId | NodeData<TId>): TId {
	return (node as NodeData<TId>).identifier ?? (node as TId);
}
