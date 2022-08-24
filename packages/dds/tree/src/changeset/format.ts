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
export namespace ITransposed {
	export interface Transaction extends IPeerChangeset {
		/**
		 * The tag of the changeset that this transaction was originally issued after.
		 */
		ref: ChangesetTag;
		/**
		 * The tag of the latest changeset that this transaction has been transposed over.
		 * Omitted on changesets that have not been transposed.
		 */
		newRef?: ChangesetTag;
	}

	/**
	 * Represents changes to a document forest.
	 */
	export interface ILocalChangeset {
		marks: IFieldMarks;
		moves?: IMoveEntry<ITreeForestPath>[];
	}

	/**
	 * Represents changes to a document tree.
	 */
	export interface IPeerChangeset {
		marks: MarkList;
		moves?: IMoveEntry[];
	}

	export interface IMoveEntry<TPath = TreeRootPath> {
		id: OpId;
		src: TPath;
		dst: TPath;
		hops?: TPath[];
	}

	export type MarkList<TMark = Mark> = TMark[];

	export type Mark =
		| SizedMark
		| Attach;

	export type ObjectMark =
		| SizedObjectMark
		| Attach;

	export type SizedMark =
		| Skip
		| SizedObjectMark;

	export type SizedObjectMark =
		| ITomb
		| IModify
		| IDetach
		| IReattach
		| IModifyReattach
		| IModifyDetach
		| IGapEffectSegment;

	export interface ITomb {
		type: "Tomb";
		change: ChangesetTag;
		count: number;
	}

	export interface ISetValue extends IHasOpId {
		/** Can be left unset to represent the value being cleared. */
		value?: Value;
	}

	export interface IModify {
		type: "Modify";
		tomb?: ChangesetTag;
		value?: ISetValue;
		fields?: IFieldMarks;
	}

	export interface IFieldMarks {
		[key: string]: MarkList;
	}

	export interface IHasPlaceFields {
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
		src?: IPriorOp;

		/**
		 * Indicates a prior concurrent slice-delete that the target place was affected by.
		 */
		scorch?: IPriorOp;
	}

	export interface IGapEffectPolicy {
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

	export interface IInsert extends IHasOpId, IHasPlaceFields {
		type: "Insert";
		content: ProtoNode[];
	}

	export interface IModifyInsert extends IHasOpId, IHasPlaceFields {
		type: "MInsert";
		content: ProtoNode;
		value?: ISetValue;
		fields?: IFieldMarks;
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
	export interface IBounce extends IHasOpId, IHasPlaceFields {
		type: "Bounce";
	}

	/**
	 * Represents the precise location of a concurrent slice-move-in within the same gap.
	 * This is needed so we can tell where concurrent sliced-inserts (that this changeset has yet to be rebased over)
	 * may land in the gap. Without this, we would need to be able to retain information about the relative order in
	 * time of any number of concurrent slice-moves. See scenario N.
	 */
	export interface IIntake extends IPriorOp {
		type: "Intake";
	}

	export interface IMoveIn extends IHasOpId, IHasPlaceFields {
		type: "MoveIn";
		/**
		 * The actual number of nodes being moved-in. This count excludes nodes that were concurrently deleted.
		 */
		count: NodeCount;
	}

	export interface IModifyMoveIn extends IHasOpId, IHasPlaceFields {
		type: "MMoveIn";
		value?: ISetValue;
		fields?: IFieldMarks;
	}

	export type Attach = IInsert | IModifyInsert | IMoveIn | IModifyMoveIn | IBounce | IIntake;

	export type GapEffect = IScorch | IForward | IHeal | IUnforward;

	export type GapEffectType = GapEffect["type"];

	export interface IGapEffectSegment {
		tomb?: ChangesetTag;
		type: "Gap";
		count: GapCount;
		/**
		 * Stack of effects applying to the gaps.
		 */
		stack: GapEffect[];
	}

	export interface IScorch extends IHasOpId, IGapEffectPolicy {
		type: "Scorch";
	}

	export interface IHeal extends IHasOpId, IGapEffectPolicy {
		type: "Heal";
	}

	export interface IForward extends IHasOpId, IGapEffectPolicy {
		type: "Forward";
	}

	export interface IUnforward extends IHasOpId, IGapEffectPolicy {
		type: "Unforward";
	}

	export type NodeMark = IDetach | IReattach;

	export interface IDetach extends IHasOpId {
		tomb?: ChangesetTag;
		gaps?: GapEffect[];
		type: "Delete" | "MoveOut";
		count: NodeCount;
	}

	export interface IModifyDetach extends IHasOpId {
		type: "MDelete" | "MMoveOut";
		tomb?: ChangesetTag;
		value?: ISetValue;
		fields?: IFieldMarks;
	}

	export interface IReattach extends IHasOpId {
		type: "Revive" | "Return";
		tomb: ChangesetTag;
		count: NodeCount;
	}
	export interface IModifyReattach extends IHasOpId {
		type: "MRevive" | "MReturn";
		tomb: ChangesetTag;
		value?: ISetValue;
		fields?: IFieldMarks;
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
	export interface ITombstones {
		count: NodeCount;
		change: ChangesetTag;
	}

	export interface IPriorOp {
		change: ChangesetTag;
		id: OpId;
	}
}

export interface IHasLength {
	/**
	 * Omit if 1.
	 */
	length?: number;
}

export interface ITreeForestPath {
	[label: string]: TreeRootPath;
}

export type TreeRootPath = number | { [label: number]: ITreeForestPath; };

export enum RangeType {
	Set = "Set",
	Slice = "Slice",
}

/**
 * A monotonically increasing positive integer assigned to each change within the changeset.
 * OpIds are scoped to a single changeset, so referring to OpIds across changesets requires
 * qualifying them by change tag.
 *
 * The uniqueness of IDs is leveraged to uniquely identify the matching move-out for a move-in/return and vice-versa.
 */
export type OpId = number;

export interface IHasOpId {
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
export type ChangesetTag = number | string;
export type Value = number | string | boolean;
export type ClientId = number;
export enum Tiebreak { Left, Right }
export enum Effects {
	All = "All",
	Move = "Move",
	Delete = "Delete",
	None = "None",
}
