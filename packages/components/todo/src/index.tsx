/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { TodoInstantiationFactory, TodoName } from "./Todo";
import { todoItemViewRequestHandler } from "./TodoItem";

export const fluidExport = new SimpleModuleInstantiationFactory(
    TodoName,
    new Map([
        [TodoName, Promise.resolve(TodoInstantiationFactory)],
    ]),
    [todoItemViewRequestHandler],
);
