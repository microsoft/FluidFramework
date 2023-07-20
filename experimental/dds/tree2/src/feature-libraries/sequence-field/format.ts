/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, TSchema, Type } from "@sinclair/typebox";
import { ITreeCursorSynchronous, JsonableTree, RevisionTag, RevisionTagSchema } from "../../core";
import {
	ChangeAtomId,
	ChangesetLocalId,
	ChangesetLocalIdSchema,
	EncodedChangeAtomId,
	NodeChangeset,
} from "../modular-schema";

// TODO:AB#4259 Decouple types used for sequence-field's in-memory representation from their encoded variants.
// Currently, types in this file are largely used for both.
// See for example `Revive` whose type uses ITreeCursorSynchronous,
// but the schema for the serialized type uses ProtoNode (which is the result of serializing that cursor).

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

/**
 * The contents of a node to be created
 */
export type ProtoNode = JsonableTree;
export const ProtoNode = Type.Any();

export type NodeCount = number;
export const NodeCount = Type.Number();

/**
 * Left undefined for terseness.
 */
export const NoopMarkType = undefined;

/**
 * A monotonically increasing positive integer assigned to an individual mark within the changeset.
 * MoveIds are scoped to a single changeset, so referring to MoveIds across changesets requires
 * qualifying them by change tag.
 *
 * The uniqueness of IDs is leveraged to uniquely identify the matching move-out for a move-in/return and vice-versa.
 */
export type MoveId = ChangesetLocalId;
export const MoveId = ChangesetLocalIdSchema;

export interface HasMoveId {
	/**
	 * The sequential ID assigned to a change within a transaction.
	 */
	id: MoveId;
}
export const HasMoveId = Type.Object({ id: MoveId });

export type NodeChangeType = NodeChangeset;

// Boolean encodings can use this alternative to save space for frequently false values.
const OptionalTrue = Type.Optional(Type.Literal(true));

export enum Tiebreak {
	Left,
	Right,
}

export enum Effects {
	All = "All",
	Move = "Move",
	Delete = "Delete",
	None = "None",
}

/**
 * Represents a position within a contiguous range of nodes detached by a single changeset.
 * Note that `LineageEvent`s with the same revision are not necessarily referring to the same detach.
 * `LineageEvent`s for a given revision can only be meaningfully compared if it is known that they must refer to the
 * same detach.
 * @alpha
 */
export interface LineageEvent {
	readonly revision: RevisionTag;
	readonly id: ChangesetLocalId;
	readonly count: number;

	/**
	 * The position of this mark within a range of nodes which were detached in this revision.
	 */
	readonly offset: number;
}
export const LineageEvent = Type.Object(
	{
		revision: Type.Readonly(RevisionTagSchema),
		offset: Type.Readonly(Type.Number()),
	},
	noAdditionalProps,
);

/**
 * @alpha
 */
export interface HasLineage {
	/**
	 * History of detaches adjacent to the cells described by this `ChangeAtomId`.
	 */
	lineage?: LineageEvent[];
}

export const HasLineage = Type.Object({ lineage: Type.Optional(Type.Array(LineageEvent)) });

/**
 * @alpha
 */
export interface CellId extends ChangeAtomId, HasLineage {}

export const CellId = Type.Composite([EncodedChangeAtomId, HasLineage]);

export interface HasChanges<TNodeChange = NodeChangeType> {
	changes?: TNodeChange;
}
export const HasChanges = <TNodeChange extends TSchema>(tNodeChange: TNodeChange) =>
	Type.Object({ changes: Type.Optional(tNodeChange) });

export interface HasPlaceFields extends HasLineage {
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
}

const EffectsSchema = Type.Enum(Effects);
export const HasPlaceFields = Type.Composite([
	Type.Object({
		heed: Type.Optional(
			Type.Union([EffectsSchema, Type.Tuple([EffectsSchema, EffectsSchema])]),
		),
		tiebreak: Type.Optional(Type.Enum(Tiebreak)),
	}),
	HasLineage,
]);

/**
 * Mark which targets a range of existing cells instead of creating new cells.
 */
export interface CellTargetingMark {
	/**
	 * Describes the detach which last emptied the target cells,
	 * or the attach which allocated the cells if the cells have never been filled.
	 * Undefined if the target cells are not empty in this mark's input context.
	 */
	cellId?: CellId;
}
export const CellTargetingMark = Type.Object({
	cellId: Type.Optional(CellId),
});

export interface HasReattachFields extends CellTargetingMark {
	/**
	 * The revision this mark is inverting a detach from.
	 * If defined this mark is a revert-only inverse,
	 * meaning that it will only reattach nodes if those nodes were last detached by `inverseOf`.
	 * If `inverseOf` is undefined, this mark will reattach nodes regardless of when they were last detached.
	 */
	inverseOf?: RevisionTag;
}
export const HasReattachFields = Type.Composite([
	Type.Object({
		inverseOf: Type.Optional(RevisionTagSchema),
	}),
	CellTargetingMark,
]);

export interface NoopMark extends CellTargetingMark {
	/**
	 * Declared for consistency with other marks.
	 * Left undefined for terseness.
	 */
	type?: typeof NoopMarkType;

	/**
	 * The number of nodes being skipped.
	 */
	count: NodeCount;
}
export const NoopMark = Type.Composite(
	[CellTargetingMark, Type.Object({ count: NodeCount })],
	noAdditionalProps,
);

export interface DetachedCellMark extends CellTargetingMark {
	cellId: CellId;
}
export const DetachedCellMark = Type.Composite([
	CellTargetingMark,
	Type.Object({ cellId: CellId }),
]);

export enum RangeType {
	Set = "Set",
	Slice = "Slice",
}

export interface HasRevisionTag {
	/**
	 * The revision this mark is part of.
	 * Only set for marks in fields which are a composition of multiple revisions.
	 */
	revision?: RevisionTag;
}
export const HasRevisionTag = Type.Object({ revision: Type.Optional(RevisionTagSchema) });

export interface Transient {
	/**
	 * The details of the change that deletes the transient content.
	 */
	transientDetach: ChangeAtomId;
}
export const Transient = Type.Object({ detachedBy: EncodedChangeAtomId });

export type CanBeTransient = Partial<Transient>;
export const CanBeTransient = Type.Partial(Transient);

export interface Insert<TNodeChange = NodeChangeType>
	extends HasPlaceFields,
		HasRevisionTag,
		CanBeTransient,
		HasChanges<TNodeChange> {
	type: "Insert";
	content: ProtoNode[];

	/**
	 * The first ID in a block associated with the nodes being inserted.
	 * The node `content[i]` is associated with `id + i`.
	 */
	id: ChangesetLocalId;
}
export const Insert = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Composite(
		[
			HasPlaceFields,
			HasRevisionTag,
			HasChanges(tNodeChange),
			Type.Object({
				type: Type.Literal("Insert"),
				content: Type.Array(ProtoNode),
				id: ChangesetLocalIdSchema,
			}),
		],
		noAdditionalProps,
	);

export interface MoveIn extends HasMoveId, HasPlaceFields, HasRevisionTag {
	type: "MoveIn";
	/**
	 * The actual number of nodes being moved-in. This count excludes nodes that were concurrently deleted.
	 */
	count: NodeCount;
	/**
	 * When true, the corresponding MoveOut has a conflict.
	 * This is independent of whether this mark has a conflict.
	 */
	isSrcConflicted?: true;
}

export const MoveIn = Type.Composite(
	[
		HasMoveId,
		HasPlaceFields,
		HasRevisionTag,
		Type.Object({
			type: Type.Literal("MoveIn"),
			count: NodeCount,
			isSrcConflicted: OptionalTrue,
		}),
	],
	noAdditionalProps,
);

export interface Delete<TNodeChange = NodeChangeType>
	extends HasRevisionTag,
		HasChanges<TNodeChange>,
		CellTargetingMark {
	type: "Delete";
	count: NodeCount;
	id: ChangesetLocalId;
}

// Note: inconsistent naming here is to avoid shadowing Effects.Delete
export const DeleteSchema = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Composite(
		[
			HasRevisionTag,
			HasChanges(tNodeChange),
			CellTargetingMark,
			Type.Object({
				type: Type.Literal("Delete"),
				id: ChangesetLocalIdSchema,
				count: NodeCount,
			}),
		],
		noAdditionalProps,
	);

export interface MoveOut<TNodeChange = NodeChangeType>
	extends HasRevisionTag,
		HasMoveId,
		HasChanges<TNodeChange>,
		CellTargetingMark {
	type: "MoveOut";
	count: NodeCount;
}
export const MoveOut = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Composite(
		[
			HasRevisionTag,
			HasMoveId,
			HasChanges(tNodeChange),
			CellTargetingMark,
			Type.Object({
				type: Type.Literal("MoveOut"),
				count: NodeCount,
			}),
		],
		noAdditionalProps,
	);

export interface Revive<TNodeChange = NodeChangeType>
	extends HasReattachFields,
		HasRevisionTag,
		CanBeTransient,
		HasChanges<TNodeChange> {
	type: "Revive";
	content: ITreeCursorSynchronous[];
	count: NodeCount;
}
export const Revive = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Composite(
		[
			HasReattachFields,
			HasRevisionTag,
			CanBeTransient,
			HasChanges(tNodeChange),
			Type.Object({
				type: Type.Literal("Revive"),
				content: Type.Array(ProtoNode),
				count: NodeCount,
			}),
		],
		noAdditionalProps,
	);

export interface ReturnTo extends HasReattachFields, HasRevisionTag, HasMoveId {
	type: "ReturnTo";
	count: NodeCount;

	/**
	 * When true, the corresponding ReturnFrom has a conflict.
	 * This is independent of whether this mark has a conflict.
	 */
	isSrcConflicted?: true;
}
export const ReturnTo = Type.Composite(
	[
		HasReattachFields,
		HasRevisionTag,
		HasMoveId,
		Type.Object({
			type: Type.Literal("ReturnTo"),
			count: NodeCount,
			isSrcConflicted: OptionalTrue,
		}),
	],
	noAdditionalProps,
);

export interface ReturnFrom<TNodeChange = NodeChangeType>
	extends HasRevisionTag,
		HasMoveId,
		HasChanges<TNodeChange>,
		CellTargetingMark {
	type: "ReturnFrom";
	count: NodeCount;

	/**
	 * When true, the corresponding ReturnTo has a conflict.
	 * This is independent of whether this mark has a conflict.
	 */
	isDstConflicted?: true;
}
export const ReturnFrom = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Composite(
		[
			HasRevisionTag,
			HasMoveId,
			HasChanges(tNodeChange),
			CellTargetingMark,
			Type.Object({
				type: Type.Literal("ReturnFrom"),
				count: NodeCount,
				isDstConflicted: OptionalTrue,
			}),
		],
		noAdditionalProps,
	);

/**
 * An attach mark that allocates new cells.
 */
export type NewAttach<TNodeChange = NodeChangeType> = Insert<TNodeChange> | MoveIn;
export const NewAttach = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Union([Insert(tNodeChange), MoveIn]);

export type Reattach<TNodeChange = NodeChangeType> = Revive<TNodeChange> | ReturnTo;
export const Reattach = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Union([Revive(tNodeChange), ReturnTo]);

export type Attach<TNodeChange = NodeChangeType> = NewAttach<TNodeChange> | Reattach<TNodeChange>;
export const Attach = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Union([NewAttach(tNodeChange), Reattach(tNodeChange)]);

export type Detach<TNodeChange = NodeChangeType> =
	| Delete<TNodeChange>
	| MoveOut<TNodeChange>
	| ReturnFrom<TNodeChange>;
export const Detach = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Union([DeleteSchema(tNodeChange), MoveOut(tNodeChange), ReturnFrom(tNodeChange)]);

/**
 * Mark used during compose to temporarily remember the position of nodes which were being moved
 * but had their move cancelled with an inverse.
 * This mark should only exist as part of intermediate output of compose and should be removed during the amendCompose pass.
 */
export interface MovePlaceholder<TNodeChange>
	extends CellTargetingMark,
		HasRevisionTag,
		HasMoveId,
		HasChanges<TNodeChange> {
	type: "Placeholder";
	count: NodeCount;
}

export interface Modify<TNodeChange = NodeChangeType> extends CellTargetingMark {
	type: "Modify";
	changes: TNodeChange;
}
export const Modify = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Composite(
		[
			CellTargetingMark,
			Type.Object({
				type: Type.Literal("Modify"),
				changes: tNodeChange,
			}),
		],
		noAdditionalProps,
	);

/**
 * A mark which extends `CellTargetingMark`.
 */
export type ExistingCellMark<TNodeChange> =
	| NoopMark
	| MovePlaceholder<TNodeChange>
	| Delete<TNodeChange>
	| MoveOut<TNodeChange>
	| ReturnFrom<TNodeChange>
	| Modify<TNodeChange>
	| Revive<TNodeChange>
	| ReturnTo;
export const ExistingCellMark = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Union([
		NoopMark,
		DeleteSchema(tNodeChange),
		MoveOut(tNodeChange),
		ReturnFrom(tNodeChange),
		Modify(tNodeChange),
		Revive(tNodeChange),
		ReturnTo,
	]);

export type EmptyInputCellMark<TNodeChange> =
	| NewAttach<TNodeChange>
	| (DetachedCellMark & ExistingCellMark<TNodeChange>);
export const EmptyInputCellMark = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Union([
		NewAttach(tNodeChange),
		Type.Intersect([DetachedCellMark, ExistingCellMark(tNodeChange)]),
	]);

export type Mark<TNodeChange = NodeChangeType> =
	| NoopMark
	| Modify<TNodeChange>
	| MovePlaceholder<TNodeChange>
	| Attach<TNodeChange>
	| Detach<TNodeChange>;
export const Mark = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Union([NoopMark, Modify(tNodeChange), Attach(tNodeChange), Detach(tNodeChange)]);

export type MarkList<TNodeChange = NodeChangeType> = Mark<TNodeChange>[];

export type Changeset<TNodeChange = NodeChangeType> = MarkList<TNodeChange>;
export const Changeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Array(Mark(tNodeChange));

/**
 * A mark that spans one or more cells.
 * The spanned cells may be populated (e.g., "Delete") or not (e.g., "Revive").
 */
export type CellSpanningMark<TNodeChange> = Exclude<Mark<TNodeChange>, NewAttach<TNodeChange>>;

export function isEmpty<T>(change: Changeset<T>): boolean {
	return change.length === 0;
}
