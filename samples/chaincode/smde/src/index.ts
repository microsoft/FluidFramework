/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@prague/component-core-interfaces";
import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@prague/container-definitions";
import { ContainerRuntime } from "@prague/container-runtime";
import { IComponentFactory, FlushMode } from "@prague/runtime-definitions";
import { fluidExport as smde } from "./smde";

class ProgressBarsFactory implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const registry = new Map<string, Promise<IComponentFactory>>([
            ["@chaincode/smde", Promise.resolve(smde)],
        ]);

        const defaultComponentId = "default";
        const defaultComponent = "@chaincode/smde";

        const runtime = await ContainerRuntime.load(
            context,
            registry,
            (containerRuntime) => {
                return async (request: IRequest) => {
                    console.log(request.url);

                    const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
                        ? request.url.substr(1)
                        : request.url;
                    const trailingSlash = requestUrl.indexOf("/");

                    const componentId = requestUrl
                        ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
                        : defaultComponentId;
                    const component = await containerRuntime.getComponentRuntime(componentId, true);

                    return component.request({ url: trailingSlash === -1 ? "" : requestUrl.substr(trailingSlash + 1) });
                };
            },
            { generateSummaries: true });

        // flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base component
        if (!runtime.existing) {
            await Promise.all([
                    runtime.createComponent(defaultComponentId, defaultComponent).then((componentRuntime) => {
                        componentRuntime.attach();
                    }),
                ])
                .catch((error) => {
                    context.error(error);
                });
        }

        return runtime;
    }
}

export const fluidExport = new ProgressBarsFactory();

export function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return fluidExport.instantiateRuntime(context);
}
