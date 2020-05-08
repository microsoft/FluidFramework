/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultComponent,
} from "@microsoft/fluid-aqueduct";
import { IContainerRuntime } from "@microsoft/fluid-container-runtime-definitions";
import { NamedComponentRegistryEntries } from "@microsoft/fluid-runtime-definitions";
import { IComponentToolbarConsumer, SpacesComponentName } from "@fluid-example/spaces";
import * as uuid from "uuid";
import { ExternalComponentLoader, WaterParkCompatibleView } from "./externalComponentLoader";

/**
 * Calls create, initialize, and attach on a new component.
 *
 * @param runtime - It is the runtime for the container.
 * @param id - unique component id for the new component
 * @param pkg - package name for the new component
 */
async function createAndAttachComponent<T>(
    runtime: IContainerRuntime,
    id: string,
    pkg: string,
): Promise<T> {
    const componentRuntime = await runtime.createComponent(id, pkg);

    const result = await componentRuntime.request({ url: "/" });
    if (result.status !== 200 || result.mimeType !== "fluid/component") {
        throw new Error("Failed to get component.");
    }

    componentRuntime.attach();

    return result.value as T;
}

/**
 * This class creates two components: A loader and a view component for water park and then
 * add loader component to the view component to be rendered.
 */
export class WaterParkContainerRuntimeFactory extends ContainerRuntimeFactoryWithDefaultComponent {
    /**
     * @param entries - Registered component types
     */
    constructor(entries: NamedComponentRegistryEntries) {
        // this needs to switch to WaterParkLoaderName
        super(SpacesComponentName, entries);
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const viewComponent =
            await createAndAttachComponent<WaterParkCompatibleView & Partial<IComponentToolbarConsumer>>(
                runtime,
                ContainerRuntimeFactoryWithDefaultComponent.defaultComponentId,
                SpacesComponentName,
            );
        const loaderComponent = await createAndAttachComponent<ExternalComponentLoader>(
            runtime, uuid(), ExternalComponentLoader.ComponentName);

        // Only add the component toolbar if the view component supports it
        viewComponent.IComponentToolbarConsumer?.setToolbarComponent(loaderComponent);
    }
}
