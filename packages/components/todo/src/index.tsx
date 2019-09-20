/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerInstantiationFactory, ClickerName } from "@fluid-example/clicker";
import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { TextBoxInstantiationFactory, TextBoxName } from "./TextBox";
import { TextListInstantiationFactory, TextListName } from "./TextList";
import { TodoInstantiationFactory, TodoName } from "./Todo";
import { TodoItemInstantiationFactory, TodoItemName } from "./TodoItem";

export const fluidExport = new SimpleModuleInstantiationFactory(
    TodoName,
    new Map([
        [TodoName, Promise.resolve(TodoInstantiationFactory)],
        [TodoItemName, Promise.resolve(TodoItemInstantiationFactory)],
        [TextBoxName, Promise.resolve(TextBoxInstantiationFactory)],
        [TextListName, Promise.resolve(TextListInstantiationFactory)],
        [ClickerName, Promise.resolve(ClickerInstantiationFactory)],
    ]),
);
