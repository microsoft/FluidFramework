/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@microsoft/fluid-container-definitions";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { IComponentFactory, FlushMode } from "@microsoft/fluid-runtime-definitions";
import { fluidExport as persona } from "./persona";

const componentPackage = "@chaincode/persona";

class DrawerDocumentFactory implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const registry = new Map<string, Promise<IComponentFactory>>([
            [componentPackage, Promise.resolve(persona)],
        ]);

        const defaultComponentId = "default";

        const runtime = await ContainerRuntime.load(
            context,
            registry,
            [
                async (request: IRequest, containerRuntime) => {
                    console.log(request.url);

                    const requestUrl = request.url.length > 0 && request.url.startsWith("/")
                        ? request.url.substr(1)
                        : request.url;
                    const trailingSlash = requestUrl.indexOf("/");

                    const componentId = requestUrl
                        ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
                        : defaultComponentId;
                    const component = await containerRuntime.getComponentRuntime(componentId, true);

                    return component.request({ url: trailingSlash === -1 ? "" : requestUrl.substr(trailingSlash + 1) });
                },
            ],
            { generateSummaries: true });

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base component
        if (!runtime.existing) {
            await Promise.all([
                runtime.createComponent_UNSAFE(defaultComponentId, componentPackage).then((componentRuntime) => {
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

export const fluidExport = new DrawerDocumentFactory();

// eslint-disable-next-line @typescript-eslint/promise-function-async, prefer-arrow/prefer-arrow-functions
export function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return fluidExport.instantiateRuntime(context);
}
