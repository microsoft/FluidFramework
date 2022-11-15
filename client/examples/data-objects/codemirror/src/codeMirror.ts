/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { defaultFluidObjectRequestHandler } from "@fluidframework/aqueduct";
import {
    IFluidLoadable,
    IFluidRouter,
    IRequest,
    IResponse,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import {
    FluidObjectHandle,
    mixinRequestHandler,
} from "@fluidframework/datastore";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
    ReferenceType,
    reservedTileLabelsKey,
} from "@fluidframework/merge-tree";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { SharedString } from "@fluidframework/sequence";

import { PresenceManager } from "./presence";

/**
 * CodeMirrorComponent builds a Fluid collaborative code editor on top of the open source code editor CodeMirror.
 * It has its own implementation of IFluidLoadable and does not extend PureDataObject / DataObject. This is
 * done intentionally to serve as an example of exposing the URL and handle via IFluidLoadable.
 */
export class CodeMirrorComponent
    extends EventEmitter
    implements IFluidLoadable, IFluidRouter {
    public static async load(runtime: IFluidDataStoreRuntime, context: IFluidDataStoreContext, existing: boolean) {
        const collection = new CodeMirrorComponent(runtime, context);
        await collection.initialize(existing);

        return collection;
    }

    public get IFluidLoadable() { return this; }
    public get IFluidRouter() { return this; }

    public get handle(): IFluidHandle<this> { return this.innerHandle; }

    private _text: SharedString | undefined;
    public get text(): SharedString {
        if (this._text === undefined) {
            throw new Error("Text used before initialized");
        }
        return this._text;
    }
    private root: ISharedMap | undefined;
    private readonly innerHandle: IFluidHandle<this>;

    public readonly presenceManager: PresenceManager;

    constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        /* Private */ context: IFluidDataStoreContext,
    ) {
        super();
        this.innerHandle = new FluidObjectHandle(this, "", runtime.objectsRoutingContext);
        this.presenceManager = new PresenceManager(runtime);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return defaultFluidObjectRequestHandler(this, request);
    }

    private async initialize(existing: boolean) {
        if (!existing) {
            this.root = SharedMap.create(this.runtime, "root");
            const text = SharedString.create(this.runtime);

            // Initial paragraph marker
            text.insertMarker(
                0,
                ReferenceType.Tile,
                { [reservedTileLabelsKey]: ["pg"] });

            this.root.set("text", text.handle);
            this.root.bindToContext();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
        this._text = await this.root.get<IFluidHandle<SharedString>>("text")?.get();
    }
}

export class SmdeFactory implements IFluidDataStoreFactory {
    public static readonly type = "@fluid-example/codemirror";
    public readonly type = SmdeFactory.type;

    public get IFluidDataStoreFactory() { return this; }

    public async instantiateDataStore(context: IFluidDataStoreContext, existing: boolean) {
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
        const routerP = CodeMirrorComponent.load(runtime, context, existing);
        return runtime;
    }
}
