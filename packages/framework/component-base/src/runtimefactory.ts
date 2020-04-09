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

                    let componentId: string;
                    let remainingUrl: string;

                    if (trailingSlash >= 0) {
                        componentId = requestUrl.slice(0, trailingSlash);
                        remainingUrl = requestUrl.slice(trailingSlash + 1);
                    } else {
                        componentId = requestUrl;
                        remainingUrl = "";
                    }

                    const component = await containerRuntime.getComponentRuntime(componentId, true);

                    return component.request({ url: remainingUrl });
                },
            ]);

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base component
        if (!runtime.existing && this.defaultComponent.type) {
            await runtime
                .createComponentWithId(this.defaultComponent.type)
                .then((componentRuntime) => { componentRuntime.attach(); })
                .catch((error) => { context.error(error); });
        }

        return runtime;
    }
}
