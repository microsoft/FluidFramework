// set the base path for all dynamic imports first
import "./publicpath";

import { IContainerContext, IRequest, IRuntime } from "@prague/container-definitions";
import { Runtime } from "@prague/runtime";
import { Mic } from "./mic";
import { Playback } from "./playback";

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const registry = new Map<string, any>([
        ["@chaincode/mic", Promise.resolve({ instantiateComponent: () => Promise.resolve(new Mic()) })],
        ["@chaincode/playback", Promise.resolve({ instantiateComponent: () => Promise.resolve(new Playback()) })],
    ]);

    const runtime = await Runtime.Load(registry, context);

    // Register path handler for inbound messages
    runtime.registerRequestHandler(async (request: IRequest) => {
        console.log(request.url);
        const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
            ? request.url.substr(1)
            : request.url;
        const trailingSlash = requestUrl.indexOf("/");

        const componentId = requestUrl
            ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
            : "playback";
        const component = await runtime.getComponent(componentId, true);

        // If there is a trailing slash forward to the component. Otherwise handle directly.
        if (trailingSlash === -1) {
            return { status: 200, mimeType: "prague/component", value: component };
        } else {
            return component.request({ url: requestUrl.substr(trailingSlash) });
        }
    });

    if (!runtime.existing) {
        runtime.createAndAttachComponent("playback", "@chaincode/playback");
    }

    return runtime;
}
