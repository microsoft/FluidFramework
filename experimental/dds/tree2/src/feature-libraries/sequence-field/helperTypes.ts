/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CellId,
	CellTargetingMark,
	Delete,
	Detach,
	Insert,
	Mark,
	Modify,
	MoveOut,
	MovePlaceholder,
	NewAttach,
	NoopMark,
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
	| MovePlaceholder<TNodeChange>
	| Delete<TNodeChange>
	| MoveOut<TNodeChange>
	| ReturnFrom<TNodeChange>
	| Modify<TNodeChange>
	| Revive<TNodeChange>
	| ReturnTo;

export type EmptyInputCellMark<TNodeChange> =
	| NewAttach<TNodeChange>
	| (DetachedCellMark & ExistingCellMark<TNodeChange>);

/**
 * A mark that spans one or more cells.
 * The spanned cells may be populated (e.g., "Delete") or not (e.g., "Revive").
 */
export type CellSpanningMark<TNodeChange> = Exclude<Mark<TNodeChange>, NewAttach<TNodeChange>>;

export interface DetachedCellMark extends CellTargetingMark {
	cellId: CellId;
}

export type GenerativeMark<TNodeChange> = Insert<TNodeChange> | Revive<TNodeChange>;

export type TransientMark<TNodeChange> = GenerativeMark<TNodeChange> & Transient;

export type EmptyOutputCellMark<TNodeChange> = TransientMark<TNodeChange> | Detach<TNodeChange>;
