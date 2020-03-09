/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@microsoft/fluid-container-definitions";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
    IHostRuntime,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ComponentName = pkg.name;

export interface IProvideKeyValue {
    readonly IKeyValue: IKeyValue;
}

export interface IKeyValue extends IProvideKeyValue {
    set(key: string, value: any): void;
    get(key: string): any;
    entries(): IterableIterator<[string, any]>;
    delete(key: string): boolean;
}

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideKeyValue>> { }
}

class KeyValue implements IKeyValue, IComponent, IComponentRouter {

    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const kevValue = new KeyValue(runtime, context);
        await kevValue.initialize();

        return kevValue;
    }

    public get IComponentRouter() { return this; }
    public get IKeyValue() { return this; }

    private root: ISharedMap;

    constructor(private readonly runtime: IComponentRuntime, private readonly context: IComponentContext) {
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
            this.root = SharedMap.create(this.runtime, "root");
            this.root.register();
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
        }
        if (this.context.leader) {
            console.log(`INITIAL LEADER`);
        } else {
            this.context.on("leader", () => {
                console.log(`LEADER NOW`);
            });
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
    private static async containerRequestHandler(request: IRequest, runtime: IHostRuntime): Promise<IResponse> {
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
