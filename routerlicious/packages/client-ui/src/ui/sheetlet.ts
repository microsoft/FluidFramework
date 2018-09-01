// tslint:disable:no-empty-interface
import { Box } from ".";
import { ResultKind } from "../../ext/calc";
import { CollaborativeWorkbook } from "../calc";

export interface ISheetletState {}

/** Renders a worksheet as a paragraph. */
export class Sheetlet extends Box<ISheetletState> {

    public get isParagraph() { return true; }
    private inputs: HTMLInputElement[] = [];
    private workbook: CollaborativeWorkbook;

    public measure(self: ISheetletState, services: Map<string, any>, font: string) {
        throw new Error("measure() currently unused in paragraph.");
        return NaN;
    }

    public render(self: ISheetletState, services: Map<string, any>) {
        // If the workbook is still loading, early exit with a placeholder message.
        this.workbook = services.get("workbook");
        if (typeof this.workbook === "undefined") {
            const div = document.createElement("div");
            div.innerText = "[ Loading... ]";
            return div;
        }

        // Hack to construct a grid of <input> boxes for the cells in the workbook with text <tds>.
        // Inspired by 'http://jsfiddle.net/ondras/hYfN3/'.
        const table = document.createElement("table");
        const firstColAscii = "A".charCodeAt(0);

        for (let rowIndex = -1; rowIndex < this.workbook.numRows; rowIndex++) {
            const row = table.insertRow(-1);
            for (let colIndex = -1; colIndex < this.workbook.numCols; colIndex++) {
                const td = row.insertCell(-1);
                if (rowIndex >= 0 && colIndex >= 0) {
                    const input = document.createElement("input");
                    input.id = `${rowIndex},${colIndex}`;
                    input.addEventListener("blur", this.updateOnBlur);
                    input.addEventListener("focus", this.displayFormulaOnFocus);
                    input.addEventListener("keypress", this.blurOnEnter);
                    td.appendChild(input);
                    this.inputs.push(input);
                } else {
                    td.innerText = rowIndex >= 0
                        ? "" + (rowIndex + 1)
                        : String.fromCharCode(firstColAscii + colIndex);
                }
            }
        }

        this.refreshCells();

        return table;
    }

    /** Map the given 'id' string in the from 'row,col' to an array of 2 integers [row, col]. */
    private getRowColFromId(id: string) {
        return id.split(",").map((asString) => parseInt(asString, 10)) as [number, number];
    }

    /** Update <input>s of all cells with evaluated values. */
    private refreshCells() {
        this.inputs.forEach((elm) => {
            const [row, col] = this.getRowColFromId(elm.id);
            const result = this.workbook.evaluateCell(row, col);

            switch (result.kind) {
                case ResultKind.Success:
                    elm.value = result.value.toString();
                    break;
                default:
                    elm.value = result.reason.toString();
                    break;
            }
        });
    }

    /**
     * Blur the input box on {enter} key.  "updateOnBlur" will update the cell and
     * display the new evaluated value as a side effect.
     */
    private blurOnEnter = (e: KeyboardEvent) => {
        if (e.keyCode === 13) {
            (e.target as HTMLElement).blur();
        }
    }

    /**
     * Replace the focused <input>'s value with the corresponding cell's formula for
     * editing.
     */
    private displayFormulaOnFocus = (e: FocusEvent) => {
        const input = (e.target as HTMLInputElement);
        const [row, col] = this.getRowColFromId(input.id);
        input.value = this.workbook.getCellText(row, col);
    }

    /** Update the cell's value on blur and trigger a recalc. */
    private updateOnBlur = (e: FocusEvent) => {
        const input = (e.target as HTMLInputElement);
        const newValue = input.value;
        const [row, col] = this.getRowColFromId(input.id);
        this.workbook.setCellText(row, col, newValue);
        this.refreshCells();
    }
}
