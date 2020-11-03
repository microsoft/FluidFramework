/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithScope } from "@fluidframework/aqueduct";
import { TodoInstantiationFactory, TodoName } from "./Todo";

export const fluidExport = new ContainerRuntimeFactoryWithScope(
    TodoInstantiationFactory,
    new Map([
        [TodoName, Promise.resolve(TodoInstantiationFactory)],
    ]),
);
