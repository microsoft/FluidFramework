/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { TodoInstantiationFactory, TodoName } from "../Todo";
import { Orchestrator } from "./index";

export const OrchestratorInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    Orchestrator,
    [],
    new Map([
        [TodoName, Promise.resolve(TodoInstantiationFactory)],
    ]),
);
