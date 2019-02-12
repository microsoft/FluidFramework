// tslint:disable:no-empty-interface
import { Block, BoxState } from "@prague/app-ui";
import { ResultKind } from "../../ext/calc";
import { SharedWorkbook } from "../calc";
import { FlowViewContext } from "./flowViewContext";

const refreshCellsSym = Symbol("SheetletState.refreshCells");

export class SheetletState extends BoxState {
    public [refreshCellsSym]?: () => void;
}

/** Renders a worksheet as a paragraph. */
export class Sheetlet extends Block<SheetletState> {

    protected mounting(self: SheetletState, context: FlowViewContext): HTMLElement {
        const div = document.createElement("div");
        return this.updating(self, context, div);
    }

    protected unmounting(self: SheetletState, context: FlowViewContext, element: HTMLElement): void {
        // NYI: FlowView currently does not unmount components as they are removed.
    }

    protected updating(self: SheetletState, context: FlowViewContext, element: HTMLElement): HTMLElement {
        if (!this.getRefreshCells(self)) {
            // If the workbook is still loading, early exit with a placeholder message.
            const workbook = this.getWorkbook(context);
            if (workbook === undefined) {
                const div = document.createElement("div");
                div.innerText = "[ Loading... ]";
                return div;
            }

            while (element.lastChild) {
                element.removeChild(element.lastChild);
            }

            const { table, refreshCells } = this.createTable(workbook);
            element.appendChild(table);
            this.setRefreshCells(self, refreshCells);
        }

        this.getRefreshCells(self)();
        return element;
    }
    private getWorkbook(context: FlowViewContext): SharedWorkbook {
        return context.services.get("workbook");
    }

    private getRefreshCells(self: SheetletState) { return self[refreshCellsSym]; }
    private setRefreshCells(self: SheetletState, refreshCells: () => void | undefined) {
        self[refreshCellsSym] = refreshCells;
    }

    private createTable(workbook: SharedWorkbook) {
        const table = document.createElement("table");

        // Update <input>s of all cells with evaluated values.
        const refreshCells = () => {
            for (const input of table.getElementsByTagName("input")) {
                const [row, col] = this.getRowColFromId(input.id);
                const result = workbook.evaluateCell(row, col);

                switch (result.kind) {
                    case ResultKind.Success:
                        input.value = workbook.serialiseValue(result.value);
                        break;
                    default:
                        input.value = result.reason.toString();
                        break;
                }
            }
        };

        // Blur the input box on {enter} key.  "updateOnBlur" will update the cell and
        // display the new evaluated value as a side effect.
        const blurOnEnter = (e: KeyboardEvent) => {
            if (e.keyCode === 13) {
                (e.target as HTMLElement).blur();
            }
        };

        // Replace the focused <input>'s value with the corresponding cell's formula for
        // editing.
        const displayFormulaOnFocus = (e: FocusEvent) => {
            const input = (e.target as HTMLInputElement);
            const [row, col] = this.getRowColFromId(input.id);
            input.value = workbook.getCellText(row, col);
        };

        // Update the cell's value on blur and trigger a recalc.
        const updateOnBlur = (e: FocusEvent) => {
            const input = (e.target as HTMLInputElement);
            const newValue = input.value;
            const [row, col] = this.getRowColFromId(input.id);
            workbook.setCellText(row, col, newValue);
            refreshCells();
        };

        // Hack to construct a grid of <input> boxes for the cells in the workbook with text <tds>.
        // Inspired by 'http://jsfiddle.net/ondras/hYfN3/'.
        const firstColAscii = "A".charCodeAt(0);
        for (let rowIndex = -1; rowIndex < workbook.numRows; rowIndex++) {
            const row = table.insertRow(-1);
            for (let colIndex = -1; colIndex < workbook.numCols; colIndex++) {
                const td = row.insertCell(-1);
                if (rowIndex >= 0 && colIndex >= 0) {
                    const input = document.createElement("input");
                    input.id = `${rowIndex},${colIndex}`;
                    input.style.width = "110px";
                    input.addEventListener("blur", updateOnBlur);
                    input.addEventListener("focus", displayFormulaOnFocus);
                    input.addEventListener("keypress", blurOnEnter);
                    td.appendChild(input);
                } else {
                    td.innerText = rowIndex >= 0
                        ? "" + (rowIndex + 1)
                        : String.fromCharCode(firstColAscii + colIndex);
                }
            }
        }

        return { table, refreshCells };
    }

    /** Map the given 'id' string in the from 'row,col' to an array of 2 integers [row, col]. */
    private getRowColFromId(id: string) {
        return id.split(",").map((asString) => parseInt(asString, 10)) as [number, number];
    }
}
