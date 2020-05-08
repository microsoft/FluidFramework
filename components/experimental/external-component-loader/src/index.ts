/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { SpacesComponentName, Spaces } from "@fluid-example/spaces";
import { ExternalComponentLoader } from "./externalComponentLoader";
import { WaterParkContainerRuntimeFactory } from "./waterParkContainerRuntimeFactory";

export const fluidExport = new WaterParkContainerRuntimeFactory(
    new Map([
        [ExternalComponentLoader.ComponentName, Promise.resolve(ExternalComponentLoader.getFactory())],
        [SpacesComponentName, Promise.resolve(Spaces.getFactory())],
    ]),
);
