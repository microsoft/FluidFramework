/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { FluidDataStoreRegistry } from "@fluidframework/runtime-utils";
import { TodoInstantiationFactory, TodoName } from "./Todo";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    TodoName,
    new FluidDataStoreRegistry([
        [TodoName, Promise.resolve(TodoInstantiationFactory)],
    ]),
);
