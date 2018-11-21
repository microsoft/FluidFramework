import * as map from "@prague/map";
import { UnboxedOper, Workbook } from "../../ext/calc";

/**
 * To avoid a cyclic build dependency, the Workbook base class has no knowledge of Prague.
 * This subclass adds basic storage to an IMapView using "row,col" as the key.
 */
export class CollaborativeWorkbook extends Workbook {
    private readonly cellText: map.IMapView;
    private ready;
    private existing;

    /**
     * Constructs a new Workbook with the prescribed dimensions, optionally initializing it
     * with a jagged 2D array of cell values as pre-parsed strings.
     */
    constructor(cellText: map.IMapView, numRows: number, numCols: number, init?: string[][]) {
        const existingRows = cellText.get("numRows");
        const existingCols = cellText.get("numCols");

        // If the the IMapView already contains Workbook data, preserve it by replacing
        // the initial values passed to the ctor w/the existing data.
        const existing = typeof existingRows !== "undefined";
        if (existing) {
            console.assert(typeof existingCols !== "undefined");
            numRows = existingRows;
            numCols = existingCols;
            init = [];

            for (let row = 0; row < numRows; row++) {
                const rowArray: string[] = [];
                init.push(rowArray);
                for (let col = 0; col < numCols; col++) {
                    rowArray.push(cellText.get(`${row},${col}`) || "");
                }
            }
        } else {
            cellText.set("numRows", numRows);
            cellText.set("numCols", numCols);
        }

        super(numRows, numCols);
        this.existing = existing;
        this.cellText = cellText;
        this.init(init);
        this.ready = true;

        cellText.getMap().on("valueChanged", ({ key }, isLocal) => {
            if (!isLocal) {
                switch (key) {
                    case "numRows":
                    case "numCols":
                        break;
                    default:
                        const [row, col] = key.split(",").map((value) => parseInt(value, 10));
                        this.setCellText(row, col, cellText.get(key), true);
                }
            }
        });
    }

    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        this.cellText.getMap().on(event, listener);
        return this;
    }

    public removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
        this.cellText.getMap().removeListener(event, listener);
        return this;
    }

    protected loadCellText(row: number, col: number): string {
        return this.cellText.get(`${row},${col}`);
    }

    protected storeCellText(row: number, col: number, value: UnboxedOper) {
        if (!this.ready && this.existing) {
            return;
        }

        this.cellText.set(`${row},${col}`, value);
    }
}
