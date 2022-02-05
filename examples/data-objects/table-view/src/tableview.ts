/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedMatrix } from "@fluidframework/matrix";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
import { GridView } from "./grid";
import * as styles from "./index.css";

export const tableViewType = "@fluid-example/table-view";

const matrixKey = "matrixKey";

export class TableView extends DataObject implements IFluidHTMLView {
    public static getFactory() { return factory; }

    public get IFluidHTMLView() { return this; }

    private templateRoot: HTMLDivElement | undefined;

    private readonly _formulaInput = document.createElement("input");
    public get formulaInput(): string { return this._formulaInput.value; }
    public set formulaInput(val: string) { this._formulaInput.value = val; }

    private readonly _selectionSummary = document.createElement("span");
    // eslint-disable-next-line accessor-pairs
    public set selectionSummary(val: string) { this._selectionSummary.textContent = val; }

    private _tableMatrix: SharedMatrix | undefined;
    public get tableMatrix() {
        if (this._tableMatrix === undefined) {
            throw new Error("Table matrix not fully initialized");
        }
        return this._tableMatrix;
    }

    private generateView() {
        const root = document.createElement("div");

        const addRowBtn = document.createElement("button");
        addRowBtn.textContent = "R+";
        addRowBtn.addEventListener("click", () => {
            this.tableMatrix.insertRows(this.tableMatrix.rowCount, 1);
        });

        const addColBtn = document.createElement("button");
        addColBtn.textContent = "C+";
        addColBtn.addEventListener("click", () => {
            this.tableMatrix.insertCols(this.tableMatrix.colCount, 1);
        });

        const addRowsBtn = document.createElement("button");
        addRowsBtn.textContent = "R++";
        addRowsBtn.addEventListener("click", () => {
            this.tableMatrix.insertRows(this.tableMatrix.rowCount, 10 /* 1048576 */);
        });

        const addColsBtn = document.createElement("button");
        addColsBtn.textContent = "C++";
        addColsBtn.addEventListener("click", () => {
            this.tableMatrix.insertCols(this.tableMatrix.colCount, 10 /* 16384 */);
        });

        const gridGroup = document.createElement("div");

        this._formulaInput.placeholder = "Formula input";

        const grid = document.createElement("div");
        grid.classList.add(styles.grid);

        const gridView = new GridView(this.tableMatrix, this);
        grid.append(gridView.root);

        this._formulaInput.addEventListener("keypress", gridView.formulaKeypress);
        this._formulaInput.addEventListener("focusout", gridView.formulaFocusOut);

        gridGroup.append(this._formulaInput, grid, this._selectionSummary);

        const gotoInput = document.createElement("input");
        gotoInput.addEventListener("change", () => {
            gridView.startRow = parseInt(gotoInput.value, 10) - 1;
        });

        root.append(addRowBtn, addColBtn, addRowsBtn, addColsBtn, gridGroup, gotoInput);

        return root;
    }

    // #region IFluidHTMLView
    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        if (this.templateRoot === undefined) {
            this.templateRoot = this.generateView();
        }
        elm.append(this.templateRoot);
    }
    // #endregion IFluidHTMLView

    protected async initializingFirstTime() {
        const matrix = SharedMatrix.create(this.runtime);
        this.root.set(matrixKey, matrix.handle);
        matrix.insertRows(0, 5);
        matrix.insertCols(0, 8);
    }

    protected async hasInitialized(): Promise<void> {
        this._tableMatrix = await this.root.get<IFluidHandle<SharedMatrix>>(matrixKey)?.get();
    }
}

const factory = new DataObjectFactory(
    tableViewType,
    TableView,
    [
        SharedMatrix.getFactory(),
    ],
    {});
