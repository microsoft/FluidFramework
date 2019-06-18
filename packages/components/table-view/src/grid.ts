/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableDocument } from "@chaincode/table-document";
import { KeyCode, Scheduler, Template } from "@prague/flow-util";
import { BorderRect } from "./borderstyle";
import * as styles from "./index.css";

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

const numberExp = /^[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?$/;

export class GridView {
    public readonly root = tableTemplate.clone();
    private readonly cols = tableTemplate.get(this.root, "cols");
    private readonly tbody = tableTemplate.get(this.root, "body");
    private readonly inputBox = cellInputTemplate.clone() as HTMLInputElement;
    private tdText?: Node;
    private readonly selection = new BorderRect([
        [ `${styles.selectedTL}`, `${styles.selectedT}`, `${styles.selectedTR}` ],
        [ `${styles.selectedL}`,  `${styles.selected}`,  `${styles.selectedR}`  ],
        [ `${styles.selectedBL}`, `${styles.selectedB}`, `${styles.selectedBR}` ],
    ]);

    private readonly invalidate: () => void;

    constructor(private readonly doc: TableDocument) {
        const scheduler = new Scheduler();
        this.invalidate = scheduler.coalesce(scheduler.onLayout, this.refreshCells);

        this.root.addEventListener("click", this.onClick as EventListener);
        this.tbody.addEventListener("pointerdown", this.cellDown as EventListener);
        this.tbody.addEventListener("pointermove", this.cellMove as EventListener);
        this.inputBox.addEventListener("keydown", this.cellKeyDown);
        this.inputBox.addEventListener("input", this.cellInput);

        this.doc.on("op", this.invalidate);

        const blank = headerTemplate.clone();
        this.cols.appendChild(blank);

        this.refreshCells();
    }

    private get numRows() { return this.doc.numRows; }
    private get numCols() { return this.doc.numCols; }

    private refreshCell(td: HTMLTableCellElement, row: number, col: number) {
        const className = this.selection.getStyle(row, col);
        if (td.className !== className) {
            td.className = className;
        }

        // While the cell is being edited, we use the <td>'s content to size the table to the
        // formula.  Don't synchronize it now.
        if (this.inputBox.parentElement !== td) {
            const value = this.doc.evaluateCell(row, col);

            const text = `\u200B${
                value === undefined
                    ? ""
                    : value
            }`;

            if (td.textContent !== text) {
                td.textContent = text;
            }
        }
    }

    private readonly refreshCells = () => {
        let row = 0;
        for (const tr of this.tbody.children) {
            let col = -1;
            for (const td of tr.children) {
                // While editing a cell, we use the 'td' to size the table to the current formula.
                // Do not synchronize it at this time.
                if (col >= 0 && this.inputBox.parentElement !== td) {
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
            row++;
        }

        // Append any missing rows
        for (; row < this.numRows; row++) {
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
    }

    private readonly onClick = (e: MouseEvent) => {
        const maybeTd = this.getCellFromEvent(e);
        if (maybeTd) {
            const [row, col] = this.getRowColFromTd(maybeTd);
            if (row < 0 && col >= 0) {
                this.selection.start = [0, col];
                this.selection.end   = [this.numRows - 1, col];
                this.refreshCells();
            } else if (col < 0 && row >= 0) {
                this.selection.start = [row, 0];
                this.selection.end   = [row, this.numCols - 1];
                this.refreshCells();
            } else if (col >= 0) {
                this.moveInputToPosition(row, col, e.shiftKey);
            }
        }
    }

    private readonly cellDown = (e: PointerEvent) => {
        const maybeTd = this.getCellFromEvent(e);
        if (maybeTd) {
            this.commitInput();
            const [row, col] = this.getRowColFromTd(maybeTd);
            if (col >= 0) {
                this.selection.start = this.selection.end = [row, col];
                this.refreshCells();
            }
        }
    }

    private readonly cellMove = (e: PointerEvent) => {
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
    }

    private readonly cancelInput = () => {
        const maybeParent = this.inputBox.parentElement as HTMLTableCellElement;
        if (maybeParent) {
            this.inputBox.remove();
            const [row, col] = this.getRowColFromTd(maybeParent);
            this.refreshCell(maybeParent, row, col);
        }
    }

    private parseInput(input: string) {
        if (input.match(numberExp)) {
            const asNumber = Number(input);
            if (!isNaN(asNumber)) {
                return asNumber;
            }
        }

        return input;
    }

    private commitInput() {
        const maybeParent = this.inputBox.parentElement as HTMLTableCellElement;
        if (maybeParent) {
            const [row, col] = this.getRowColFromTd(maybeParent);
            const previous = this.doc.getCellValue(row, col);
            const current = this.parseInput(this.inputBox.value);
            if (previous !== current) {
                this.doc.setCellValue(row, col, current);
            }
            this.refreshCell(maybeParent, row, col);
        }
    }

    private moveInputToPosition(row: number, col: number, extendSelection: boolean) {
        const newParent = this.getTdFromRowCol(row, col);
        if (newParent) {
            this.commitInput();

            this.tdText = newParent.firstChild!;
            console.assert(this.tdText.nodeType === Node.TEXT_NODE);

            const value = this.doc.getCellValue(row, col);
            this.inputBox.value = value === undefined
                ? ""
                : `${value}`;
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
        // Allow the left/right arrow keys to move the caret inside the inputBox until the caret
        // is in the first/last character position.  Then move the inputBox.
        if ((e.target === this.inputBox) && this.inputBox.selectionStart! >= 0) {
            const x = this.inputBox.selectionStart! + colOffset;
            if (0 <= x && x <= this.inputBox.value.length) {
                colOffset = 0;
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
        this.tdText!.textContent = `\u200B${this.inputBox.value}`;
    }

    private readonly cellKeyDown = (e: KeyboardEvent) => {
        // tslint:disable-next-line: switch-default
        switch (e.code) {
            case KeyCode.escape:     { this.cancelInput(); break; }
            case KeyCode.arrowUp:    { this.moveInputByOffset(e, /* rowOffset: */ -1, /* colOffset */  0); break; }
            case KeyCode.enter:      { this.commitInput(); /* fall-through */ }
            case KeyCode.arrowDown:  { this.moveInputByOffset(e, /* rowOffset: */  1, /* colOffset */  0); break; }
            case KeyCode.arrowLeft:  { this.moveInputByOffset(e, /* rowOffset: */  0, /* colOffset */ -1); break; }
            case KeyCode.tab:        { e.preventDefault(); /* fall-through */ }
            case KeyCode.arrowRight: { this.moveInputByOffset(e, /* rowOffset: */  0, /* colOffset */  1); }
        }
    }

    private getCellFromEvent(e: Event) {
        const target = e.target as HTMLElement;

        return (target.nodeName === "TD" || target.nodeName === "TH")
            ? target as HTMLTableCellElement
            : undefined;
    }

    // Map the given 'id' string in the from 'row,col' to an array of 2 integers [row, col].
    private getRowColFromTd(td: HTMLTableDataCellElement) {
        const col = td.cellIndex;
        const row = (td.parentElement as HTMLTableRowElement).rowIndex;

        // The '-1' are to account for Row/Columns headings.  Note that even though the column
        // headings our outside the body, it still impacts their cellIndex.
        return [row - 1, col - 1];
    }

    private getTdFromRowCol(row: number, col: number) {
        // Column heading are outside the <tbody> in <thead>, and therefore we do not need
        // to make adjustments when indexing into children.
        const rows = this.tbody.children;
        if (row < 0 || row >= rows.length) {
            return undefined;
        }

        const cols = rows.item(row)!.children;

        // Row headings are inside the <tbody>, therefore we need to adjust our column
        // index by +/-1 to skip them.
        return 0 <= col && col < (cols.length - 1) && cols.item(col + 1);
    }
}
