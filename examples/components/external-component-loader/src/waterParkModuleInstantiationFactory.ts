/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultComponent,
} from "@microsoft/fluid-aqueduct";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IContainerRuntime, NamedComponentRegistryEntries } from "@microsoft/fluid-runtime-definitions";
import { SpacesComponentName } from "@fluid-example/spaces";
import * as uuid from "uuid";
import { ExternalComponentLoader, ValidViewComponent, WaterParkLoaderName } from "./waterParkLoader";

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
export class WaterParkModuleInstantiationFactory extends ContainerRuntimeFactoryWithDefaultComponent {
    constructor(
        entries: NamedComponentRegistryEntries,
        private readonly loaderComponentName: string = WaterParkLoaderName,
        private readonly viewComponentName: string = SpacesComponentName) {
        super(viewComponentName, entries);
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const viewComponent = await createAndAttachComponent<ValidViewComponent>(
            runtime, ContainerRuntimeFactoryWithDefaultComponent.defaultComponentId, this.viewComponentName);
        const loaderComponent = await createAndAttachComponent<ExternalComponentLoader>(
            runtime, uuid(), this.loaderComponentName);

        // Only add the component toolbar if the view component supports it
        (viewComponent as IComponent).IComponentToolbarConsumer?.setComponentToolbar(
            loaderComponent.id,
            this.loaderComponentName,
            loaderComponent,
        );
        loaderComponent.setViewComponent(viewComponent);
    }
}
