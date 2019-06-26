/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentRuntime } from "@prague/component-runtime";
import { IContainerContext, IRequest, IRuntime } from "@prague/container-definitions";
import { ContainerRuntime } from "@prague/container-runtime";
import { SharedMap } from "@prague/map";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { Canvas } from "./canvas";
import { InkStreamExtension } from "./ink-stream";

/**
 * Canvas component factory
 */
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    const dataTypes = new Map<string, ISharedObjectExtension>();
    const mapExtension = SharedMap.getFactory();
    const inkExtension = new InkStreamExtension();
    dataTypes.set(mapExtension.type, mapExtension);
    dataTypes.set(inkExtension.type, inkExtension);

    const runtime = await ComponentRuntime.load(context, dataTypes);
    const canvasP = Canvas.load(runtime, context);
    runtime.registerRequestHandler(async (request: IRequest) => {
        const progressCollection = await canvasP;
        return progressCollection.request(request);
    });

    return runtime;
}

/**
 * Canvas document factory
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const registry = new Map<string, Promise<IComponentFactory>>([
        ["@chaincode/canvas", Promise.resolve({ instantiateComponent })],
    ]);

    const runtime = await ContainerRuntime.load(context, registry, { generateSummaries: true });

    // Register path handler for inbound messages
    runtime.registerRequestHandler(async (request: IRequest) => {
        const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
            ? request.url.substr(1)
            : request.url;
        const trailingSlash = requestUrl.indexOf("/");

        const componentId = requestUrl
            ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
            : "default";
        const component = await runtime.getComponentRuntime(componentId, true);

        const pathForComponent = trailingSlash !== -1 ? requestUrl.substr(trailingSlash) : requestUrl;
        return component.request({ url: pathForComponent });
    });

    // On first boot create the base component
    if (!runtime.existing) {
        runtime.createAndAttachComponent("default", "@chaincode/canvas").catch((error) => {
            context.error(error);
        });
    }

    return runtime;
}
