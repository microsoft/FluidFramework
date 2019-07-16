/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ClickerFactoryComponent, ClickerName } from "@chaincode/clicker";
import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { TextBoxInstantiationFactory, TextBoxName } from "./TextBox";
import { TodoInstantiationFactory, TodoName } from "./Todo";
import { TodoItemInstantiationFactory, TodoItemName } from "./TodoItem";

export const fluidExport = new SimpleModuleInstantiationFactory(
    TodoName,
    new Map([
        [TodoName, Promise.resolve(TodoInstantiationFactory)],
        [TodoItemName, Promise.resolve(TodoItemInstantiationFactory)],
        [TextBoxName, Promise.resolve(TextBoxInstantiationFactory)],
        [ClickerName, Promise.resolve(new ClickerFactoryComponent())],
    ]),
);
