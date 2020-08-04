/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/component-core-interfaces";
import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidDataStoreFactory, FlushMode } from "@fluidframework/runtime-definitions";
import { fluidExport as smde } from "./smde";

class SmdeContainerFactory implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
            ["@fluid-example/smde", Promise.resolve(smde)],
        ]);

        const defaultComponentId = "default";
        const defaultComponent = "@fluid-example/smde";

        const runtime = await ContainerRuntime.load(
            context,
            registry,
            async (request: IRequest, containerRuntime) => {
                console.log(request.url);

                const requestUrl = request.url.length > 0 && request.url.startsWith("/")
                    ? request.url.substr(1)
                    : request.url;
                const trailingSlash = requestUrl.indexOf("/");

                const componentId = requestUrl
                    ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
                    : defaultComponentId;
                const component = await containerRuntime.getDataStore(componentId, true);

                return component.request({ url: trailingSlash === -1 ? "" : requestUrl.substr(trailingSlash + 1) });
            },
            { generateSummaries: true });

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base component
        if (!runtime.existing) {
            await runtime.createRootDataStore(defaultComponentId, defaultComponent);
        }

        return runtime;
    }
}

export const fluidExport = new SmdeContainerFactory();

export const instantiateRuntime =
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    (context: IContainerContext): Promise<IRuntime> =>
        fluidExport.instantiateRuntime(context);
