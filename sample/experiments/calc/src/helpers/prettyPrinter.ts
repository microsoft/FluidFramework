import { 
    GridCell,
    SheetGridRange,
    SheetGridCell,
    Precedents
} from "../types";

import { forEachInRange } from "./forEachInRange";

export function printGridCell(gridCell: GridCell): string {
    return convertCol(gridCell.col + 1) + (gridCell.row + 1);
}

export function printSheetGridCell(sheetGridCell: SheetGridCell): string {
    return convertCol(sheetGridCell.range.col + 1) + (sheetGridCell.range.row + 1);
}

export function printSheetGridRange(sheetGridRange: SheetGridRange): string {
    return convertCol(sheetGridRange.range.col + 1) + (sheetGridRange.range.row + 1);
}

export function printRowCol(row: number, col: number): string {
    return convertCol(col + 1) + (row + 1);
}

export function printSheetGridCellArray(sheetGridCellArray: SheetGridCell[]) {
    const stringArray: string[] = [];
    sheetGridCellArray.forEach((sheetGridCell) => {
        stringArray.push(printSheetGridCell(sheetGridCell));
    });
    return stringArray.join(", ");
}

export function printSheetGridRangeArray(sheetGridRangeArray: SheetGridRange[]) {
    const stringArray: string[] = [];
    sheetGridRangeArray.forEach((sheetGridRange) => {
        stringArray.push(printSheetGridRange(sheetGridRange));
    });
    return stringArray.join(", ");
}

export function printPrecedents(precedents: Precedents): string {
    const precedentsStringArray: string[] = [];
    precedents.cells.forEach((range) => {
        forEachInRange(range, (cell) => {
            precedentsStringArray.push(printSheetGridCell(cell));
        });
  });
  return precedentsStringArray.join(", ");
}

function convertCol(col: number): string {
    const a = 65;
    let c: number = col;
    let result = "";
    while (c > 0) {
        const remainder = (c - 1) % 26;
        const name = String.fromCharCode(a + remainder);
        result = name.concat(result);
        c = Math.floor((c - remainder) / 26);
    }
    return result;
}
