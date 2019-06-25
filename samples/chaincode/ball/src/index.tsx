import {
    MapExtension,
} from "@prague/map";
import { IComponentContext, IComponentRuntime, IComponentFactory } from "@prague/runtime-definitions";
import { ComponentRuntime } from "@prague/component-runtime";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { BallCollection } from "./main";
import { IRequest, IContainerContext, IRuntime } from "@prague/container-definitions";
import { ContainerRuntime, IComponentRegistry } from "@prague/container-runtime";

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    const dataTypes = new Map<string, ISharedObjectExtension>();
    dataTypes.set(MapExtension.Type, new MapExtension());

    const runtime = await ComponentRuntime.load(context, dataTypes);
    const ballCollectionP = BallCollection.Load(runtime, context);

    runtime.registerRequestHandler(async (request: IRequest) => {
        const ballCollection = await ballCollectionP;
        return ballCollection.request(request);
    });

    return runtime;
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const runtime = await ContainerRuntime.load(context, new MyRegistry(context));
    runtime.registerRequestHandler(async (request: IRequest) => {

        const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
            ? request.url.substr(1)
            : request.url;
        const trailingSlash = requestUrl.indexOf("/");

        // We always need a componentID, this is where we declare the "default component"
        const componentId = requestUrl
            ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
            : "ball"; // this is the "default" component. For shared text this is "text"

        const component = await runtime.getComponentRuntime(componentId, true);

        return component.request({ url: requestUrl.substr(trailingSlash) });


    });

    if (!runtime.existing) {
        await Promise.all([
            runtime.createAndAttachComponent("ball", "@chaincode/ball-component"),
        ])
            .catch((error) => {
                context.error(error);
            });
    }
    return runtime;
}

class MyRegistry implements IComponentRegistry {
    constructor(private context: IContainerContext) {
    }

    public async get(name: string): Promise<IComponentFactory> {
        if (name === "@chaincode/ball-component") {
            return { instantiateComponent };
        } else {
            return this.context.codeLoader.load<IComponentFactory>(name);
        }
    }
}

