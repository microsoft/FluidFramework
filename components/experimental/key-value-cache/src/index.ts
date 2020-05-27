/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    IComponent,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { ComponentRuntime } from "@fluidframework/component-runtime";
import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
    IComponentContext,
    IComponentFactory,
} from "@fluidframework/runtime-definitions";
import {
    IComponentRuntime,
} from "@fluidframework/component-runtime-definitions";
import {
    IContainerRuntime,
} from "@fluidframework/container-runtime-definitions";
import { ISharedObjectFactory } from "@fluidframework/shared-object-base";

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

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideKeyValue>> { }
}

class KeyValue implements IKeyValue, IComponent, IComponentRouter {
    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const kevValue = new KeyValue(runtime);
        await kevValue.initialize();

        return kevValue;
    }

    public get IComponentRouter() { return this; }
    public get IKeyValue() { return this; }

    private _root: ISharedMap | undefined;

    public get root() {
        assert(this._root);
        return this._root;
    }

    constructor(private readonly runtime: IComponentRuntime) {
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
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this._root = SharedMap.create(this.runtime, "root");
            this._root.register();
        } else {
            this._root = await this.runtime.getChannel("root") as ISharedMap;
        }
    }
}

export class KeyValueFactoryComponent implements IRuntimeFactory, IComponentFactory {
    public static readonly type = "@fluid-example/key-value-cache";
    public readonly type = KeyValueFactoryComponent.type;

    public get IRuntimeFactory() { return this; }
    public get IComponentFactory() { return this; }

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
        console.log(componentId);
        const pathForComponent = trailingSlash !== -1 ? requestUrl.substr(trailingSlash) : requestUrl;
        const component = await runtime.getComponentRuntime(componentId, true);
        return component.request({ url: pathForComponent });
    }

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const mapFactory = SharedMap.getFactory();
        dataTypes.set(mapFactory.type, mapFactory);

        const runtime = ComponentRuntime.load(
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
            [KeyValueFactoryComponent.containerRequestHandler],
        );

        if (!runtime.existing) {
            const created = await runtime.createComponent(ComponentName, ComponentName);
            created.attach();
        }

        return runtime;
    }
}

export const fluidExport = new KeyValueFactoryComponent();
