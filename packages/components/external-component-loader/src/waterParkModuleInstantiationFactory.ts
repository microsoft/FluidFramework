/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentRegistryTypes } from "@microsoft/fluid-runtime-definitions";
import { SimpleContainerRuntimeFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IContainerContext, IRuntime } from "@microsoft/fluid-container-definitions";
import * as uuid from "uuid";
import { ExternalComponentLoader, WaterParkLoaderName } from "./waterParkLoader";
import { ExternalComponentView, WaterParkViewName } from "./waterParkView";

/**
 * This class creates two components: A loader and a view component for water park and then
 * add loader component to the view component to be rendered.
 */
export class WaterParkModuleInstantiationFactory extends SimpleModuleInstantiationFactory {

    constructor(
        private readonly componentRegistry: ComponentRegistryTypes,
        private readonly loaderComponentName: string = WaterParkLoaderName,
        private readonly viewComponentName: string = WaterParkViewName) {
            super(viewComponentName, componentRegistry);
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const loaderComponentId = uuid();
        const runtimeP = SimpleContainerRuntimeFactory.instantiateRuntime(
            context,
            this.viewComponentName,
            this.componentRegistry,
            true,
        );

        // tslint:disable-next-line: no-floating-promises
        runtimeP.then(async (runtime) => {
            if (!runtime.existing) {
                const viewResponse = await runtime.request({ url : SimpleContainerRuntimeFactory.defaultComponentId });
                const viewComponent = viewResponse.value as ExternalComponentView;
                const loaderComponent =
                    await SimpleContainerRuntimeFactory.createAndAttachComponent<ExternalComponentLoader>(
                        runtime,
                        loaderComponentId,
                        this.loaderComponentName);
                loaderComponent.setViewComponent(viewComponent);
                if (viewComponent.IComponentCollection) {
                    viewComponent.IComponentCollection.createCollectionItem(loaderComponent);
                }
            }
        });
        return runtimeP;
    }
}
