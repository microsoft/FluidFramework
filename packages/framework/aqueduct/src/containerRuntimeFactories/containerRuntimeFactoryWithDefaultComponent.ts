/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    RuntimeRequestHandler,
} from "@microsoft/fluid-container-runtime";
import { IComponentDefaultFactoryName } from "@microsoft/fluid-framework-interfaces";
import { NamedComponentRegistryEntries } from "@microsoft/fluid-runtime-definitions";
import { IContainerRuntime } from "@microsoft/fluid-container-runtime-definitions";
import { DependencyContainerRegistry } from "@microsoft/fluid-synthesize";
import { defaultComponentRuntimeRequestHandler, mountableViewRequestHandler } from "../requestHandlers";
import { BaseContainerRuntimeFactory } from "./baseContainerRuntimeFactory";

const defaultComponentId = "default";

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
        super(
            registryEntries,
            providerEntries,
            [
                // The mountable view request handler must go before any other request handlers that we might
                // want to return mountable views, so it can correctly handle the header.
                mountableViewRequestHandler,
                defaultComponentRuntimeRequestHandler(defaultComponentId),
                ...requestHandlers,
            ],
        );
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
        // We need to request the component before attaching to ensure it
        // runs through its entire instantiation flow.
        await componentRuntime.request({ url:"/" });
        componentRuntime.attach();
    }
}
