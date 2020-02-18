/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { OrchestratorInstantiationFactory, OrchestratorName } from "./Orchestrator";
import { todoViewRequestHandler } from "./Todo";
import { todoItemViewRequestHandler } from "./TodoItem";

export const fluidExport = new SimpleModuleInstantiationFactory(
    OrchestratorName,
    new Map([
        [OrchestratorName, Promise.resolve(OrchestratorInstantiationFactory)],
    ]),
    [],
    [todoItemViewRequestHandler, todoViewRequestHandler],
);
