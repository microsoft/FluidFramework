/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
import "./publicpath";

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext, IRuntime } from "@microsoft/fluid-container-definitions";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";

async function getPinpointFluidExport() {
    const pinpoint = await import("@fluid-example/pinpoint-editor");
    return pinpoint.fluidExport.IComponentFactory;
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    // const registry = new Map<string, any>([["@chaincode/pinpoint-editor", pinpoint]]);
    const registry = new Map<string, Promise<IComponentFactory>>(
        [["@fluid-example/pinpoint-editor", getPinpointFluidExport()]],
    );

    const runtime: ContainerRuntime = await ContainerRuntime.load(context, registry,
        // Register path handler for inbound messages
        (containerRuntime: ContainerRuntime) => {
            return async (request: IRequest) => {
                console.log(request.url);
                const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
                    ? request.url.substr(1)
                    : request.url;
                const trailingSlash = requestUrl.indexOf("/");

                const componentId = requestUrl
                    ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
                    : "map";
                const component = await containerRuntime.getComponentRuntime(componentId, true);

                const pathForComponent = trailingSlash !== -1 ? requestUrl.substr(trailingSlash) : requestUrl;
                return component.request({ url: pathForComponent });
            };
        },
    );

    // On first boot create the base component
    if (!runtime.existing) {
        const componentRuntime = await runtime.createComponent("map", "@fluid-example/pinpoint-editor");
        componentRuntime.attach();
    }

    return runtime;
}
