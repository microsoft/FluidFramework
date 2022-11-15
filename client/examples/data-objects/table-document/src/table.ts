/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICombiningOp, PropertySet } from "@fluidframework/merge-tree";

export type TableDocumentItem = any;

/**
 * @deprecated `ITable` is an abandoned prototype.
 * Please use {@link @fluidframework/matrix#SharedMatrix} with the `IMatrixProducer`/`Consumer` interfaces instead.
 */
export interface ITable {
    readonly numRows: number;
    readonly numCols: number;

    getCellValue(row: number, col: number): TableDocumentItem;
    setCellValue(row: number, col: number, value: TableDocumentItem, properties?: PropertySet);
    annotateRows(startRow: number, endRow: number, properties: PropertySet, op?: ICombiningOp);
    getRowProperties(row: number): PropertySet;
    annotateCols(startCol: number, endCol: number, properties: PropertySet, op?: ICombiningOp);
    getColProperties(col: number): PropertySet;
    annotateCell(row: number, col: number, properties: PropertySet);
    getCellProperties(row: number, col: number): PropertySet;
    insertRows(startRow: number, numRows: number): void;
    removeRows(startRow: number, numRows: number): void;
    insertCols(startCol: number, numCols: number): void;
    removeCols(startCol: number, numCols: number): void;
}
