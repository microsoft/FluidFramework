/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Template } from "@fluid-example/flow-util-lib";
import { TableDocument, TableDocumentType } from "@fluid-example/table-document";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLOptions,
    IComponentHTMLView,
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { GridView } from "./grid";
import * as styles from "./index.css";
import { tableViewType } from "./runtime";

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

export class TableView extends PrimedComponent implements IComponentHTMLView {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    public static getFactory() { return factory; }

    public get IComponentHTMLView() { return this; }

    private readonly templateRoot = template.clone();

    private _formulaInput = template.get(this.templateRoot, "formula") as HTMLInputElement;
    public get formulaInput(): string { return this._formulaInput.value; }
    public set formulaInput(val: string) { this._formulaInput.value = val; }

    private _selectionSummary = template.get(this.templateRoot, "selectionSummary");
    public set selectionSummary(val: string) { this._selectionSummary.textContent = val; }

    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    // #region IComponentHTMLView
    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        elm.append(this.templateRoot);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.root.get<IComponentHandle<TableDocument>>(this.docId).get().then((doc) => {
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
                doc.insertCols(doc.numCols, 10 /*16384*/);
            });

            const gotoInput = template.get(this.templateRoot, "goto") as HTMLInputElement;
            gotoInput.addEventListener("change", () => {
                gridView.startRow = parseInt(gotoInput.value, 10) - 1;
            });
        });
    }
    // #endregion IComponentHTMLView

    protected async componentInitializingFirstTime() {
        const doc = await this.createAndAttachComponent_NEW<TableDocument>(TableDocumentType);
        this.root.set(this.docId, doc.handle);
        doc.insertRows(0, 5);
        doc.insertCols(0, 8);
    }

    private get docId() { return `${this.id}-doc`; }
}

export class TableViewFactory extends PrimedComponentFactory {
    public static readonly type = tableViewType;
    public readonly type = TableViewFactory.type;

    constructor() {
        super(
            TableView,
            [],
            [
                [TableDocumentType, import("@fluid-example/table-document").then((m) => m.TableDocument.getFactory())],
            ]);
    }
}

const factory = new TableViewFactory();
