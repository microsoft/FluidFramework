import { TableDocument } from "@chaincode/table-document";
import { KeyCode, Template } from "@prague/flow-util";
import * as styles from "./index.css";
import { BorderRect } from "./borderstyle";

const tableTemplate = new Template({
    tag: "table",
    props: { className: styles.view, tabIndex: 0, sortable: true },
    children: [
        {
            tag: "caption",
            children: [{ tag: "span", props: { textContent: "Table" } }]
        },
        {
            tag: "thead",
            children: [{
                tag: "tr",
                ref: "cols"
            }],
        },
        {
            tag: "tbody",
            ref: "body"
        }
    ]
});

const rowTemplate = new Template({ tag: "tr" });
const headerTemplate = new Template({ tag: "th" });
const cellTemplate = new Template({ tag: "td" });
const cellInputTemplate = new Template({ tag: "input", props: { className: styles.inputBox } });

export class GridView {
    public readonly root = tableTemplate.clone();
    private readonly cols = tableTemplate.get(this.root, "cols");
    private readonly tbody = tableTemplate.get(this.root, "body");
    private readonly inputBox = cellInputTemplate.clone() as HTMLInputElement;
    private tdText?: Node = undefined;
    private selection = new BorderRect([
        [ `${styles.selectedTL}`, `${styles.selectedT}`, `${styles.selectedTR}` ],
        [ `${styles.selectedL}`,  `${styles.selected}`,  `${styles.selectedR}`  ],
        [ `${styles.selectedBL}`, `${styles.selectedB}`, `${styles.selectedBR}` ]
    ]);

    constructor (private readonly doc: TableDocument, ) {
        this.root.addEventListener("click", this.onClick as EventListener);        
        this.tbody.addEventListener("pointerdown", this.cellDown as EventListener);
        this.tbody.addEventListener("pointermove", this.cellMove as EventListener);
        this.inputBox.addEventListener("keydown", this.cellKeyDown);
        this.inputBox.addEventListener("input", this.cellInput);

        this.doc.on("op", this.invalidate);
        this.update();
    }

    private get numRows() { return this.doc.numRows; }
    private get numCols() { return this.doc.numCols; }

    private readonly invalidate = () => {
        console.log(`table-view: invalidated`);
        this.refreshCells();
    }

    private refreshCells() {
        let r = 0;
        for (const tr of this.tbody.children) {
            let c = -1;
            for (const td of tr.children) {
                if (c >= 0) {
                    const className = this.selection.getStyle(r, c);
                    if (td.className !== className) {
                        td.className = className;
                    }

                    const text = `\u200B${this.doc.evaluateCell(r, c)}`;
                    if (td.textContent !== text) {
                        td.textContent = text;
                    }
                }
                c++;
            }
            r++;
        }
    }

    private setCell(row: number, col: number, value: string) {
        this.doc.setCellText(row, col, value);
        console.log(`[${row}, ${col}] := ${value}`);
    }

    private readonly onClick = (e: MouseEvent) => {
        const maybeTd = this.getCellFromEvent(e);
        if (maybeTd) {
            const [row, col] = this.getRowColFromTd(maybeTd);
            if (row < 0 && col >= 0) {
                this.selection.start = [0, col];
                this.selection.end   = [this.numRows - 1, col];
                this.refreshCells();
            } else if ( col < 0 && row >= 0 ) {
                this.selection.start = [row, 0];
                this.selection.end   = [row, this.numCols - 1];
                this.refreshCells();
            } else if (col >= 0) {
                this.moveInputToPosition(row, col);
            }
        }
    };

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
                this.selection.end = [row, col];
                this.refreshCells();
            }
        }    
    }

    private commitInput() {
        const maybeParent = this.inputBox.parentElement;
        if (maybeParent) {
            const [row, col] = this.getRowColFromTd(maybeParent as HTMLTableCellElement);
            this.setCell(row, col, this.inputBox.value);
        }
    }

    private moveInputToPosition(row: number, col: number) {
        const newParent = this.getTdFromRowCol(row, col);
        if (newParent) {
            this.commitInput();

            this.tdText = newParent.firstChild!;
            console.assert(this.tdText.nodeType === Node.TEXT_NODE);

            this.inputBox.value = this.doc.getCellText(row, col);
            newParent.appendChild(this.inputBox);
            this.cellInput();
            this.tdText.textContent = this.inputBox.value;
            this.inputBox.focus();
        }
        return newParent !== undefined;
    }

    private moveInputByOffset(rowOffset: number, colOffset: number) {
        const parent = this.inputBox.parentElement as HTMLTableCellElement;
        const [row, col] = this.getRowColFromTd(parent);
        this.moveInputToPosition(row + rowOffset, col + colOffset);
    }

    private readonly cellInput = () => { 
        this.tdText!.textContent = `\u200B${this.inputBox.value}`;
    }

    private readonly cellKeyDown = (e: KeyboardEvent) => {
        switch (e.keyCode) {
            case KeyCode.Escape:     { this.inputBox.remove(); this.selection.reset(); this.refreshCells(); break; }
            case KeyCode.UpArrow:    { this.moveInputByOffset(/* rowOffset: */ -1, /* colOffset */  0); break; }
            case KeyCode.Enter:
            case KeyCode.DownArrow:  { this.moveInputByOffset(/* rowOffset: */  1, /* colOffset */  0); break; }
            case KeyCode.LeftArrow:  { this.moveInputByOffset(/* rowOffset: */  0, /* colOffset */ -1); break; }
            case KeyCode.Tab:
            case KeyCode.RightArrow: { this.moveInputByOffset(/* rowOffset: */  0, /* colOffset */  1); break; }
        }
    };

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

    public update() {
        const numRows = this.numRows;
        const numCols = this.numCols;
        console.log(`table-view: update: ${numRows}x${this.numCols}`);

        const blank = headerTemplate.clone();
        this.cols.appendChild(blank);

        for (let c = 0; c < numCols; c++) {
            const th = headerTemplate.clone();
            th.textContent = String.fromCharCode(65 + c);
            this.cols.appendChild(th);
        }

        for (let r = 0; r < numRows; r++) {
            const row = rowTemplate.clone();

            const th = headerTemplate.clone();
            th.textContent = `${r + 1}`;
            row.appendChild(th);
            
            for (let c = 0; c < numCols; c++) {
                row.appendChild(cellTemplate.clone());
            }

            this.tbody.appendChild(row);
        }

        this.refreshCells();
    }
}