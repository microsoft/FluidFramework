import { ComponentRuntime } from "@prague/component-runtime";
import {
    IComponent,
    IComponentRouter,
    IContainerContext,
    IRequest,
    IResponse,
    IRuntime,
} from "@prague/container-definitions";
import { ContainerRuntime } from "@prague/container-runtime";
import { ISharedMap, MapExtension } from "@prague/map";
import {
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";

// tslint:disable no-var-requires
// tslint:disable no-require-imports
const pkg = require("../package.json");
export const ComponentName = pkg.name;

export interface IKeyValue {
  set(key: string, value: any): void;
  get(key: string): any;
}

export class KeyValue implements IKeyValue, IComponent, IComponentRouter {

    public static supportedInterfaces = ["IKeyValue"];

    public static async load(runtime: IComponentRuntime) {
        const kevValue = new KeyValue(runtime);
        await kevValue.initialize();

        return kevValue;
    }

    private root: ISharedMap;

    constructor(private readonly runtime: IComponentRuntime) {
    }

    public set(key: string, value: any): void {
      this.root.set(key, value);
    }

    public get(key: string): any {
      return this.root.get(key);
    }

    public query(id: string): any {
        return KeyValue.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return KeyValue.supportedInterfaces;
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
            this.root = this.runtime.createChannel("root", MapExtension.Type) as ISharedMap;
            this.root.attach();
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
        }
    }
}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {

    const dataTypes = new Map<string, ISharedObjectExtension>();
    dataTypes.set(MapExtension.Type, new MapExtension());

    const runtime = await ComponentRuntime.load(context, dataTypes);
    const keyValueP = KeyValue.load(runtime);
    runtime.registerRequestHandler(async (request: IRequest) => {
        const keyValue = await keyValueP;
        return keyValue.request(request);
    });

    return runtime;
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const runtime = await ContainerRuntime.load(context, new Map([
        [ComponentName, Promise.resolve({ instantiateComponent })],
      ]));

    runtime.registerRequestHandler(async (request: IRequest) => {
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
    });

    if (!runtime.existing) {
        runtime.createAndAttachComponent(ComponentName, ComponentName).catch((error) => {
            context.error(error);
        });
    }

    return runtime;
}
