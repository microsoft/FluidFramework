/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";

export enum MatrixOp {
	spliceCols,
	spliceRows,
	set,
	changeSetCellPolicy,
}

export interface IMatrixMsg {
	type: MatrixOp;
}

export interface IMatrixSpliceMsg extends IMatrixMsg {
	type: MatrixOp.spliceCols | MatrixOp.spliceRows;
	start: number;
	count: number;
}

export interface IMatrixCellMsg extends IMatrixMsg {
	type: MatrixOp.set;
	row: number;
	col: number;
	value: Serializable<unknown>;
}

export interface IMatrixSwitchSetCellPolicy extends IMatrixMsg {
	type: MatrixOp.changeSetCellPolicy;
}
