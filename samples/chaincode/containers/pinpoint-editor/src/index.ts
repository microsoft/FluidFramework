/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
import "./publicpath";

import { IContainerContext, IRequest, IRuntime } from "@prague/container-definitions";
import { Runtime } from "@prague/runtime";
import * as Snapshotter from "@prague/snapshotter";

const pinpoint = import("@chaincode/pinpoint-editor");

async function waitForFullConnection(runtime: any): Promise<void> {
    if (runtime.connected) {
        return;
    } else {
        return new Promise<void>((resolve, reject) => {
            runtime.once("connected", () => {
                resolve();
            });
        });
    }
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const registry = new Map<string, any>([["@chaincode/pinpoint-editor", pinpoint]]);

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
            : "map";
        const component = await runtime.getComponent(componentId, true);

        const pathForComponent = trailingSlash !== -1 ? requestUrl.substr(trailingSlash) : requestUrl;
        return component.request({ url: pathForComponent });
    });

    runtime.registerTasks(["snapshot"], "1.0");

    waitForFullConnection(runtime).then(() => {
        // Call snapshot directly from runtime.
        if (runtime.clientType === "snapshot") {
            console.log(`@chaincode/manaco running ${runtime.clientType}`);
            Snapshotter.run(runtime);
        }
    });

    // On first boot create the base component
    if (!runtime.existing) {
        runtime.createAndAttachComponent("map", "@chaincode/pinpoint-editor").catch((error) => {
            context.error(error);
        });
    }

    return runtime;
}
