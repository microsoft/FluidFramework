import { TableDocument } from "@chaincode/table-document";
import { Component } from "@prague/app-component";
import { MapExtension } from "@prague/map";
import { ConfigView } from "./config";
import { ConfigKeys } from "./configKeys";
import { GridView } from "./grid";

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
                const configView = new ConfigView(this.host, this.root);
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
            const doc = await this.host.openComponent<TableDocument>(docId, true);
            const grid = new GridView(doc);
            maybeDiv.appendChild(grid.root);
        }
    }

    protected async create() { /* do nothing */ }
}
