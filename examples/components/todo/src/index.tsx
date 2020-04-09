/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { TodoInstantiationFactory, TodoName } from "./Todo";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    TodoName,
    new Map([
        [TodoName, Promise.resolve(TodoInstantiationFactory)],
    ]),
);
