/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AttachAndDetach,
	CellId,
	CellMark,
	Detach,
	HasMarkFields,
	Mark,
	MoveIn,
	MoveOut,
} from "./types.js";

export type EmptyInputCellMark = Mark & DetachedCellMark;

export interface DetachedCellMark extends HasMarkFields {
	cellId: CellId;
}

export type EmptyOutputCellMark = CellMark<Detach | AttachAndDetach>;

export type MoveMarkEffect = MoveOut | MoveIn;
export type DetachOfRemovedNodes = Detach & { cellId: CellId };
export type CellRename = AttachAndDetach | DetachOfRemovedNodes;
