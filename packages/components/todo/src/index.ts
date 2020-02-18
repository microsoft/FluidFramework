/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { RequestParser } from "@microsoft/fluid-container-runtime";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { OrchestratorInstantiationFactory, OrchestratorName } from "./Orchestrator";
import { TodoView } from "./Todo";
import { TodoItemView } from "./TodoItem";

async function viewRequestHandler(request: IRequest, runtime: IHostRuntime) {
    const requestParser = new RequestParser(request);
    const pathParts = requestParser.pathParts;

    if (pathParts[0] === "TodoView") {
        const modelRequest = requestParser.createSubRequest(1);
        return TodoView.request(modelRequest, runtime);
    } else if (pathParts[0] === "TodoItemView") {
        const modelRequest = requestParser.createSubRequest(1);
        return TodoItemView.request(modelRequest, runtime);
    }
}

export const fluidExport = new SimpleModuleInstantiationFactory(
    OrchestratorName,
    new Map([
        [OrchestratorName, Promise.resolve(OrchestratorInstantiationFactory)],
    ]),
    [],
    [viewRequestHandler],
);
