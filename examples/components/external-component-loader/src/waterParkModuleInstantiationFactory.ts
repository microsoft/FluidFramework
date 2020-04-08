/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    createAndAttachComponent,
    DefaultComponentContainerRuntimeFactory,
} from "@microsoft/fluid-aqueduct";
import { IHostRuntime, NamedComponentRegistryEntries } from "@microsoft/fluid-runtime-definitions";
import { SpacesComponentName } from "@fluid-example/spaces";
import * as uuid from "uuid";
import { ExternalComponentLoader, WaterParkLoaderName } from "./waterParkLoader";
/**
 * This class creates two components: A loader and a view component for water park and then
 * add loader component to the view component to be rendered.
 */
export class WaterParkModuleInstantiationFactory extends DefaultComponentContainerRuntimeFactory {
    constructor(
        entries: NamedComponentRegistryEntries,
        private readonly loaderComponentName: string = WaterParkLoaderName,
        private readonly viewComponentName: string = SpacesComponentName) {
        super(viewComponentName, entries);
    }

    protected async containerInitializingFirstTime(runtime: IHostRuntime) {
        const viewComponent = await createAndAttachComponent<any>(
            runtime, DefaultComponentContainerRuntimeFactory.defaultComponentId, this.viewComponentName);
        const loaderComponent = await createAndAttachComponent<ExternalComponentLoader>(
            runtime, uuid(), this.loaderComponentName);

        // Only add the component toolbar if the view component supports it
        if (viewComponent.IComponentToolbarConsumer) {
            await viewComponent.IComponentToolbarConsumer
                .setComponentToolbar(loaderComponent.id, this.loaderComponentName, loaderComponent.url);
        }
        loaderComponent.setViewComponent(viewComponent);
    }
}
