import { TableDocument } from "@chaincode/table-document";
import { Template } from "@prague/flow-util";

const tableTemplate = new Template({
    tag: "table",
    children: [
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

const cellTemplate = new Template({
    tag: "td",
    children: [{
        tag: "input",
        ref: "cell-input"
    }]
});

export class GridView {
    public readonly root: Element;
    //private readonly cols: Element;
    private readonly tbody: Element;

    constructor (private readonly doc: TableDocument, ) {
        this.root = tableTemplate.clone();
        //this.cols = tableTemplate.get(this.root, "cols");
        this.tbody = tableTemplate.get(this.root, "body");

        this.update();
    }

    private get numRows() { return this.doc.numRows; }
    private get numCols() { return this.doc.numCols; }

    public updateCell(cell: HTMLInputElement, r: number, c: number) {
        cell.value = this.doc.evaluateCell(r, c);
    }

    public update() {
        const numRows = this.numRows;
        const numCols = this.numCols;
        console.log(`table-view: update: ${numRows}x${this.numCols}`);
        
        for (let r = 0; r < numRows; r++) {
            const row = rowTemplate.clone();

            for (let c = 0; c < numCols; c++) {
                const cell = cellTemplate.clone();
                const input = cellTemplate.get(cell, "cell-input");
                this.updateCell(input as HTMLInputElement, r, c);
                row.appendChild(cell);
            }

            this.tbody.appendChild(row);
        }
    }
}