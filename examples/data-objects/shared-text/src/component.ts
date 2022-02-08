/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { parse } from "querystring";
import registerDebug from "debug";
import { controls, ui } from "@fluid-example/client-ui-lib";
import { performance } from "@fluidframework/common-utils";
import {
    FluidObject,
    IFluidHandle,
    IFluidLoadable,
    IFluidRouter,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, FluidObjectHandle, mixinRequestHandler } from "@fluidframework/datastore";
import {
    ISharedMap,
    SharedMap,
} from "@fluidframework/map";
import * as MergeTree from "@fluidframework/merge-tree";
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
import { downloadRawText, mapWait } from "./utils";

const debug = registerDebug("fluid:shared-text");

const rootMapId = "root";
const textSharedStringId = "text";
const flowContainerMapId = "flowContainerMap";

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
    private readonly title: string = "Shared Text";

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

    public getRoot(): ISharedMap {
        return this.root;
    }

    public async request(request: IRequest): Promise<IResponse> {
        const pathParts = RequestParser.getPathParts(request.url);
        if (pathParts.length === 0) {
            return { status: 200, mimeType: "fluid/object", value: this };
        } else if (pathParts.length === 1 && pathParts[0].toLocaleLowerCase() === "sharedstring") {
            return { status:200, mimeType: "fluid/sharedstring", value: this.sharedString };
        }
        else {
            return create404Response(request);
        }
    }

    private async initialize(existing: boolean): Promise<void> {
        if (!existing) {
            this.root = SharedMap.create(this.runtime, rootMapId);
            this.root.bindToContext();

            debug(`Not existing ${this.runtime.id} - ${performance.now()}`);
            const newString = SharedString.create(this.runtime);

            const template = parse(window.location.search.substr(1)).template;
            const starterText = template
                ? await downloadRawText(`/public/literature/${template}`)
                : " ";

            const segments = MergeTree.loadSegments(starterText, 0, true);
            for (const segment of segments) {
                if (MergeTree.TextSegment.is(segment)) {
                    newString.insertText(newString.getLength(), segment.text,
                        segment.properties);
                } else {
                    // Assume marker
                    const marker = segment as MergeTree.Marker;
                    newString.insertMarker(newString.getLength(), marker.refType, marker.properties);
                }
            }
            this.root.set(textSharedStringId, newString.handle);

            // The flowContainerMap MUST be set last
            const flowContainerMap = SharedMap.create(this.runtime);
            this.root.set(flowContainerMapId, flowContainerMap.handle);
        } else {
            this.root = await this.runtime.getChannel(rootMapId) as ISharedMap;
        }

        debug(`collabDoc loaded ${this.runtime.id} - ${performance.now()}`);
        debug(`Getting root ${this.runtime.id} - ${performance.now()}`);

        await mapWait(this.root, flowContainerMapId);

        this.sharedString = await this.root.get<IFluidHandle<SharedString>>(textSharedStringId).get();
        debug(`Shared string ready - ${performance.now()}`);
        debug(`id is ${this.runtime.id}`);
        debug(`Partial load fired: ${performance.now()}`);
    }

    private async initializeUI(div): Promise<void> {

        require("bootstrap/dist/css/bootstrap.min.css");
        require("bootstrap/dist/css/bootstrap-theme.min.css");
        require("../stylesheets/map.css");
        require("../stylesheets/style.css");
        /* eslint-enable @typescript-eslint/no-require-imports,
        import/no-internal-modules, import/no-unassigned-import */

        const browserContainerHost = new ui.BrowserContainerHost();

        const containerDiv = document.createElement("div");
        containerDiv.id = "flow-container";
        containerDiv.style.touchAction = "none";
        containerDiv.style.overflow = "hidden";
        const container = new controls.FlowContainer(
            containerDiv,
            this.title,
            this.runtime,
            this.context,
            this.sharedString,
        );
        const theFlow = container.flowView;
        browserContainerHost.attach(container, div);

        if (this.sharedString.getLength() > 0) {
            theFlow.render(0, true);
        }
        theFlow.timeToEdit = theFlow.timeToImpression = performance.now();

        theFlow.setEdit(this.root);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.sharedString.loaded.then(() => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            theFlow.loadFinished(performance.now());
            debug(`${this.runtime.id} fully loaded: ${performance.now()} `);
        });
    }
}

export class SharedTextDataStoreFactory implements IFluidDataStoreFactory {
    public static readonly type = "@fluid-example/shared-text";
    public readonly type = SharedTextDataStoreFactory.type;

    public get IFluidDataStoreFactory() { return this; }

    public async instantiateDataStore(context: IFluidDataStoreContext, existing?: boolean) {
        const runtimeClass = mixinRequestHandler(
            async (request: IRequest, runtime) => {
                const router: FluidObject<IFluidRouter> = await runtime.handle.get();
                if(router.IFluidRouter) {
                    return router.IFluidRouter.request(request);
                }
                return {status:500, value:"NotIFluidRouter", mimeType:"test/plain"};
            });

        const runtime = new runtimeClass(
            context,
            new Map([
                SharedMap.getFactory(),
                SharedString.getFactory(),
            ].map((factory) => [factory.type, factory])),
            existing,
            ()=>SharedTextRunner.load(runtime, context, existing),
        );

        return runtime;
    }
}
