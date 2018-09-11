import * as prague from "./prague";

import {
    ResultKind,
} from "../../calc/src";

import { CollaborativeWorkbook } from "./collaborativeworkbook"

function openWorkbook(docName: string) {
    prague.open(docName).then(document => {
        return prague.upsertMap(document, "workbook");
    }).then(mapAndView => {
        const { view } = mapAndView;
        const workbook = new CollaborativeWorkbook(view, 7, 7, [
            ['Player', 'Euchre', 'Bridge', 'Poker', 'Cribbage', 'Go Fish', 'Total Wins'],
            ['Daniel', "0", "0", "0", "0", "5", '=SUM(B2:F2)'],
            ['Kurt',   "2", "3", "0", "3", "0", '=SUM(B3:F3)'],
            ['Sam',    "3", "4", "0", "2", "0", '=SUM(B4:F4)'],
            ['Steve',  "1", "1", "5", "1", "0", '=SUM(B5:F5)'],
            ['Tanvir', "3", "3", "0", "4", "0", '=SUM(B6:F6)'],
            ['Total Played', "=SUM(B2:B6)", "=SUM(C2:C6)", "=SUM(D2:D6)", "=SUM(E2:E6)", "=SUM(F2:F6)", "=SUM(G2:F6)"]
        ]); 
        
        document.body.innerHTML = `
            <h3>Editing: ${docName}</h3>
            <table></table>
        `;
        
         // Parses the given 'id' string in the form "row,col" to [row, col].  Used to map
         // <input> boxes back to the workbook cells they are presenting.
        const getRowColFromId = (id: string): [number, number] => {
            return id.split(",").map(asString => parseInt(asString)) as [number, number];        
        }
        
        // Hack to construct a grid of <input> boxes for the cells in the workbook with text <tds>.
        // Inspired by 'http://jsfiddle.net/ondras/hYfN3/'.
        const firstColAscii = "A".charCodeAt(0);
        const table = document.querySelector("table");
        for (let rowIndex = -1; rowIndex < workbook.numRows; rowIndex++) {
            const row = table.insertRow(-1);
            for (let colIndex = -1; colIndex < workbook.numCols; colIndex++) {
                row.insertCell(-1).innerHTML = rowIndex >= 0 && colIndex >= 0
                    ? `<input id='${rowIndex},${colIndex}'/>`
                    : rowIndex >= 0
                        ? "" + (rowIndex + 1)
                        : String.fromCharCode(firstColAscii + colIndex);
            }
        }
        
        // Collect the input boxes.
        const inputs = Array.prototype.slice.call(document.querySelectorAll("input"));
        
        // Update <input>s of all cells with evaluated values.
        const refreshCells = () => {
            inputs.forEach(elm => {
                const [row, col] = elm.id.split(",").map(asString => parseInt(asString));        
                const result = workbook.evaluateCell(row, col);

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
        
        // Blur the input box on enter.  "updateOnBlur" will update the cell and display
        // the new value as a side effect.
        const blurOnEnter = (e: KeyboardEvent) => {
            if (e.keyCode === 13) {
                (e.target as HTMLElement).blur();
            }
        };
        
        // Replace the focused <input>'s value with the corresponding cell's formula for
        // editing.
        const displayFormulaOnFocus = (e: FocusEvent) => {
            const input = (e.target as HTMLInputElement);
            const [row, col] = getRowColFromId(input.id);
            input.value = workbook.getCellText(row, col);
        };
        
        // Update the cell's value on blur and trigger a recalc.
        const updateOnBlur = (e: FocusEvent) => {
            const input = (e.target as HTMLInputElement);
            const newValue = input.value;
            const [row, col] = getRowColFromId(input.id);
            workbook.setCellText(row, col, newValue);
            refreshCells();
        }
        
        for (const input of inputs) {
            input.addEventListener('blur', updateOnBlur);
            input.addEventListener('focus', displayFormulaOnFocus);
            input.addEventListener('keypress', blurOnEnter);
        }
        
        // Force a recalc to update all <input>s w/their initial state.
        refreshCells();
    });
}

const docName = new URLSearchParams(window.location.search).toString().split("=")[0];
if (!docName) {
    document.body.innerHTML = `
        <input id="openBox"/><button id="openButton"/>
    `;

    document.getElementById('openButton').addEventListener("click", () => {
        const docName = (document.getElementById("openBox") as HTMLInputElement).value;
        openWorkbook(docName);
    });
} else {
    openWorkbook(docName);
}
