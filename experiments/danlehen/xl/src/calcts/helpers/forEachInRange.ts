import { location } from '@ms/excel-online-calc';

import SheetGridRange = location.SheetGridRange;
import SheetGridCell = location.SheetGridCell;
import sheetGridCell = location.sheetGridCell;
import gridCell = location.gridCell;

export function forEachInRange(range: SheetGridRange, f: (cell: SheetGridCell) => void): void {
    const { row, col, rows, cols } = range.range;
    for (let i = 0; i < rows; i += 1) {
      for (let j = 0; j < cols; j += 1) {
        f(sheetGridCell(range.sheet, gridCell(i + row, j + col)));
      }
    }
  }
