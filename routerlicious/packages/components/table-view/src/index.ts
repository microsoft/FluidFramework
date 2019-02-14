import { TableDocument } from "@chaincode/table-document";
import { Component, ComponentChaincode } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { MapExtension } from "@prague/map";
import { IChaincode, IChaincodeComponent, IComponentRuntime } from "@prague/runtime-definitions";
import { ConfigView } from "./config";
import { ConfigKeys } from "./configKeys";
import { GridView } from "./grid";

// tslint:disable-next-line:no-var-requires
const pkg = require("../package.json");

export class TableView extends Component {
    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;

    constructor(private componentRuntime: IComponentRuntime) {
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
                const configView = new ConfigView(this.componentRuntime, this.root);
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
            const component = await this.componentRuntime.getComponent(docId, true);
            const tableDocComponent = component.chaincode as ComponentChaincode<TableDocument>;
            const doc = tableDocComponent.instance;
            await doc.ready;

            const grid = new GridView(doc);
            maybeDiv.appendChild(grid.root);
        }
    }

    protected async create() { /* do nothing */ }
}

export async function instantiate(): Promise<IChaincode> {
    return Component.instantiate(new TableView(null as any));
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return Component.instantiateComponent(TableView);
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(context, pkg.name, [[pkg.name, Promise.resolve({ instantiateComponent })]]);
}
