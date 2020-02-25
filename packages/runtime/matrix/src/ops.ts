/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@microsoft/fluid-runtime-definitions";

export enum MatrixOp {
    spliceCols,
    spliceRows,
    set
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
    value: Serializable;
}
