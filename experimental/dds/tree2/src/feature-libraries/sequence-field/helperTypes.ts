/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Attach,
	CellId,
	Delete,
	Detach,
	Effect,
	Insert,
	Mark,
	Modify,
	MoveIn,
	MoveOut,
	MovePlaceholder,
	NewAttach,
	Reattach,
	ReturnFrom,
	ReturnTo,
	Revive,
	Transient,
} from "./format";

/**
 * A mark which extends `CellTargetingMark`.
 */
export type ExistingCellMark<TNodeChange> =
	| NoopMark
	| MovePlaceholderMark<TNodeChange>
	| DeleteMark<TNodeChange>
	| MoveOutMark<TNodeChange>
	| ReturnFromMark<TNodeChange>
	| ModifyMark<TNodeChange>
	| ReviveMark<TNodeChange>
	| ReturnToMark;

export type EmptyInputCellMark<TNodeChange> = Mark<TNodeChange> & DetachedCellMark;

/**
 * A mark that spans one or more cells.
 * The spanned cells may be populated (e.g., "Delete") or not (e.g., "Revive").
 */
export type CellSpanningMark<TNodeChange> = Exclude<Mark<TNodeChange>, NewAttach<TNodeChange>>;

export interface DetachedCellMark {
	cellId: CellId;
}

export type Generate<TNodeChange> = Insert<TNodeChange> | Revive<TNodeChange>;

export type TransientGenerate<TNodeChange> = Generate<TNodeChange> & Transient;

export type EmptyOutputCellMark<TNodeChange> = TransientGenerate<TNodeChange> | Detach<TNodeChange>;

export type TransientMark<TNodeChange> = GenerateMark<TNodeChange> & Transient;

export type NodeChangeFromEffect<TEffect extends Effect<unknown>> = TEffect extends Effect<
	infer TNodeChange
>
	? TNodeChange
	: never;
export type EffectMark<TEffect extends Effect<unknown>> = Mark<NodeChangeFromEffect<TEffect>> & {
	effect: [TEffect];
};

export type ModifyMark<TNodeChange> = EffectMark<Modify<TNodeChange>>;
export type GenerateMark<TNodeChange> = EffectMark<Generate<TNodeChange>>;
export type TransientGenerateMark<TNodeChange> = EffectMark<TransientGenerate<TNodeChange>>;
export type NewAttachMark<TNodeChange> = EffectMark<NewAttach<TNodeChange>>;
export type InsertMark<TNodeChange> = EffectMark<Insert<TNodeChange>>;
export type AttachMark<TNodeChange> = EffectMark<Attach<TNodeChange>>;
export type MoveInMark = EffectMark<MoveIn>;
export type Move<TNodeChange> = MoveOut<TNodeChange> | MoveIn | ReturnFrom<TNodeChange> | ReturnTo;
export type MoveMark<TNodeChange> = EffectMark<Move<TNodeChange>>;
export type DetachMark<TNodeChange> = EffectMark<Detach<TNodeChange>>;
export type ReattachMark<TNodeChange> = EffectMark<Reattach<TNodeChange>>;
export type ReturnToMark = EffectMark<ReturnTo>;
export type DeleteMark<TNodeChange> = EffectMark<Delete<TNodeChange>>;
export type ReviveMark<TNodeChange> = EffectMark<Revive<TNodeChange>>;
export type MovePlaceholderMark<TNodeChange> = EffectMark<MovePlaceholder<TNodeChange>>;
export type MoveOutMark<TNodeChange> = EffectMark<MoveOut<TNodeChange>>;
export type ReturnFromMark<TNodeChange> = EffectMark<ReturnFrom<TNodeChange>>;
export type NoopMark = Mark<never> & { effect?: never };
