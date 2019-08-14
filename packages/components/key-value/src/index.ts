/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@prague/container-definitions";
import { ContainerRuntime } from "@prague/container-runtime";
import { ISharedMap, SharedMap } from "@prague/map";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectFactory } from "@prague/shared-object-common";

// tslint:disable no-var-requires
// tslint:disable no-require-imports
const pkg = require("../package.json");
export const ComponentName = pkg.name;

export interface IProvideKeyValue {
    readonly IKeyValue: IKeyValue;
}

export interface IKeyValue extends IProvideKeyValue {
    set(key: string, value: any): void;
    get(key: string): any;
}

declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideKeyValue>> {
    }
}

export class KeyValue implements IKeyValue, IComponent, IComponentRouter {

    public static async load(runtime: IComponentRuntime) {
        const kevValue = new KeyValue(runtime);
        await kevValue.initialize();

        return kevValue;
    }

    public get IComponentRouter() { return this; }
    public get IKeyValue() { return this; }

    private root: ISharedMap;

    constructor(private readonly runtime: IComponentRuntime) {
    }

    public set(key: string, value: any): void {
        this.root.set(key, value);
    }

    public get(key: string): any {
        return this.root.get(key);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            this.root.register();
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
        }
    }
}

export class KeyValueFactoryComponent implements IRuntimeFactory, IComponentFactory {

    public get IRuntimeFactory() { return this; }
    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const mapFactory = SharedMap.getFactory();
        dataTypes.set(mapFactory.type, mapFactory);

        ComponentRuntime.load(
            context,
            dataTypes,
            (runtime) => {
                const keyValueP = KeyValue.load(runtime);
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const keyValue = await keyValueP;
                    return keyValue.request(request);
                });
            });
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            new Map([[ComponentName, Promise.resolve(this)]]),
            this.createContainerRequestHandler,
        );

        if (!runtime.existing) {
            const created = await runtime.createComponent(ComponentName, ComponentName);
            created.attach();
        }

        return runtime;
    }

    /**
     * Add create and store a request handler as pat of ContainerRuntime load
     * @param runtime - Container Runtime instance
     */
    private createContainerRequestHandler(runtime: ContainerRuntime) {
        return async (request: IRequest) => {
            const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
                ? request.url.substr(1)
                : request.url;
            const trailingSlash = requestUrl.indexOf("/");
            const componentId = requestUrl
                ? decodeURIComponent(requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash))
                : ComponentName;
            console.log(componentId);
            const pathForComponent = trailingSlash !== -1 ? requestUrl.substr(trailingSlash) : requestUrl;
            const component = await runtime.getComponentRuntime(componentId, true);
            return component.request({ url: pathForComponent });
        };
    }
}

export const fluidExport = new KeyValueFactoryComponent();

// TODO included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return fluidExport.instantiateRuntime(context);
}

// TODO included for back compat - can remove in 0.7 once fluidExport is default
export function instantiateComponent(context: IComponentContext): void {
    fluidExport.instantiateComponent(context);
}
