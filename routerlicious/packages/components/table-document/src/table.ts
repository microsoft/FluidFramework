import { UnboxedOper } from "../../client-ui/ext/calc";

export interface ITable {
    readonly numRows: number;
    readonly numCols: number;

    getCellText(row: number, col: number): string;
    setCellText(row: number, col: number, value: string);
    evaluateFormula(formula: string): UnboxedOper;
    evaluateCell(row: number, col: number): UnboxedOper;
}
