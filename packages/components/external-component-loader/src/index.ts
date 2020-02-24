/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { WaterParkLoaderInstantiationFactory, WaterParkLoaderName } from "./waterParkLoader";
import { WaterParkModuleInstantiationFactory } from "./waterParkModuleInstantiationFactory";
import { SpacesComponentName, SpacesInstantiationFactory } from "./spaces";

export const fluidExport = new WaterParkModuleInstantiationFactory(
    new Map([
        [WaterParkLoaderName, Promise.resolve(WaterParkLoaderInstantiationFactory)],
        [SpacesComponentName, Promise.resolve(SpacesInstantiationFactory)],
    ]),
);
