import * as chartView from "@chaincode/chart-view";
import * as flowDocument from "@chaincode/flow-document";
import * as flowEditor from "@chaincode/flow-editor";
import * as tableDocument from "@chaincode/table-document";
import * as tableSlice from "@chaincode/table-slice";
import * as tableView from "@chaincode/table-view";
import { Component, Document } from "@prague/app-component";
import {
    IContainerContext,
    IPlatform,
    IRequest,
    IRuntime,
    ITree,
} from "@prague/container-definitions";
import { ComponentHost, Runtime } from "@prague/runtime";
import {
    IChaincode,
    IChaincodeComponent,
    IComponentPlatform,
    IComponentRuntime,
    IComponentDeltaHandler,
} from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { App, IAppConfig } from "./app";

class SharedText extends Document {
    private ready = new Deferred<void>();

    constructor(private componentRuntime: IComponentRuntime) {
        super();
    }

    public async opened() {
        this.ready.resolve();
    }

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
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
}

export class FlowHostComponent implements IChaincodeComponent {
    private sharedText: SharedText;
    private chaincode: IChaincode;
    private component: ComponentHost;

    constructor() {
    }

    public getModule(type: string): any {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime, platform: IPlatform): Promise<IComponentDeltaHandler> {
        this.sharedText = new SharedText(runtime);
        this.chaincode = Component.instantiate(this.sharedText);

        const chaincode = this.chaincode;

        // All of the below would be hidden from a developer
        // Is this an await or does it just go?
        const component = await ComponentHost.LoadFromSnapshot(
            runtime,
            runtime.tenantId,
            runtime.documentId,
            runtime.id,
            runtime.parentBranch,
            runtime.existing,
            runtime.options,
            runtime.clientId,
            runtime.user,
            runtime.blobManager,
            runtime.baseSnapshot,
            chaincode,
            runtime.deltaManager,
            runtime.getQuorum(),
            runtime.storage,
            runtime.connectionState,
            runtime.branch,
            runtime.minimumSequenceNumber,
            runtime.snapshotFn,
            runtime.closeFn);
        this.component = component;

        return component;
    }

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
        return this.sharedText.attach(platform);
    }

    public snapshot(): ITree {
        const entries = this.component.snapshotInternal();
        return { entries };
    }
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new FlowHostComponent();
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const registry = new Map<string, any>([
        ["@chaincode/chart-view", chartView],
        ["@chaincode/flow-document", flowDocument],
        ["@chaincode/flow-host", { instantiateComponent }],
        ["@chaincode/flow-editor", flowEditor],
        ["@chaincode/table-document", tableDocument],
        ["@chaincode/table-slice", tableSlice],
        ["@chaincode/table-view", tableView]]);

    const runtime = await Runtime.Load(
        registry,
        context.tenantId,
        context.id,
        context.parentBranch,
        context.existing,
        context.options,
        context.clientId,
        { id: "test" },
        context.blobManager,
        context.deltaManager,
        context.quorum,
        context.storage,
        context.connectionState,
        context.baseSnapshot,
        context.blobs,
        context.branch,
        context.minimumSequenceNumber,
        context.submitFn,
        context.snapshotFn,
        context.closeFn);

    // Register path handler for inbound messages
    runtime.registerRequestHandler(async (request: IRequest) => {
        console.log(request.url);
        const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
            ? request.url.substr(1)
            : request.url;
        const trailingSlash = requestUrl.indexOf("/");

        const componentId = requestUrl
            ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
            : "flow-host";
        const component = await runtime.getProcess(componentId, true);

        // If there is a trailing slash forward to the component. Otherwise handle directly.
        if (trailingSlash === -1) {
            return { status: 200, mimeType: "prague/component", value: component };
        } else {
            return component.request({ url: requestUrl.substr(trailingSlash) });
        }
    });

    // On first boot create the base component
    if (!runtime.existing) {
        runtime.createAndAttachProcess("flow-host", "@chaincode/flow-host").catch((error) => {
            context.error(error);
        });
    }

    return runtime;
}
