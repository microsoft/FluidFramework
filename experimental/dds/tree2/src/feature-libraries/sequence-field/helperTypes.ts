/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CellId,
	HasMarkFields,
	Detach,
	Insert,
	Mark,
	NewAttach,
	Revive,
	Transient,
	NoopMark,
} from "./format";

export type EmptyInputCellMark<TNodeChange> = Mark<TNodeChange> & DetachedCellMark;

/**
 * A mark that spans one or more cells.
 * The spanned cells may be populated (e.g., "Delete") or not (e.g., "Revive").
 */
export type CellSpanningMark<TNodeChange> = Exclude<Mark<TNodeChange>, NewAttach<TNodeChange>>;

export interface DetachedCellMark extends HasMarkFields {
	cellId: CellId;
}

export type GenerativeMark<TNodeChange> = Insert<TNodeChange> | Revive<TNodeChange>;

export type TransientMark<TNodeChange> = GenerativeMark<TNodeChange> & Transient;

export type EmptyOutputCellMark<TNodeChange> = TransientMark<TNodeChange> | Detach<TNodeChange>;

export type Modify<TNodeChange> = NoopMark<TNodeChange> & { changes: TNodeChange };
