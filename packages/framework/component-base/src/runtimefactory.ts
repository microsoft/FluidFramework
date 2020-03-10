/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime, IRuntimeFactory } from "@microsoft/fluid-container-definitions";
import {
    RuntimeRequestHandler,
    ContainerRuntime,
} from "@microsoft/fluid-container-runtime";
import {
    NamedComponentRegistryEntries,
    IComponentFactory,
    FlushMode,
} from "@microsoft/fluid-runtime-definitions";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";

const defaultComponentId = "default";

export class RuntimeFactory implements IRuntimeFactory {
    private readonly registry: NamedComponentRegistryEntries;

    constructor(
        private readonly defaultComponent: IComponentFactory,
        components: IComponentFactory[] = [defaultComponent],
        private readonly requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        this.registry =
            (components.includes(defaultComponent)
                ? components
                : components.concat(defaultComponent)
            ).map(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                (factory) => [factory.type!, factory]) as NamedComponentRegistryEntries;
    }

    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            this.registry,
            [
                ...this.requestHandlers,
                async (request: IRequest, containerRuntime) => {
                    const requestUrl = request.url.startsWith("/")
                        ? request.url.substr(1)
                        : request.url;

                    const trailingSlash = requestUrl.indexOf("/");

                    const componentId = requestUrl
                        ? requestUrl.substr(0,
                            trailingSlash === -1
                                ? requestUrl.length
                                : trailingSlash)
                        : defaultComponentId;

                    const component = await containerRuntime.getComponentRuntime(componentId, true);

                    return component.request({ url: trailingSlash === -1 ? "" : requestUrl.substr(trailingSlash + 1) });
                },
            ]);

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base component
        if (!runtime.existing) {
            await runtime
                .createComponent(defaultComponentId, this.defaultComponent.type)
                .then((componentRuntime) => { componentRuntime.attach(); })
                .catch((error) => { context.error(error); });
        }

        return runtime;
    }
}
