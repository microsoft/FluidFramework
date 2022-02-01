/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Template } from "@fluid-example/flow-util-lib";
import { SharedMatrix } from "@fluidframework/matrix";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
import { GridView } from "./grid";
import * as styles from "./index.css";

export const tableViewType = "@fluid-example/table-view";

const template = new Template({
    tag: "div",
    children: [
        { tag: "button", ref: "addRow", props: { textContent: "R+" } },
        { tag: "button", ref: "addCol", props: { textContent: "C+" } },
        { tag: "button", ref: "addRows", props: { textContent: "R++" } },
        { tag: "button", ref: "addCols", props: { textContent: "C++" } },
        {
            tag: "div",
            children: [
                { tag: "input", ref: "formula", props: { placeholder: "Formula input" } },
                { tag: "div", ref: "grid", props: { className: styles.grid } },
                { tag: "span", ref: "selectionSummary" },
            ],
        },
        { tag: "input", ref: "goto" },
    ],
});

const matrixKey = "matrixKey";

export class TableView extends DataObject implements IFluidHTMLView {
    public static getFactory() { return factory; }

    public get IFluidHTMLView() { return this; }

    private readonly templateRoot = template.clone();

    private _formulaInput = template.get(this.templateRoot, "formula") as HTMLInputElement;
    public get formulaInput(): string { return this._formulaInput.value; }
    public set formulaInput(val: string) { this._formulaInput.value = val; }

    private _selectionSummary = template.get(this.templateRoot, "selectionSummary");
    // eslint-disable-next-line accessor-pairs
    public set selectionSummary(val: string) { this._selectionSummary.textContent = val; }

    private _tableMatrix: SharedMatrix | undefined;
    public get tableMatrix() {
        if (this._tableMatrix === undefined) {
            throw new Error("Table matrix not fully initialized");
        }
        return this._tableMatrix;
    }

    // #region IFluidHTMLView
    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        elm.append(this.templateRoot);

        const grid = template.get(this.templateRoot, "grid");
        const gridView = new GridView(this.tableMatrix, this);
        grid.appendChild(gridView.root);

        this._formulaInput.addEventListener("keypress", gridView.formulaKeypress);
        this._formulaInput.addEventListener("focusout", gridView.formulaFocusOut);

        const addRowBtn = template.get(this.templateRoot, "addRow");
        addRowBtn.addEventListener("click", () => {
            this.tableMatrix.insertRows(this.tableMatrix.rowCount, 1);
        });

        const addRowsBtn = template.get(this.templateRoot, "addRows");
        addRowsBtn.addEventListener("click", () => {
            this.tableMatrix.insertRows(this.tableMatrix.rowCount, 10 /* 1048576 */);
        });

        const addColBtn = template.get(this.templateRoot, "addCol");
        addColBtn.addEventListener("click", () => {
            this.tableMatrix.insertCols(this.tableMatrix.colCount, 1);
        });

        const addColsBtn = template.get(this.templateRoot, "addCols");
        addColsBtn.addEventListener("click", () => {
            this.tableMatrix.insertCols(this.tableMatrix.colCount, 10 /* 16384 */);
        });

        const gotoInput = template.get(this.templateRoot, "goto") as HTMLInputElement;
        gotoInput.addEventListener("change", () => {
            gridView.startRow = parseInt(gotoInput.value, 10) - 1;
        });
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
