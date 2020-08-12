/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ICombiningOp, PropertySet } from "@fluidframework/merge-tree";
import {
    Jsonable,
    JsonablePrimitive,
} from "@fluidframework/datastore-definitions";

export type TableDocumentItem = Jsonable<JsonablePrimitive | IFluidHandle>;

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
