/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import registerDebug from "debug";
import { controls, ui } from "@fluid-example/client-ui-lib";
import { performance } from "@fluidframework/common-utils";
import {
    IFluidHandle,
    IFluidLoadable,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, FluidObjectHandle, mixinRequestHandler } from "@fluidframework/datastore";
import {
    ISharedMap,
    SharedMap,
} from "@fluidframework/map";
import { ReferenceType, reservedTileLabelsKey } from "@fluidframework/merge-tree";
import {
    IFluidDataStoreContext, IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import {
    SharedString,
} from "@fluidframework/sequence";
import {
    RequestParser,
    create404Response,
} from "@fluidframework/runtime-utils";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/css/bootstrap-theme.min.css";
import "../stylesheets/map.css";
import "../stylesheets/style.css";

const debug = registerDebug("fluid:shared-text");

const rootMapId = "root";
const textSharedStringId = "text";

export class SharedTextRunner extends EventEmitter implements IFluidHTMLView, IFluidLoadable {
    public static async load(
        runtime: FluidDataStoreRuntime,
        context: IFluidDataStoreContext,
        existing: boolean,
    ): Promise<SharedTextRunner> {
        const runner = new SharedTextRunner(runtime, context);
        await runner.initialize(existing);

        return runner;
    }

    private readonly innerHandle: IFluidHandle<this>;

    public get handle(): IFluidHandle<this> { return this.innerHandle; }
    public get IFluidHandle() { return this.innerHandle; }
    public get IFluidLoadable() { return this; }

    public get IFluidHTMLView() { return this; }

    private sharedString: SharedString;
    private root: ISharedMap;
    private uiInitialized = false;

    private constructor(
        private readonly runtime: FluidDataStoreRuntime,
        private readonly context: IFluidDataStoreContext,
    ) {
        super();
        this.innerHandle = new FluidObjectHandle(this, "/text", this.runtime.objectsRoutingContext);
    }

    public render(element: HTMLElement) {
        if (this.uiInitialized) {
            return;
        }

        this.initializeUI(element).catch(debug);
        this.uiInitialized = true;
    }

    public async request(request: IRequest): Promise<IResponse> {
        const pathParts = RequestParser.getPathParts(request.url);
        if (pathParts.length === 0) {
            return { status: 200, mimeType: "fluid/object", value: this };
        } else {
            return create404Response(request);
        }
    }

    private async initialize(existing: boolean): Promise<void> {
        if (!existing) {
            this.root = SharedMap.create(this.runtime, rootMapId);
            this.root.bindToContext();

            this.sharedString = SharedString.create(this.runtime);
            this.sharedString.insertMarker(0, ReferenceType.Tile, { [reservedTileLabelsKey]: ["pg"] });
            this.root.set(textSharedStringId, this.sharedString.handle);
        } else {
            this.root = await this.runtime.getChannel(rootMapId) as ISharedMap;
            this.sharedString = await this.root.get<IFluidHandle<SharedString>>(textSharedStringId).get();
        }
    }

    private async initializeUI(div): Promise<void> {
        const browserContainerHost = new ui.BrowserContainerHost();

        const containerDiv = document.createElement("div");
        containerDiv.classList.add("flow-container");
        const container = new controls.FlowContainer(
            containerDiv,
            "Shared Text",
            this.runtime,
            this.context,
            this.sharedString,
        );
        const theFlow = container.flowView;
        browserContainerHost.attach(container, div);

        theFlow.render(0, true);
        theFlow.timeToEdit = theFlow.timeToImpression = performance.now();

        theFlow.setEdit();

        this.sharedString.loaded.then(() => {
            theFlow.loadFinished(performance.now());
            debug(`${this.runtime.id} fully loaded: ${performance.now()} `);
        })
        .catch((e) => { console.error(e); });
    }
}

export class SharedTextDataStoreFactory implements IFluidDataStoreFactory {
    public static readonly type = "@fluid-example/shared-text";
    public readonly type = SharedTextDataStoreFactory.type;

    public get IFluidDataStoreFactory() { return this; }

    public async instantiateDataStore(context: IFluidDataStoreContext, existing?: boolean) {
        const runtimeClass = mixinRequestHandler(
            async (request: IRequest) => {
                const router = await routerP;
                return router.request(request);
            });

        const runtime = new runtimeClass(
            context,
            new Map([
                SharedMap.getFactory(),
                SharedString.getFactory(),
            ].map((factory) => [factory.type, factory])),
            existing,
        );
        const routerP = SharedTextRunner.load(runtime, context, existing);

        return runtime;
    }
}
