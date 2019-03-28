import { ICombiningOp, PropertySet } from "@prague/merge-tree";
import { UnboxedOper } from "../../client-ui/ext/calc";

export interface ITable {
    readonly numRows: number;
    readonly numCols: number;

    getCellValue(row: number, col: number): UnboxedOper;
    setCellValue(row: number, col: number, value: UnboxedOper);
    evaluateFormula(formula: string): UnboxedOper;
    evaluateCell(row: number, col: number): UnboxedOper;
    annotateRows(startRow: number, endRow: number, properties: PropertySet, op?: ICombiningOp);
    getRowProperties(row: number): PropertySet;
    annotateCols(startCol: number, endCol: number, properties: PropertySet, op?: ICombiningOp);
    getColProperties(col: number): PropertySet;
    insertRows(startRow: number, numRows: number);
    removeRows(startRow: number, numRows: number);
    insertCols(startCol: number, numCols: number);
    removeCols(startCol: number, numCols: number);
}
