/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICombiningOp, PropertySet } from "@microsoft/fluid-merge-tree";
import { JsonablePrimitive } from "@microsoft/fluid-runtime-definitions";

export interface ITable {
    readonly numRows: number;
    readonly numCols: number;

    getCellValue(row: number, col: number): JsonablePrimitive;
    setCellValue(row: number, col: number, value: JsonablePrimitive);
    evaluateFormula(formula: string): JsonablePrimitive;
    evaluateCell(row: number, col: number): JsonablePrimitive;
    annotateRows(startRow: number, endRow: number, properties: PropertySet, op?: ICombiningOp);
    getRowProperties(row: number): PropertySet;
    annotateCols(startCol: number, endCol: number, properties: PropertySet, op?: ICombiningOp);
    getColProperties(col: number): PropertySet;
    insertRows(startRow: number, numRows: number): void;
    removeRows(startRow: number, numRows: number): void;
    insertCols(startCol: number, numCols: number): void;
    removeCols(startCol: number, numCols: number): void;
}
