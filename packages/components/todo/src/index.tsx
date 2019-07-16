/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ClickerFactoryComponent, ClickerName } from "@chaincode/clicker";
import { StockModuleInstantiationFactory } from "@prague/aqueduct";
import { TextBoxInstantiationFactory, TextBoxName } from "./TextBox";
import { TodoInstantiationFactory, TodoName } from "./Todo";
import { TodoItemInstantiationFactory, TodoItemName } from "./TodoItem";

export const fluidExport = new StockModuleInstantiationFactory (
    TodoName,
    new Map([
        [TodoName, Promise.resolve(new TodoInstantiationFactory())],
        [TodoItemName, Promise.resolve(new TodoItemInstantiationFactory())],
        [TextBoxName, Promise.resolve(new TextBoxInstantiationFactory())],
        [ClickerName, Promise.resolve(new ClickerFactoryComponent())],
    ]));
