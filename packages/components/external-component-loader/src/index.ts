/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { SpacesComponentName, Spaces, ComponentToolbarName, ComponentToolbar } from "@fluid-example/spaces";
import { WaterParkLoaderInstantiationFactory, WaterParkLoaderName } from "./waterParkLoader";
import { WaterParkModuleInstantiationFactory } from "./waterParkModuleInstantiationFactory";

// TODO: Why does ComponentToolbar need to be added here
export const fluidExport = new WaterParkModuleInstantiationFactory(
    new Map([
        [WaterParkLoaderName, Promise.resolve(WaterParkLoaderInstantiationFactory)],
        [SpacesComponentName, Promise.resolve(Spaces.getFactory())],
        [ComponentToolbarName, Promise.resolve(ComponentToolbar.getFactory())],
    ]),
);
