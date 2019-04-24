import { TableDocument } from "@chaincode/table-document";
import { Component } from "@prague/app-component";
import { Template } from "@prague/flow-util";
import { MapExtension } from "@prague/map";
import { ConfigView } from "./config";
import { ConfigKeys } from "./configKeys";
import { GridView } from "./grid";
import * as styles from "./index.css";

const template = new Template({
    tag: "div",
    children: [
        { tag: "button", ref: "addRow", props: { textContent: "R+" }},
        { tag: "button", ref: "addCol", props: { textContent: "C+" }},
        { tag: "button", ref: "addRows", props: { textContent: "R++" }},
        { tag: "button", ref: "addCols", props: { textContent: "C++" }},
        { tag: "div", ref: "grid", props: { className: styles.grid }},
    ],
});

export class TableView extends Component {
    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    public async opened() {
        await this.connected;

        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
        if (!maybeDiv) {
            throw new Error("No <div> provided");
        }

        {
            const docId = await this.root.get(ConfigKeys.docId);
            if (!docId) {
                const configView = new ConfigView(this.runtime, this.root);
                maybeDiv.appendChild(configView.root);
                await configView.done;
                while (maybeDiv.lastChild) {
                    maybeDiv.lastChild.remove();
                }
            }
        }

        if (maybeDiv) {
            // tslint:disable-next-line:no-shadowed-variable
            const docId = await this.root.get(ConfigKeys.docId);
            const doc = await this.runtime.openComponent<TableDocument>(docId, true);
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

            maybeDiv.appendChild(root);
        }
    }

    protected async create() { /* do nothing */ }
}
