import * as chartView from "@chaincode/chart-view";
import * as flowDocument from "@chaincode/flow-document";
import * as flowEditor from "@chaincode/flow-editor";
import * as tableDocument from "@chaincode/table-document";
import * as tableSlice from "@chaincode/table-slice";
import * as tableView from "@chaincode/table-view";
import { Component } from "@prague/app-component";
import {
    IContainerContext,
    IPlatform,
    IRuntime,
} from "@prague/container-definitions";
import {
    IChaincodeComponent,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { App, IAppConfig } from "./app";

// tslint:disable-next-line:no-var-requires
const pkg = require("../package.json");

export class FlowHost extends Component {
    public static readonly type = `${pkg.name}@${pkg.version}`;
    private ready = new Deferred<void>();

    constructor(private componentRuntime: IComponentRuntime) {
        super([]);
    }

    public async opened() {
        await this.connected;
        this.ready.resolve();
    }

    public async attach(platform: IPlatform): Promise<void> {
        await this.ready.promise;

        const hostContent: HTMLElement = await platform.queryInterface<HTMLElement>("div");
        if (!hostContent) {
            // If headless exist early
            return;
        }

        const appConfig: IAppConfig = {
            runtime: this.componentRuntime,
            verdaccioUrl: "http://localhost:4873",
        };

        ReactDOM.render(<App config={appConfig} />, hostContent);
    }

    protected async create() { /* do nothing */ }
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return Component.instantiateComponent(FlowHost);
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(context, pkg.name, [
        ["@chaincode/chart-view", Promise.resolve(chartView)],
        ["@chaincode/flow-document", Promise.resolve(flowDocument)],
        [pkg.name, Promise.resolve({ instantiateComponent })],
        ["@chaincode/flow-editor", Promise.resolve(flowEditor)],
        ["@chaincode/table-document", Promise.resolve(tableDocument)],
        ["@chaincode/table-slice", Promise.resolve(tableSlice)],
        ["@chaincode/table-view", Promise.resolve(tableView)]]);
}
