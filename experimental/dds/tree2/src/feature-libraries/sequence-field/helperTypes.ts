/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CellId, HasMarkFields, Detach, Insert, Mark, Transient } from "./format";

export type EmptyInputCellMark<TNodeChange> = Mark<TNodeChange> & DetachedCellMark;

export interface DetachedCellMark extends HasMarkFields {
	cellId: CellId;
}

export type TransientMark<TNodeChange> = Insert<TNodeChange> & Transient;

export type EmptyOutputCellMark<TNodeChange> = TransientMark<TNodeChange> | Detach<TNodeChange>;
