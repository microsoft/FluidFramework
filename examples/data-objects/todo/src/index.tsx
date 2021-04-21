/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { TodoInstantiationFactory, TodoName } from "./Todo";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    TodoInstantiationFactory,
    new Map([
        [TodoName, Promise.resolve(TodoInstantiationFactory)],
    ]),
);
