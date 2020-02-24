/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleContainerRuntimeFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IContainerContext, IRuntime } from "@microsoft/fluid-container-definitions";
import { NamedComponentRegistryEntries } from "@microsoft/fluid-runtime-definitions";
import * as uuid from "uuid";
import { ExternalComponentLoader, WaterParkLoaderName } from "./waterParkLoader";
import { SpacesComponentName } from "./spaces";
import { Spaces } from "./spaces/spaces";

/**
 * This class creates two components: A loader and a view component for water park and then
 * add loader component to the view component to be rendered.
 */
export class WaterParkModuleInstantiationFactory extends SimpleModuleInstantiationFactory {

    private loaderComponentId: string | undefined;

    constructor(
        private readonly entries: NamedComponentRegistryEntries,
        private readonly loaderComponentName: string = WaterParkLoaderName,
        private readonly viewComponentName: string = SpacesComponentName) {
        super(viewComponentName, entries);      
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        this.loaderComponentId = uuid();
        const runtimeP = SimpleContainerRuntimeFactory.instantiateRuntime(
            context,
            this.viewComponentName,
            this.entries,
        );

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        runtimeP.then(async (runtime) => {
            if (!runtime.existing) {
                const loaderComponent = await SimpleContainerRuntimeFactory.createAndAttachComponent<ExternalComponentLoader>(
                    runtime,
                    this.loaderComponentId,
                    this.loaderComponentName);
                const viewResponse = await runtime.request({ url: SimpleContainerRuntimeFactory.defaultComponentId });
                const viewComponent = viewResponse.value as Spaces;
                await viewComponent.setComponentToolbar(loaderComponent.id, this.loaderComponentName);
                loaderComponent.setViewComponent(viewComponent);
            }
        });
        return runtimeP;
    }
}
