/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { ContainerRuntimeFactoryWithDefaultComponent } from "@fluidframework/aqueduct";
import { WaterPark } from "./waterPark";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    WaterPark.ComponentName,
    new Map([
        [WaterPark.ComponentName, Promise.resolve(WaterPark.getFactory())],
    ]),
);
