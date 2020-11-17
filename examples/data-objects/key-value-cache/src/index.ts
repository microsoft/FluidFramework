/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidObject,
    IFluidRouter,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { mixinRequestHandler } from "@fluidframework/datastore";
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
    innerRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";

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
        assert(!!this._root);
        return this._root;
    }

    constructor(private readonly runtime: IFluidDataStoreRuntime) {
    }

    public set(key: string, value: any): void {
        this.root.set(key, value);
    }

    public get(key: string): any {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
    private readonly defaultComponentId = "default";
    public get IRuntimeFactory() { return this; }
    public get IFluidDataStoreFactory() { return this; }

    public async instantiateDataStore(context: IFluidDataStoreContext) {
        const dataTypes = new Map<string, IChannelFactory>();
        const mapFactory = SharedMap.getFactory();
        dataTypes.set(mapFactory.type, mapFactory);

        const runtimeClass = mixinRequestHandler(
            async (request: IRequest) => {
                const router = await routerP;
                return router.request(request);
            });

        const runtime = new runtimeClass(context, dataTypes);
        const routerP = KeyValue.load(runtime, context);

        return runtime;
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime: ContainerRuntime = await ContainerRuntime.load(
            context,
            new Map([[this.type, Promise.resolve(this)]]),
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(this.defaultComponentId),
                innerRequestHandler,
            ),
        );

        if (!runtime.existing) {
            await runtime.createRootDataStore(this.type, this.defaultComponentId);
        }

        return runtime;
    }
}

export const fluidExport = new KeyValueFactoryComponent();
