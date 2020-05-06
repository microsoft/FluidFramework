/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { SpacesComponentName, Spaces } from "@fluid-example/spaces";
import { WaterParkLoaderInstantiationFactory, WaterParkLoaderName } from "./waterParkLoader";
import { WaterParkModuleInstantiationFactory } from "./waterParkModuleInstantiationFactory";

export const fluidExport = new WaterParkModuleInstantiationFactory(
    new Map([
        [WaterParkLoaderName, Promise.resolve(WaterParkLoaderInstantiationFactory)],
        [SpacesComponentName, Promise.resolve(Spaces.getFactory())],
    ]),
);
