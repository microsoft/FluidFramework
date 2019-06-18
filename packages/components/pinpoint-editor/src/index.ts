import { ComponentRuntime } from "@prague/component-runtime";
import { IRequest } from "@prague/container-definitions";
import { SharedMap } from "@prague/map";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { PinpointRunner } from "./runner";

/**
 * Instantiates a new chaincode component
 */
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    const modules = new Map<string, any>();

    // Create channel extensions
    const mapExtension = SharedMap.getFactory();
    modules.set(mapExtension.type, mapExtension);

    const runtime = await ComponentRuntime.load(context, modules);
    const runnerP = PinpointRunner.load(runtime, context);

    runtime.registerRequestHandler(async (request: IRequest) => {
        const runner = await runnerP;
        return request.url && request.url !== "/"
            ? { status: 404, mimeType: "text/plain", value: `${request.url} not found` }
            : { status: 200, mimeType: "prague/component", value: runner };
    });

    return runtime;
}
