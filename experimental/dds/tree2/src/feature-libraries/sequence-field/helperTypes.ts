/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CellId,
	HasMarkFields,
	Detach,
	Mark,
	CellMark,
	TransientEffect,
	MoveIn,
	MoveSource,
} from "./format";

export type EmptyInputCellMark<TNodeChange> = Mark<TNodeChange> & DetachedCellMark;

export interface DetachedCellMark extends HasMarkFields {
	cellId: CellId;
}

export type EmptyOutputCellMark<TNodeChange> = CellMark<Detach | TransientEffect, TNodeChange>;

export type MoveDestination = MoveIn;
export type MoveMarkEffect = MoveSource | MoveDestination;
