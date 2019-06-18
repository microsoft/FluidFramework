/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentRouter,
    IRequest,
    IResponse,
} from "@prague/container-definitions";
import {
    ISharedMap,
    MapExtension,
} from "@prague/map";
import {
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";

import { SharedComponent } from "./sharedComponent";

/**
 * RootComponent is a base component that creates a root map on creation
 * It also enables sharing with basic router functionality
 */
export abstract class RootComponent extends SharedComponent implements IComponentRouter {
    protected root: ISharedMap;

    private readonly rootMapId = "root";

    protected constructor(
        protected runtime: IComponentRuntime,
        protected context: IComponentContext,
        supportedInterfaces?: string[],
    ) {
        super(runtime, context, supportedInterfaces);
    }

    // start IComponentRouter

    /**
     * Return this object if someone requests it directly
     * We will return this object in three scenarios
     *  1. the request url is a "/"
     *  2. the request url is our url
     *  3. the request url is empty
     */
    public async request(req: IRequest): Promise<IResponse> {
        if (req.url === "/" || req.url === this.url || req.url === "") {
            return {
                mimeType: "prague/component",
                status: 200,
                value: this,
            };
        }

        return Promise.reject(`unknown request url: ${req.url}`);
    }

    // end IComponentRouter

    protected async initialize(): Promise<void> {
        // If the '_root' map is already initialized, than this is component has already been
        // prepared.  Promptly return 'this'.
        if (this.root) {
            // debug(`${this.dbgName}.ensureOpened() - already open`);
            return;
        }

        // calling the base class to make sure the entire initialize flow happens
        await super.initialize();
    }

    protected async created(): Promise<void> {
        // If it's the first time we are creating the component then create a root map
        this.root = this.runtime.createChannel(this.rootMapId, MapExtension.Type) as ISharedMap;

        // Calling attach pushes the channel to the websocket. Before this it's only local.
        this.root.attach();
    }

    protected async existing(): Promise<void> {
        // debug(`${this.dbgName}.ensureOpened() - already exists`);

        // If the component already exists, open it's root map.
        this.root = await this.runtime.getChannel(this.rootMapId) as ISharedMap;
    }
}
