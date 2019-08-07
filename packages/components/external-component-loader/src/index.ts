/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { UrlRegistry } from "./urlRegistry";
import { WaterParkLoaderInstantiationFactory, WaterParkLoaderName } from "./waterParkLoader";
import { WaterParkViewInstantiationFactory, WaterParkViewName } from "./waterParkView";

export const fluidExport = new SimpleModuleInstantiationFactory(
    WaterParkLoaderName,
    new UrlRegistry(
        new Map([
            [WaterParkLoaderName, Promise.resolve(WaterParkLoaderInstantiationFactory)],
            [WaterParkViewName, Promise.resolve(WaterParkViewInstantiationFactory)],
        ])));
