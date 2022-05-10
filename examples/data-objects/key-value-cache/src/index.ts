/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidRouter,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { mixinRequestHandler } from "@fluidframework/datastore";
import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import {
    IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { buildRuntimeRequestHandler } from "@fluidframework/request-handler";
import { defaultFluidObjectRequestHandler, defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";

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

class KeyValue implements IKeyValue, IFluidRouter {
    public static async load(runtime: IFluidDataStoreRuntime, _context: IFluidDataStoreContext, existing: boolean) {
        const kevValue = new KeyValue(runtime);
        await kevValue.initialize(existing);

        return kevValue;
    }

    public get IFluidRouter() { return this; }
    public get IKeyValue() { return this; }

    private _root: ISharedMap | undefined;

    public get root() {
        assert(!!this._root, "KeyValueCache root map is missing!");
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
        return defaultFluidObjectRequestHandler(this, request);
    }

    private async initialize(existing: boolean) {
        if (!existing) {
            this._root = SharedMap.create(this.runtime, "root");
            this._root.bindToContext();
        } else {
            this._root = await this.runtime.getChannel("root") as ISharedMap;
        }
    }
}

export class KeyValueFactoryComponent
    extends RuntimeFactoryHelper
    implements IFluidDataStoreFactory {
    public static readonly type = "@fluid-example/key-value-cache";
    public readonly type = KeyValueFactoryComponent.type;
    private readonly defaultComponentId = "default";
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
            ].map((factory) => [factory.type, factory])),
            existing,
        );
        const routerP = KeyValue.load(runtime, context, existing);

        return runtime;
    }

    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        await runtime.createRootDataStore(this.type, this.defaultComponentId);
    }

    public async preInitialize(
        context: IContainerContext,
        existing: boolean,
    ): Promise<ContainerRuntime> {
        const runtime: ContainerRuntime = await ContainerRuntime.load(
            context,
            new Map([[this.type, Promise.resolve(this)]]),
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(this.defaultComponentId),
            ),
            undefined, // runtimeOptions
            undefined, // containerScope
            existing,
        );
        return runtime;
    }
}

export const fluidExport = new KeyValueFactoryComponent();
