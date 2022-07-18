/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NodeId } from ".";

// TODOs:
// Clipboard
// Constraint scheme

/**
 * Changeset that has may have been transposed (i.e., rebased and/or postbased).
 */
 export namespace Transposed {
	export interface Transaction extends Changeset {
		/**
		 * The reference sequence number of the transaction that this transaction was originally
		 * issued after.
		 */
		ref: SeqNumber;
		/**
		 * The reference sequence number of the transaction that this transaction has been
		 * transposed over.
		 * Omitted on changesets that have not been transposed.
		 */
		newRef?: SeqNumber;
	}

	export interface Changeset {
		marks: PositionedMarks;
		moves?: MoveEntry[];
	}

	export interface MoveEntry {
		id: OpId;
		src: TreePath;
		dst: TreePath;
		hops?: TreePath[];
	}

	export type PositionedMarks<TMark = Mark> = MarkWithOffset<TMark>[];

	/**
	 * See PositionedMarks.
	 */
	export interface MarkWithOffset<TMark = Mark> {
		offset: Offset;
		mark: TMark;
	}

	type Mark =
		| Tomb
		| Modify
		| Detach
		| Reattach
		| ModifyReattach
		| ModifyDetach
		| AttachGroup;

	export type AttachGroup = Attach[];

	export interface Tomb {
		type: "Tomb";
		seq: SeqNumber;
		count: number;
	}

	export type ValueMark = SetValue | RevertValue;

	export interface SetValue {
		type: "Set";
		value: Value;
	}

	export interface RevertValue {
		type: "Revert";
		seq: SeqNumber;
	}

	export interface Modify {
		type: "Modify";
		tomb?: SeqNumber;
		value?: ValueMark;
		fields?: FieldMarks;
	}

	export interface FieldMarks {
		[key: string]: PositionedMarks;
	}

	export interface HasPlaceFields {
		/**
		 * Describes which kinds of concurrent slice operations should affect the target place.
		 *
		 * The tuple allows this choice to be different for concurrent slices that are sequenced
		 * either before (`heed[0]`) or after (`heed[1]`). For example, multiple concurrent updates
		 * of a sequence with last-write-wins semantics would use a slice-delete over the whole
		 * sequence, and an insert with the `heed` value `[Effects.None, Effects.All]`.
		 *
		 * When the value for prior and ulterior concurrent slices is the same, that value can be
		 * used directly instead of the corresponding tuple.
		 *
		 * Omit if `Effects.All` for terseness.
		 */
		heed?: Effects | [Effects, Effects];

		/**
		 * Omit if `Tiebreak.Right` for terseness.
		 */
		tiebreak?: Tiebreak;

		/**
		 * Indicates a prior concurrent slice-move that the target place was affected by.
		 */
		src?: PriorOp;

		/**
		 * Indicates a prior concurrent slice-delete that the target place was affected by.
		 */
		scorch?: PriorOp;
	}

	export interface GapEffectPolicy {
		/**
		 * When `true`, if a concurrent insertion that is sequenced before the range operation falls
		 * within the bounds of the range, then the inserted content will *not* be included in the
		 * range and therefore will *not* be affected by the operation performed on the range.
		 *
		 * Defaults to false.
		 */
		excludePriorInsertions?: true;
		/**
		 * When `true`, if a concurrent insertion that is sequenced after the range operation falls
		 * within the bounds of the range, then the inserted content will be included in the range and
		 * therefore will be affected by the operation performed on the range, unless that insertion
		 * stipulates that it is not commutative with respect to the range operation.
		 *
		 * Defaults to false.
		 */
		includePosteriorInsertions?: true;
	}

	export interface Insert extends HasOpId, HasPlaceFields {
		type: "Insert";
		content: ProtoNode[];
	}

	export interface ModifyInsert extends HasOpId, HasPlaceFields {
		type: "MInsert";
		content: ProtoNode;
		value?: ValueMark;
		fields?: FieldMarks;
	}

	export interface Bounce extends HasOpId, HasPlaceFields {
		type: "Bounce";
	}

	/**
	 * Represents the precise location of a concurrent slice-move-in.
	 * This is needed so we can tell where concurrent sliced-inserts (that this changeset has yet to be rebased over)
	 * may land in the field. Without this, we would need to be able to retain information about the relative order in
	 * time of any number of concurrent slice-moves. See scenario N.
	 */
	export interface Intake extends PriorOp {
		type: "Intake";
	}

	export interface MoveIn extends HasOpId, HasPlaceFields {
		type: "Move";
		/**
		 * The actual number of nodes being moved-in. This count excludes nodes that were concurrently deleted.
		 */
		count: NodeCount;
	}

	export interface ModifyMoveIn extends HasOpId, HasPlaceFields {
		type: "Move";
		value?: ValueMark;
		fields?: FieldMarks;
	}

	export type Attach = Insert | ModifyInsert | MoveIn | ModifyMoveIn | Bounce | Intake;

	export type GapEffect = Scorch | Forward | Heal | Unforward;

	export type GapEffectType = GapEffect["type"];

	export interface GapEffectSegment {
		count: GapCount;
		/**
		 * Stack of effects applying to the gaps.
		 */
		stack: (GapEffect)[];
	}

	export interface Scorch extends HasOpId, GapEffectPolicy {
		type: "Scorch";
	}

	export interface Heal extends HasOpId, GapEffectPolicy {
		type: "Heal";
	}

	export interface Forward extends HasOpId, GapEffectPolicy {
		type: "Forward";
	}

	export interface Unforward extends HasOpId, GapEffectPolicy {
		type: "Unforward";
	}

	export type NodeMark = Detach | Reattach;

	export interface Detach extends HasOpId {
		tomb?: SeqNumber;
		type: "Delete" | "Move";
		count: NodeCount;
	}

	export interface ModifyDetach extends HasOpId {
		type: "Delete" | "Move";
		tomb?: SeqNumber;
		value?: ValueMark;
		fields?: FieldMarks;
	}

	export interface Reattach extends HasOpId {
		type: "Revive" | "Return";
		tomb: SeqNumber;
		count: NodeCount;
	}
	export interface ModifyReattach extends HasOpId {
		type: "Revive" | "Return";
		tomb: SeqNumber;
		value?: ValueMark;
		fields?: FieldMarks;
	}

	/**
	 * Represents a consecutive run of detached nodes.
	 *
	 * Note that in some situations a tombstone is created for the purpose of representing a gap
	 * even though no node has been detached.
	 * This can happen when a slice-move applied to a gap but not the nodes on both sides of the
	 * gap, or when a slice-move is applied to the gap that represents the start (or end) of a
	 * field.
	 */
	export interface Tombstones {
		count: NodeCount;
		seq: PriorSeq;
	}

	export interface PriorOp {
		seq: PriorSeq;
		id: OpId;
	}

	/**
	 * The sequence number of the edit that caused the nodes to be detached.
	 *
	 * When the nodes were detached as the result of learning of a prior concurrent change
	 * that preceded a prior change that the current change depends on, a pair of sequence
	 * numbers is used instead were `seq[0]` is the earlier change whose effect on `seq[1]`
	 * these tombstones represent. This can be read as "tombstones from the effect of `seq[0]`
	 * on `seq[1]`".
	 */
	export type PriorSeq = SeqNumber | [SeqNumber, SeqNumber];
}

export namespace Sequenced {
	export interface Transaction extends Transposed.Transaction {
		seq: SeqNumber;
	}
}

export interface HasLength {
	/**
	 * Omit if 1.
	 */
	length?: number;
}

export interface TreeChildPath {
	[label: string]: TreeRootPath;
}

export type TreeRootPath = number | { [label: number]: TreeChildPath; };

/** A structure that represents a path from the root to a particular node. */
export type TreePath = TreeChildPath | TreeRootPath;

export enum RangeType {
	Set = "Set",
	Slice = "Slice",
}

/**
 * A monotonically increasing positive integer assigned to each segment.
 * The first segment is assigned OpId 0. The next one is assigned OpID 1, and so on.
 * These IDs define total a temporal ordering over all the changes within a change frame.
 * OpIds are scoped to a single frame, so referring to OpIds across frames would require
 * qualifying them by frame number (and potentially sequence/commit number).
 *
 * The temporal ordering is leveraged in the `Original` format to resolve which node a given segment is anchored to:
 * A segment is anchored to the first node, when scanning in the direction indicated by the `side`
 * field, that was either inserted by an operation whose OpId is lower, or left untouched (i.e.
 * represented by an offset), or the end of the field, whichever is encountered first.
 *
 * The uniqueness of IDs is leveraged in either format to
 * 1. uniquely identify tombstones so that two changes can tell whether they carry tombstones for the same nodes or
 * for different nodes.
 * 2. uniquely identify the matching move-out for a move-in/return and vice-versa.
 */
export type OpId = number;

export interface HasSeqNumber {
	/**
	 * Included in a mark to indicate the transaction it was part of.
	 * This number is assigned by the Fluid service.
	 */
	seq: SeqNumber;
}

export interface HasOpId {
	/**
	 * The sequential ID assigned to a change within a transaction.
	 */
	id: OpId;
}

/**
 * The contents of a node to be created
 */
export interface ProtoNode {
	id?: NodeId;
	type?: string;
	value?: Value;
	fields?: ProtoFields;
}

/**
 * The fields of a node to be created
 */
export interface ProtoFields {
	[key: string]: ProtoField;
}

export type OffsetList<TContent = Exclude<unknown, number>, TOffset = number> = (TOffset | TContent)[];

export type ProtoField = ProtoNode[];
export type NodeCount = number;
export type GapCount = number;
export type Offset = number;
export type SeqNumber = number;
export type Value = number | string | boolean;
export type ClientId = number;
export enum Tiebreak { Left, Right }
export enum Effects {
	All = "All",
	Move = "Move",
	Delete = "Delete",
	None = "None",
}
