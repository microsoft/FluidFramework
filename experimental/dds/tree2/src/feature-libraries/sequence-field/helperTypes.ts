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
	CellMark,
	TransientEffect,
} from "./format";

export type EmptyInputCellMark<TNodeChange> = Mark<TNodeChange> & DetachedCellMark;

/**
 * A mark that spans one or more cells.
 * The spanned cells may be populated (e.g., "Delete") or not (e.g., "Revive").
 */
export type CellSpanningMark<TNodeChange> = Exclude<Mark<TNodeChange>, NewAttach>;

export interface DetachedCellMark extends HasMarkFields {
	cellId: CellId;
}

export type GenerativeMark<TNodeChange> = CellMark<Insert | Revive, TNodeChange>;

export type EmptyOutputCellMark<TNodeChange> = CellMark<Detach | TransientEffect, TNodeChange>;
