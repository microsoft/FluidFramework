/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DefaultComponentContainerRuntimeFactory } from "@microsoft/fluid-aqueduct";
import { TodoInstantiationFactory, TodoName } from "./Todo";

export const fluidExport = new DefaultComponentContainerRuntimeFactory(
    TodoName,
    new Map([
        [TodoName, Promise.resolve(TodoInstantiationFactory)],
    ]),
);
