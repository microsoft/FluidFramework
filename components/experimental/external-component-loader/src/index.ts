/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { WaterPark } from "./waterPark";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    WaterPark.getFactory().type,
    [WaterPark.getFactory()],
);
