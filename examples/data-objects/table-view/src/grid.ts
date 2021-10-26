/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { KeyCode, Scheduler, Template } from "@fluid-example/flow-util-lib";
import { colIndexToName, TableDocument } from "@fluid-example/table-document";
import { SequenceDeltaEvent } from "@fluidframework/sequence";
import { ISheetlet, createSheetletProducer } from "@tiny-calc/micro";
import { BorderRect } from "./borderstyle";
import * as styles from "./index.css";
import { TableView } from "./tableview";

const tableTemplate = new Template({
    tag: "table",
    props: { className: styles.view, tabIndex: 0, sortable: true },
    children: [
        {
            tag: "caption",
            children: [{ tag: "span", props: { textContent: "Table" } }],
        },
        {
            tag: "thead",
            children: [{
                tag: "tr",
                ref: "cols",
            }],
        },
        {
            tag: "tbody",
            ref: "body",
        },
    ],
});

const rowTemplate = new Template({ tag: "tr" });
const headerTemplate = new Template({ tag: "th" });
const cellTemplate = new Template({ tag: "td" });
const cellInputTemplate = new Template({ tag: "input", props: { className: styles.inputBox } });

// eslint-disable-next-line unicorn/no-unsafe-regex
const numberExp = /^[+-]?\d*\.?\d+(?:[Ee][+-]?\d+)?$/;

export class GridView {
    private get numRows() { return this.doc.numRows; }
    private get numCols() { return this.doc.numCols; }
    public readonly root = tableTemplate.clone();

    private _startRow = 0;
    public get startRow() { return this._startRow; }
    public set startRow(value: number) {
        this._startRow = value;
        this.cancelInput();
        this.refreshCells();
    }

    private readonly cols = tableTemplate.get(this.root, "cols");
    private readonly tbody = tableTemplate.get(this.root, "body");
    private readonly inputBox = cellInputTemplate.clone() as HTMLInputElement;
    private tdText?: Node;
    private readonly selection = new BorderRect([
        [`${styles.selectedTL}`, `${styles.selectedT}`, `${styles.selectedTR}`],
        [`${styles.selectedL}`, `${styles.selected}`, `${styles.selectedR}`],
        [`${styles.selectedBL}`, `${styles.selectedB}`, `${styles.selectedBR}`],
    ]);
    private readonly maxRows = 10;

    private readonly invalidate: (ev: SequenceDeltaEvent) => void;

    private readonly sheetlet: ISheetlet;

    constructor(
        private readonly doc: TableDocument,
        private readonly tableView: TableView,
    ) {
        const scheduler = new Scheduler();

        const refreshGrid = scheduler.coalesce(scheduler.onLayout, this.refreshCells);

        this.invalidate = (ev: SequenceDeltaEvent) => {
            if (!ev.isLocal) {
                // Temporarily, we invalidate the entire matrix when we receive a remote op.
                // This can be improved w/the new SparseMatrix, which makes it easier to decode
                // the range of cells impacted by matrix ops.
                for (let row = 0; row < this.doc.numRows; row++) {
                    for (let col = 0; col < this.doc.numCols; col++) {
                        this.sheetlet.invalidate(row, col);
                    }
                }
            }
            refreshGrid();
        };

        this.root.addEventListener("click", this.onGridClick as EventListener);
        this.tbody.addEventListener("pointerdown", this.cellPointerDown as EventListener);
        this.tbody.addEventListener("pointermove", this.cellPointerMove as EventListener);
        this.inputBox.addEventListener("keydown", this.cellKeyDown);
        this.inputBox.addEventListener("input", this.cellInput);

        this.doc.on("sequenceDelta", this.invalidate);

        const blank = headerTemplate.clone();
        this.cols.appendChild(blank);

        const producer = {
            get rowCount() { return doc.numRows; },
            get colCount() { return doc.numCols; },
            getCell: (row, col) => {
                const raw = doc.getCellValue(row, col);

                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return typeof raw === "object"
                    ? undefined
                    : raw;
            },
            openMatrix() { return this; },
            closeMatrix() { },
            get matrixProducer() { return this; },
        };

        this.sheetlet = createSheetletProducer(producer);

        this.refreshCells();
    }

    private refreshCell(td: HTMLTableCellElement, row: number, col: number) {
        const className = this.selection.getStyle(row, col);
        if (td.className !== className) {
            td.className = className;
        }

        // While the cell is being edited, we use the <td>'s content to size the table to the
        // formula.  Don't synchronize it now.
        if (this.inputBox.parentElement !== td) {
            const value = this.sheetlet.evaluateCell(row, col);

            const text = `\u200B${value ?? ""}`;

            if (td.textContent !== text) {
                td.textContent = text;
            }
        }
    }

    private readonly refreshCells = () => {
        let row = this.startRow;
        const numRows = Math.min(this.numRows, row + this.maxRows);
        {
            let tr = this.tbody.firstElementChild;

            while (tr) {
                const next = tr.nextElementSibling;
                if (row < numRows) {
                    let col = -1;
                    for (const td of tr.children) {
                        if (col < 0) {
                            td.textContent = `${row + 1}`;
                        } else {
                            this.refreshCell(td as HTMLTableCellElement, row, col);
                        }
                        col++;
                    }

                    // Append any missing columns
                    for (; col < this.numCols; col++) {
                        const td = cellTemplate.clone() as HTMLTableCellElement;
                        this.refreshCell(td, row, col);
                        tr.appendChild(td);
                    }
                } else {
                    tr.remove();
                }

                tr = next;
                row++;
            }
        }

        // Append any missing rows
        for (; row < numRows; row++) {
            const tr = rowTemplate.clone();
            const th = headerTemplate.clone();
            th.textContent = `${row + 1}`;
            tr.appendChild(th);

            for (let col = 0; col < this.numCols; col++) {
                const td = cellTemplate.clone() as HTMLTableCellElement;
                this.refreshCell(td, row, col);
                tr.appendChild(td);
            }

            this.tbody.appendChild(tr);
        }

        // Append any missing col headers
        for (let col = this.cols.childElementCount - 1; col < this.numCols; col++) {
            const th = headerTemplate.clone();
            // Skip placeholder <th> above the row number column.
            if (col >= 0) {
                th.textContent = `${colIndexToName(col)}`;
            }
            this.cols.append(th);
        }

        this.refreshFormulaInput();
        this.refreshNumberSummary();
    };

    private readonly onGridClick = (e: MouseEvent) => {
        const maybeTd = this.getCellFromEvent(e);
        if (maybeTd) {
            const [row, col] = this.getRowColFromTd(maybeTd);
            if (row < 0 && col >= 0) {
                this.selection.start = [0, col];
                this.selection.end = [this.numRows - 1, col];
                this.refreshCells();
            } else if (col < 0 && row >= 0) {
                this.selection.start = [row, 0];
                this.selection.end = [row, this.numCols - 1];
                this.refreshCells();
            } else if (col >= 0) {
                this.moveInputToPosition(row, col, e.shiftKey);
            }
        }
    };

    private readonly cellPointerDown = (e: PointerEvent) => {
        const maybeTd = this.getCellFromEvent(e);
        if (maybeTd) {
            this.commitInput();
            const [row, col] = this.getRowColFromTd(maybeTd);
            if (col >= 0) {
                this.selection.start = this.selection.end = [row, col];
                this.refreshCells();
            }
        }
    };

    private readonly cellPointerMove = (e: PointerEvent) => {
        if (!e.buttons) {
            return;
        }

        const maybeTd = this.getCellFromEvent(e);
        if (maybeTd) {
            const [row, col] = this.getRowColFromTd(maybeTd);
            if (col >= 0) {
                this.commitInput();
                this.inputBox.remove();
                this.selection.end = [row, col];
                this.refreshCells();
            }
        }
    };

    private readonly cancelInput = () => {
        const maybeParent = this.inputBox.parentElement as HTMLTableCellElement | null;
        if (maybeParent) {
            this.inputBox.remove();
            const [row, col] = this.getRowColFromTd(maybeParent);
            this.refreshCell(maybeParent, row, col);
        }
    };

    private parseInput(input: string) {
        if (numberExp.exec(input)) {
            const asNumber = Number(input);
            if (!isNaN(asNumber)) {
                return asNumber;
            }
        }

        return input;
    }

    private commitInput() {
        const maybeParent = this.inputBox.parentElement as HTMLTableCellElement | null;
        if (maybeParent) {
            const [row, col] = this.getRowColFromTd(maybeParent);
            const previous = this.doc.getCellValue(row, col);
            const current = this.parseInput(this.inputBox.value);
            if (previous !== current) {
                this.doc.setCellValue(row, col, current);
                this.sheetlet.invalidate(row, col);
            }
            this.refreshCell(maybeParent, row, col);
        }
    }

    private moveInputToPosition(row: number, col: number, extendSelection: boolean) {
        const newParent = this.getTdFromRowCol(row, col);
        if (newParent) {
            this.commitInput();

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.tdText = newParent.firstChild!;
            console.assert(this.tdText.nodeType === Node.TEXT_NODE, "TableData text has wrong node type!");

            const value = this.doc.getCellValue(row, col);
            this.inputBox.value = `${value ?? ""}`;
            newParent.appendChild(this.inputBox);
            this.cellInput();
            this.tdText.textContent = `\u200B${this.inputBox.value}`;
            this.inputBox.focus();

            this.selection.end = [row, col];
            if (!extendSelection) {
                this.selection.start = this.selection.end;
            }

            this.refreshCells();
        }

        // 'getTdFromRowCol(..)' return false if row/col are outside the sheet range.
        return !!newParent;
    }

    private moveInputByOffset(e: KeyboardEvent, rowOffset: number, colOffset: number) {
        let _colOffset = colOffset;
        // Allow the left/right arrow keys to move the caret inside the inputBox until the caret
        // is in the first/last character position.  Then move the inputBox.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if ((e.target === this.inputBox) && this.inputBox.selectionStart! >= 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const x = this.inputBox.selectionStart! + _colOffset;
            if (0 <= x && x <= this.inputBox.value.length) {
                _colOffset = 0;
                if (rowOffset === 0) {
                    return;
                }
            }
        }

        // If we're moving 'inputBox' prevent the arrow keys from moving the caret.  If we don't do this,
        // our 'setSelectionRange()' below will appear off-by-one, and up/down in the top/bottom cells
        // will behave like home/end respectively.
        e.preventDefault();

        const parent = this.inputBox.parentElement as HTMLTableCellElement;
        const [row, col] = this.getRowColFromTd(parent);
        if (this.moveInputToPosition(row + rowOffset, col + colOffset, e.shiftKey)) {
            // If we moved horizontally, move the caret to the beginning/end of the input as appropriate.
            const caretPosition = colOffset > 0
                ? 0
                : this.inputBox.value.length;
            this.inputBox.setSelectionRange(caretPosition, caretPosition);
        }
    }

    private readonly cellInput = () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.tdText!.textContent = `\u200B${this.inputBox.value}`;
        this.refreshFormulaInput();
    };

    private readonly cellKeyDown = (e: KeyboardEvent) => {
        /* eslint-disable default-case */
        switch (e.code) {
            case KeyCode.escape: { this.cancelInput(); break; }
            case KeyCode.arrowUp: { this.moveInputByOffset(e, /* rowOffset: */ -1, /* colOffset */  0); break; }
            case KeyCode.enter: { this.commitInput(); /* fall-through */ }
            case KeyCode.arrowDown: { this.moveInputByOffset(e, /* rowOffset: */  1, /* colOffset */  0); break; }
            case KeyCode.arrowLeft: { this.moveInputByOffset(e, /* rowOffset: */  0, /* colOffset */ -1); break; }
            case KeyCode.tab: { e.preventDefault(); /* fall-through */ }
            case KeyCode.arrowRight: { this.moveInputByOffset(e, /* rowOffset: */  0, /* colOffset */  1); }
        }
        /* eslint-enable default-case */
    };

    public readonly formulaKeypress = (e: KeyboardEvent) => {
        if (e.code === KeyCode.enter) {
            this.updateSelectionFromFormulaInput();
        }
    };

    public readonly formulaFocusOut = () => {
        this.updateSelectionFromFormulaInput();
    };

    private getCellFromEvent(e: Event) {
        const target = e.target as HTMLElement;

        return (target.nodeName === "TD" || target.nodeName === "TH")
            ? target as HTMLTableCellElement
            : undefined;
    }

    // Map the given 'id' string in the from 'row,col' to an array of 2 integers [row, col].
    private getRowColFromTd(td: HTMLTableDataCellElement) {
        const colOffset = td.cellIndex;
        const rowOffset = (td.parentElement as HTMLTableRowElement).rowIndex;

        // The '-1' are to account for Row/Columns headings.  Note that even though the column
        // headings our outside the body, it still impacts their cellIndex.
        return [this.startRow + rowOffset - 1, colOffset - 1];
    }

    private getTdFromRowCol(row: number, col: number) {
        let _row = row;
        _row -= this.startRow;

        // Column heading are outside the <tbody> in <thead>, and therefore we do not need
        // to make adjustments when indexing into children.
        const rows = this.tbody.children;
        if (_row < 0 || _row >= rows.length) {
            return undefined;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const cols = rows.item(_row)!.children;

        // Row headings are inside the <tbody>, therefore we need to adjust our column
        // index by +/-1 to skip them.
        return 0 <= col && col < (cols.length - 1) && cols.item(col + 1);
    }

    private refreshFormulaInput() {
        if (this.selection.start === this.selection.end) {
            const [row, col] = this.selection.start;
            // The formula bar should always show raw values, but when a cell is
            // selected for edit it will be showing the raw value
            const cellValue = this.doc.getCellValue(row, col);
            this.tableView.formulaInput = `${cellValue ?? ""}`;
        } else {
            this.tableView.formulaInput = "<multiple selection>";
        }
    }

    private updateSelectionFromFormulaInput() {
        // Don't handle multiple selection yet
        if (this.selection.start === this.selection.end) {
            const [row, col] = this.selection.start;
            const selectedCell = this.getTdFromRowCol(row, col) as HTMLTableDataCellElement;
            if (selectedCell) {
                const previous = this.doc.getCellValue(row, col);
                const current = this.parseInput(this.tableView.formulaInput);
                if (previous !== current) {
                    selectedCell.textContent = `\u200B${current}`;
                    this.doc.setCellValue(row, col, current);
                    this.sheetlet.invalidate(row, col);
                }
            }
        }
    }

    private refreshNumberSummary() {
        const [rowStart, colStart] = this.selection.start;
        const [rowEnd, colEnd] = this.selection.end;

        const colStartLetter = this.numberToColumnLetter(colStart);
        const colEndLetter = this.numberToColumnLetter(colEnd);

        const averageFormula = `=AVERAGE(${colStartLetter}${rowStart + 1}:${colEndLetter}${rowEnd + 1})`;
        const countFormula = `=COUNT(${colStartLetter}${rowStart + 1}:${colEndLetter}${rowEnd + 1})`;
        const sumFormula = `=SUM(${colStartLetter}${rowStart + 1}:${colEndLetter}${rowEnd + 1})`;

        const avg = this.sheetlet.evaluateFormula(averageFormula);
        const count = this.sheetlet.evaluateFormula(countFormula);
        const sum = this.sheetlet.evaluateFormula(sumFormula);

        if (count as number > 1) {
            this.tableView.selectionSummary = `Average:${avg} Count:${count} Sum:${sum}`;
        } else {
            this.tableView.selectionSummary = "\u200B";
        }
    }

    private numberToColumnLetter(index: number): string {
        let _index = index;
        let colString = String.fromCharCode((_index % 26) + 65);
        _index = _index / 26;

        while (_index >= 1) {
            colString = String.fromCharCode((_index % 26) + 64) + colString;
            _index = _index / 26;
        }

        return colString;
    }
}
