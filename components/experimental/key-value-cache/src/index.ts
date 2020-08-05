/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    IFluidObject,
    IFluidRouter,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime } from "@fluidframework/datastore";
import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import {
    IFluidDataStoreRuntime,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import {
    IContainerRuntime,
} from "@fluidframework/container-runtime-definitions";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ComponentName = pkg.name;

export const IKeyValue: keyof IProvideKeyValue = "IKeyValue";

export interface IProvideKeyValue {
    readonly IKeyValue: IKeyValue;
}

export interface IKeyValue extends IProvideKeyValue {
    set(key: string, value: any): void;
    get(key: string): any;
    entries(): IterableIterator<[string, any]>;
    delete(key: string): boolean;
}

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideKeyValue>> { }
}

class KeyValue implements IKeyValue, IFluidObject, IFluidRouter {
    public static async load(runtime: IFluidDataStoreRuntime, context: IFluidDataStoreContext) {
        const kevValue = new KeyValue(runtime);
        await kevValue.initialize();

        return kevValue;
    }

    public get IFluidRouter() { return this; }
    public get IKeyValue() { return this; }

    private _root: ISharedMap | undefined;

    public get root() {
        assert(this._root);
        return this._root;
    }

    constructor(private readonly runtime: IFluidDataStoreRuntime) {
    }

    public set(key: string, value: any): void {
        this.root.set(key, value);
    }

    public get(key: string): any {
        return this.root.get(key);
    }

    public entries() {
        return this.root.entries();
    }

    public delete(key: string): boolean {
        return this.root.delete(key);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this._root = SharedMap.create(this.runtime, "root");
            this._root.bindToContext();
        } else {
            this._root = await this.runtime.getChannel("root") as ISharedMap;
        }
    }
}

export class KeyValueFactoryComponent implements IRuntimeFactory, IFluidDataStoreFactory {
    public static readonly type = "@fluid-example/key-value-cache";
    public readonly type = KeyValueFactoryComponent.type;

    public get IRuntimeFactory() { return this; }
    public get IFluidDataStoreFactory() { return this; }

    /**
     * A request handler for a container runtime
     * @param request - The request
     * @param runtime - Container Runtime instance
     */
    private static async containerRequestHandler(request: IRequest, runtime: IContainerRuntime): Promise<IResponse> {
        const requestUrl = request.url.length > 0 && request.url.startsWith("/")
            ? request.url.substr(1)
            : request.url;
        const trailingSlash = requestUrl.indexOf("/");
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const componentId = requestUrl
            ? decodeURIComponent(requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash))
            : ComponentName;

        const pathForComponent = trailingSlash !== -1 ? requestUrl.substr(trailingSlash) : requestUrl;
        const component = await runtime.getDataStore(componentId, true);
        return component.request({ url: pathForComponent });
    }

    public instantiateDataStore(context: IFluidDataStoreContext): void {
        const dataTypes = new Map<string, IChannelFactory>();
        const mapFactory = SharedMap.getFactory();
        dataTypes.set(mapFactory.type, mapFactory);

        const runtime = FluidDataStoreRuntime.load(
            context,
            dataTypes,
        );

        const keyValueP = KeyValue.load(runtime, context);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const keyValue = await keyValueP;
            return keyValue.request(request);
        });
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            new Map([[ComponentName, Promise.resolve(this)]]),
            KeyValueFactoryComponent.containerRequestHandler,
        );

        if (!runtime.existing) {
            await runtime.createRootDataStore(ComponentName, ComponentName);
        }

        return runtime;
    }
}

export const fluidExport = new KeyValueFactoryComponent();
