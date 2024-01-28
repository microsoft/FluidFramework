/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";
import { IMergeTreeOp } from "@fluidframework/merge-tree";

export enum MatrixOp {
	spliceCols,
	spliceRows,
	set,
}

export enum SnapshotPath {
	rows = "rows",
	cols = "cols",
	cells = "cells",
}

/**
 * A matrix cell value may be undefined (indicating an empty cell) or any serializable type,
 * excluding null.  (However, nulls may be embedded inside objects and arrays.)
 * @alpha
 */
// eslint-disable-next-line @rushstack/no-new-null -- Using 'null' to disallow 'null'.
export type MatrixItem<T> = Serializable<Exclude<T, null>> | undefined;

export type IMatrixVectorMst = IMergeTreeOp & {
	target: SnapshotPath.cols | SnapshotPath.rows;
};

export interface ISetOp<T> {
	// Historically, IMatrixVectorMst format did not use type at all, so all swtich logic is done by target.
	// That said, old code asserts that if target === undefined, type should be set to "set", do we have to keep it here.
	type: MatrixOp.set;
	target: undefined;
	row: number;
	col: number;
	value: MatrixItem<T>;
	fwwMode?: boolean;
}

export type IMatrixMsg<T> = IMatrixVectorMst | ISetOp<T>;
