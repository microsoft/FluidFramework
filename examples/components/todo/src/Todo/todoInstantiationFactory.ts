/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SharedCell } from "@microsoft/fluid-cell";
import { SharedMap } from "@microsoft/fluid-map";
import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { TodoItemInstantiationFactory, TodoItemName } from "../TodoItem";

import { TodoName } from "./Todo";
import { Todo } from "./index";

export const TodoInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    TodoName,
    Todo,
    [
        SharedMap.getFactory(),
        SharedString.getFactory(),
        SharedCell.getFactory(),
    ],
    {},
    {},
    new Map([
        [TodoItemName, Promise.resolve(TodoItemInstantiationFactory)],
    ]),
);
