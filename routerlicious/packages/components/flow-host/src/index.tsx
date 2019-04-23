// Must be first import.
import "./publicpath";

import * as chartView from "@chaincode/chart-view";
import * as flowDocument from "@chaincode/flow-document";
import * as flowEditor from "@chaincode/flow-editor";
import {TableDocumentType, TableSliceType} from "@chaincode/table-document";
import * as tableView from "@chaincode/table-view";
import { Component } from "@prague/app-component";
import {
    IContainerContext,
    IRuntime,
} from "@prague/container-definitions";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { App, IAppConfig } from "./app";

// tslint:disable-next-line:no-var-requires
const pkg = require("../package.json");

export class FlowHost extends Component {
    public static readonly type = `${pkg.name}@${pkg.version}`;

    constructor() {
        super([]);
    }

    public async opened() {
        await this.connected;

        const hostContent: HTMLElement = await this.platform.queryInterface<HTMLElement>("div");
        if (!hostContent) {
            // If headless exist early
            return;
        }

        const appConfig: IAppConfig = {
            host: this.host,
            verdaccioUrl: "http://localhost:4873",
        };

        ReactDOM.render(<App config={appConfig} />, hostContent);
    }

    protected async create() { /* do nothing */ }
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(
        context,
        pkg.name,
        new Map([
            ["@chaincode/chart-view", Promise.resolve(Component.createComponentFactory(chartView.ChartView))],
            ["@chaincode/flow-document", Promise.resolve(Component.createComponentFactory(flowDocument.FlowDocument))],
            [pkg.name, Promise.resolve(Component.createComponentFactory(FlowHost))],
            ["@chaincode/flow-editor", Promise.resolve(Component.createComponentFactory(flowEditor.FlowEditor))],
            [TableDocumentType, import("@chaincode/table-document").then((m) => Component.createComponentFactory(m.TableDocument))],
            [TableSliceType, import("@chaincode/table-document").then((m) => Component.createComponentFactory(m.TableSlice))],
            ["@chaincode/table-view", Promise.resolve(Component.createComponentFactory(tableView.TableView))],
        ]));
}
