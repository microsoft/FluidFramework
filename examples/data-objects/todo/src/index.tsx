/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { createDataStoreRegistry } from "@fluidframework/runtime-utils";
import { TodoInstantiationFactory, TodoName } from "./Todo";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    TodoInstantiationFactory,
    createDataStoreRegistry([
        [TodoName, Promise.resolve(TodoInstantiationFactory)],
    ]),
);
