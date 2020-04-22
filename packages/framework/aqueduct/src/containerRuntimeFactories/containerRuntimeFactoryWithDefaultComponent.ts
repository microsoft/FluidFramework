/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    componentRuntimeRequestHandler,
    RequestParser,
    RuntimeRequestHandler,
} from "@microsoft/fluid-container-runtime";
import { IComponentDefaultFactoryName } from "@microsoft/fluid-framework-interfaces";
import {
    IContainerRuntime,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { DependencyContainerRegistry } from "@microsoft/fluid-synthesize";
import { BaseContainerRuntimeFactory } from "./baseContainerRuntimeFactory";

const defaultComponentId = "default";

const defaultComponentRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length === 0) {
            return componentRuntimeRequestHandler(
                new RequestParser({
                    url: defaultComponentId,
                    headers: request.headers,
                }),
                runtime);
        }
        return undefined;
    };

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default component, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 */
export class ContainerRuntimeFactoryWithDefaultComponent extends BaseContainerRuntimeFactory implements
    IComponentDefaultFactoryName {
    public static readonly defaultComponentId = defaultComponentId;

    constructor(
        private readonly defaultComponentName: string,
        registryEntries: NamedComponentRegistryEntries,
        providerEntries: DependencyContainerRegistry = [],
        requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        super(registryEntries, providerEntries, [defaultComponentRuntimeRequestHandler, ...requestHandlers]);
    }

    public get IComponentDefaultFactoryName() { return this; }
    public getDefaultFactoryName() { return this.defaultComponentName; }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const componentRuntime = await runtime.createComponent(
            ContainerRuntimeFactoryWithDefaultComponent.defaultComponentId,
            this.defaultComponentName,
        );
        componentRuntime.attach();
    }
}
