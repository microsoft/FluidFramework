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
    IHostRuntime,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import {
    ContainerServiceRegistryEntries,
} from "../containerServices";
import { BaseContainerRuntimeFactory } from "./baseContainerRuntimeFactory";

const defaultComponentId = "default";

const defaultComponentRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IHostRuntime) => {
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
        serviceRegistry: ContainerServiceRegistryEntries = [],
        requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        super(registryEntries, serviceRegistry, [defaultComponentRuntimeRequestHandler, ...requestHandlers]);
    }

    public get IComponentDefaultFactoryName() { return this; }
    public getDefaultFactoryName() { return this.defaultComponentName; }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IHostRuntime) {
        const componentRuntime = await runtime.createComponent_UNSAFE(
            ContainerRuntimeFactoryWithDefaultComponent.defaultComponentId,
            this.defaultComponentName,
        );
        componentRuntime.attach();
    }
}
