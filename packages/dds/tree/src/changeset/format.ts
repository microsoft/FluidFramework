/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { JsonableTree } from "../tree";

// TODOs:
// Clipboard
// Constraint scheme

/**
 * Changeset that has may have been transposed (i.e., rebased and/or postbased).
 */
export namespace Transposed {
	export interface Transaction extends PeerChangeset {
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

	/**
	 * Represents changes to a document forest.
	 */
	export interface LocalChangeset {
		marks: FieldMarks;
		moves?: MoveEntry<TreeForestPath>[];
	}

	/**
	 * Represents changes to a document tree.
	 */
	export interface PeerChangeset {
		marks: MarkList;
		moves?: MoveEntry[];
	}

	export interface MoveEntry<TPath = TreeRootPath> {
		id: OpId;
		src: TPath;
		dst: TPath;
		hops?: TPath[];
	}

	export type MarkList<TMark = Mark> = TMark[];

	export type Mark =
		| Skip
		| Tomb
		| Modify
		| Detach
		| Reattach
		| ModifyReattach
		| ModifyDetach
		| GapEffectSegment
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
		/** Can be left unset to represent the value being cleared. */
		value?: Value;
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
		[key: string]: MarkList;
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

	/**
	 * Used to represent the transitory location where an insert or move-in was before it was affected by a concurrent
	 * slice-move.
	 *
	 * This is needed in order to determine the relative ordering of inserts and move-ins that were affected by the
	 * same concurrent slice move.
	 * Indeed their ordering ought to be the same as their ordering would have been the source location of the
	 * concurrent slice move.
	 * In order to determine their ordering at the source location, we have to know precisely where at the source
	 * location (and with what tiebreak policy) the inserts were made.
	 * Bounce marks capture that information.
	 * See ScenarioQ for an example.
	 */
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
		type: "MoveIn";
		/**
		 * The actual number of nodes being moved-in. This count excludes nodes that were concurrently deleted.
		 */
		count: NodeCount;
	}

	export interface ModifyMoveIn extends HasOpId, HasPlaceFields {
		type: "MMoveIn";
		value?: ValueMark;
		fields?: FieldMarks;
	}

	export type Attach = Insert | ModifyInsert | MoveIn | ModifyMoveIn | Bounce | Intake;

	export type GapEffect = Scorch | Forward | Heal | Unforward;

	export type GapEffectType = GapEffect["type"];

	export interface GapEffectSegment {
		tombs?: SeqNumber;
		type: "Gap";
		count: GapCount;
		/**
		 * Stack of effects applying to the gaps.
		 */
		stack: GapEffect[];
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
		gaps?: GapEffect[];
		type: "Delete" | "MoveOut";
		count: NodeCount;
	}

	export interface ModifyDetach extends HasOpId {
		type: "MDelete" | "MMoveOut";
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
		type: "MRevive" | "MReturn";
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

export interface TreeForestPath {
	[label: string]: TreeRootPath;
}

export type TreeRootPath = number | { [label: number]: TreeForestPath; };

export enum RangeType {
	Set = "Set",
	Slice = "Slice",
}

/**
 * A monotonically increasing positive integer assigned to each change within the changeset.
 * OpIds are scoped to a single changeset, so referring to OpIds across changesets requires
 * qualifying them by sequence/commit number.
 *
 * The uniqueness of IDs is leveraged to uniquely identify the matching move-out for a move-in/return and vice-versa.
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
export type ProtoNode = JsonableTree;

export type NodeCount = number;
export type GapCount = number;
export type Skip = number;
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
