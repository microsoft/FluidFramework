/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { SpacesComponentName, Spaces } from "@fluid-example/spaces";
import { ExternalComponentLoader } from "./externalComponentLoader";
import { WaterParkModuleInstantiationFactory } from "./waterParkModuleInstantiationFactory";

export const fluidExport = new WaterParkModuleInstantiationFactory(
    new Map([
        [ExternalComponentLoader.ComponentName, Promise.resolve(ExternalComponentLoader.getFactory())],
        [SpacesComponentName, Promise.resolve(Spaces.getFactory())],
    ]),
);
