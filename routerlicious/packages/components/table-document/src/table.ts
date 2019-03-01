import { UnboxedOper } from "../../client-ui/ext/calc";

export interface ITable {
    readonly numRows: number;
    readonly numCols: number;

    getCellText(row: number, col: number): UnboxedOper;
    setCellText(row: number, col: number, value: UnboxedOper);
    evaluateFormula(formula: string): UnboxedOper;
    evaluateCell(row: number, col: number): UnboxedOper;
}
