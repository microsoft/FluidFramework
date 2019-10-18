/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { WaterParkLoaderInstantiationFactory, WaterParkLoaderName } from "./waterParkLoader";
import { WaterParkModuleInstantiationFactory } from "./waterParkModuleInstantiationFactory";
import { WaterParkViewInstantiationFactory, WaterParkViewName } from "./waterParkView";

export const fluidExport = new WaterParkModuleInstantiationFactory(
    new Map([
        [WaterParkLoaderName, Promise.resolve(WaterParkLoaderInstantiationFactory)],
        [WaterParkViewName, Promise.resolve(WaterParkViewInstantiationFactory)],
    ]),
);
