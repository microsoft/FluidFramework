/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableDocument, TableDocumentType } from "@chaincode/table-document";
import { PrimedComponent, SharedComponentFactory } from "@prague/aqueduct";
import {
    IComponentHTMLOptions,
    IComponentHTMLVisual,
} from "@prague/container-definitions";
import { Template } from "@prague/flow-util";
import { SharedMap } from "@prague/map";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { ConfigView } from "./config";
import { ConfigKeys } from "./configKeys";
import { GridView } from "./grid";
import * as styles from "./index.css";

const template = new Template({
    tag: "div",
    children: [
        { tag: "button", ref: "addRow", props: { textContent: "R+" } },
        { tag: "button", ref: "addCol", props: { textContent: "C+" } },
        { tag: "button", ref: "addRows", props: { textContent: "R++" } },
        { tag: "button", ref: "addCols", props: { textContent: "C++" } },
        { tag: "div", ref: "grid", props: { className: styles.grid } },
    ],
});

export class TableView extends PrimedComponent implements IComponentHTMLVisual {
    public static getFactory() { return TableView.factory; }

    private static readonly factory = new SharedComponentFactory(
        TableView,
        [
            SharedMap.getFactory(),
        ],
    );

    private configView: ConfigView | undefined;
    private rootElement: Element | undefined;

    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context, []);
    }

    // #region IComponentHTMLVisual
    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        if (this.configView) {
            elm.appendChild(this.configView.root);
        } else {
            elm.appendChild(this.rootElement);
        }
    }
    // #endregion IComponentHTMLVisual

    protected async create() {
        this.configView = new ConfigView(this.runtime, this.root,
            async (id: string) => {
                await this.createAndAttachComponent(id, TableDocumentType);
            });

        // Start the config work flow
        // tslint:disable-next-line: no-floating-promises
        this.runConfig();
    }

    protected async opened() {
        await this.createRootElement();
    }

    private async runConfig() {
        await this.configView.done;
        await this.createRootElement();
        this.configView.root.replaceWith(this.rootElement);
        this.configView = undefined;
        return;
    }

    private async createRootElement() {
        const docId = await this.root.wait<string>(ConfigKeys.docId);
        const doc = await this.waitComponent<TableDocument>(docId);
        const root = template.clone();
        const grid = template.get(root, "grid");
        grid.appendChild(new GridView(doc).root);

        const addRowBtn = template.get(root, "addRow");
        addRowBtn.addEventListener("click", () => {
            doc.insertRows(doc.numRows, 1);
        });

        const addRowsBtn = template.get(root, "addRows");
        addRowsBtn.addEventListener("click", () => {
            doc.insertRows(doc.numRows, 10 /* 1048576 */);
        });

        const addColBtn = template.get(root, "addCol");
        addColBtn.addEventListener("click", () => {
            doc.insertCols(doc.numCols, 1);
        });

        const addColsBtn = template.get(root, "addCols");
        addColsBtn.addEventListener("click", () => {
            doc.insertCols(doc.numCols, 10 /*16384*/);
        });

        this.rootElement = root;
    }
}
