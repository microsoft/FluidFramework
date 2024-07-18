/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This file tracks types that are serialized in summaries / snapshots, and thus can't easily be changed
 * Use caustion when making changes and consider backward and forward compatibility of your changes!
 */

import { Serializable } from "@fluidframework/datastore-definitions/internal";
import { IMergeTreeOp } from "@fluidframework/merge-tree/internal";

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
 * @legacy
 * @alpha
 */
// eslint-disable-next-line @rushstack/no-new-null -- Using 'null' to disallow 'null'.
export type MatrixItem<T> = Serializable<Exclude<T, null>> | undefined;

export interface ISetOp<T> {
	// Historically, VectorOp format did not use type at all, so all swtich logic is done by target.
	// That said, old code asserts that if target === undefined, type should be set to "set", do we have to keep it here.
	type: MatrixOp.set;
	target?: never;
	row: number;
	col: number;
	value: MatrixItem<T>;
	fwwMode?: boolean;
}

export type VectorOp = IMergeTreeOp & Record<"target", SnapshotPath.rows | SnapshotPath.cols>;

export type MatrixSetOrVectorOp<T> = VectorOp | ISetOp<T>;
