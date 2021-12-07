/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Template } from "@fluid-example/flow-util-lib";
import { TableDocument, TableDocumentType } from "@fluid-example/table-document";
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

const innerDocKey = "innerDoc";

export class TableView extends DataObject implements IFluidHTMLView {
    public static getFactory() { return factory; }

    public get IFluidHTMLView() { return this; }

    private readonly templateRoot = template.clone();

    private _formulaInput = template.get(this.templateRoot, "formula") as HTMLInputElement;
    public get formulaInput(): string { return this._formulaInput.value; }
    public set formulaInput(val: string) { this._formulaInput.value = val; }

    private _selectionSummary = template.get(this.templateRoot, "selectionSummary");
    public set selectionSummary(val: string) { this._selectionSummary.textContent = val; }

    // #region IFluidHTMLView
    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        elm.append(this.templateRoot);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const tableDocumentHandle = this.root.get<IFluidHandle<TableDocument>>(innerDocKey)!;

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        tableDocumentHandle.get().then((doc) => {
            const grid = template.get(this.templateRoot, "grid");
            const gridView = new GridView(doc, this);
            grid.appendChild(gridView.root);

            this._formulaInput.addEventListener("keypress", gridView.formulaKeypress);
            this._formulaInput.addEventListener("focusout", gridView.formulaFocusOut);

            const addRowBtn = template.get(this.templateRoot, "addRow");
            addRowBtn.addEventListener("click", () => {
                doc.insertRows(doc.numRows, 1);
            });

            const addRowsBtn = template.get(this.templateRoot, "addRows");
            addRowsBtn.addEventListener("click", () => {
                doc.insertRows(doc.numRows, 10 /* 1048576 */);
            });

            const addColBtn = template.get(this.templateRoot, "addCol");
            addColBtn.addEventListener("click", () => {
                doc.insertCols(doc.numCols, 1);
            });

            const addColsBtn = template.get(this.templateRoot, "addCols");
            addColsBtn.addEventListener("click", () => {
                doc.insertCols(doc.numCols, 10 /* 16384 */);
            });

            const gotoInput = template.get(this.templateRoot, "goto") as HTMLInputElement;
            gotoInput.addEventListener("change", () => {
                gridView.startRow = parseInt(gotoInput.value, 10) - 1;
            });
        });
    }
    // #endregion IFluidHTMLView

    protected async initializingFirstTime() {
        // Set up internal table doc
        const doc = await TableDocument.getFactory().createChildInstance(this.context);
        this.root.set(innerDocKey, doc.handle);
        doc.insertRows(0, 5);
        doc.insertCols(0, 8);
    }
}

const factory = new DataObjectFactory(
    tableViewType,
    TableView,
    [],
    {},
    [
        [TableDocumentType, import("@fluid-example/table-document").then((m) => m.TableDocument.getFactory())],
    ]);
