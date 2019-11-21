import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";
import {
    table as tableLogger
} from 'table';
import * as React from "react";
import * as ReactDOM from "react-dom";
import { TableDocType } from ".";
import { TableDocument } from "@fluid-example/table-document";

/**
 * Dice roller example using view interfaces and stock component classes.
 */
export class Table extends PrimedComponent implements IComponentHTMLVisual {
    public get IComponentHTMLVisual() { return this; }

    public tableDoc: TableDocument;

    protected async componentInitializingFirstTime() {
        const tabledoc = await this.createAndAttachComponent<TableDocument>("tableDoc", TableDocType);
        tabledoc.insertCols(0, 1);
        tabledoc.insertRows(0, 1);
    }

    protected async componentHasInitialized() {

    }

    public async getTableDoc() {
        return this.getComponent<TableDocument>("tableDoc");
    }

    public async render(div: HTMLElement) {
        this.tableDoc = await this.getTableDoc();

        this.logMeta();

        const rerender = () => {
            ReactDOM.render(
                <div>
                    <button onClick={() => {
                        rerender();
                        this.logTable();
                    }}>
                        ReRender
                        </button>
                    <div style={{ border: "dotted" }}>
                        <p>
                            Input row, col, and val
                            Or click on a cell
                            </p>
                        <a>Col:</a><input type="text" id="col"></input>
                        <br></br>
                        <a>Row:</a><input type="text" id="row"></input>
                        <br></br>
                        <a>Val:</a><input type="text" id="value"></input>
                        <br></br>
                        <button onClick={() => {
                            const row = (document.getElementById("row") as HTMLInputElement).value;
                            const col = (document.getElementById("col") as HTMLInputElement).value;
                            const val = (document.getElementById("value") as HTMLInputElement).value;
                            this.tableDoc.setCellValue(parseInt(row), parseInt(col), val);
                        }}>Submit</button>
                        <button onClick={() => {
                            this.tableDoc.insertRows(this.tableDoc.numRows, 1);
                            this.logMeta();
                        }}>
                            Add Row
                            </button>
                        <button onClick={() => {
                            this.tableDoc.insertCols(this.tableDoc.numCols, 1);
                            this.logMeta();
                        }}>
                            Add Col
                            </button>
                    </div>
                    <div>
                        {this.createTable()}
                    </div>
                </div>,
                div,
            );
        };

        rerender();
        this.root.on("valueChanged", () => {
            rerender();
        });

        this.tableDoc.on("op", () => {
            rerender();
        });
    }

    private logMeta() {
        console.log(`C: ${this.tableDoc.numRows}, R: ${this.tableDoc.numCols}`);
        console.log(`----`);
    }

    private logTable() {
        const data = this.makeTableArray();
        const output = tableLogger(data);

        console.log(output);
        return output;
    }

    public makeTableArray(): any[][] {
        const columns = new Array<any[]>();
        for (let row = 0; row < this.tableDoc.numRows; row++) {
            const rowValues: any[] = new Array();
            for (let col = 0; col < this.tableDoc.numCols; col++) {
                rowValues.push(this.tableDoc.getCellValue(row, col));
            }
            columns.push(rowValues);
        }
        return columns;
    }

    public createTable(): JSX.Element {
        return (
            <div>
                <h1> Title </h1>
                <table style={{ width: "100%" }}>
                    <tbody>
                        {this.renderTableData()}
                    </tbody>
                </table>
            </div>
        )
    }

    private renderTableData() {
        const t = this.makeTableArray();
        return t.map((value, row) => {
            return (
                <tr>
                    {value.map((value, col) => {
                        return (
                            <td id={`${col}-${row}`}
                                onClick={(elem) => {
                                    const [col, row,] = elem.currentTarget.id.split("-");
                                    console.log(`${col}, ${row}`);
                                    (document.getElementById("row") as HTMLInputElement).value = row;
                                    (document.getElementById("col") as HTMLInputElement).value = col;
                                }}>
                                {value === undefined ? `(${col}, ${row})` : value}
                            </td>
                        )
                    })}
                </tr>
            )
        });
    }
}

/**
 * The PrimedComponentFactory declares the component and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const ReacttableInstantiationFactory = new PrimedComponentFactory(
    Table,
    [],
);
