/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SharedCell } from "@microsoft/fluid-cell";
import { SharedString } from "@microsoft/fluid-sequence";
import { TextBoxInstantiationFactory } from "../TextBox";
import { TextListInstantiationFactory } from "../TextList";
import { ITodoItemInitialState, TodoItemName } from "./TodoItem";
import { TodoItem } from "./index";

export const TodoItemInstantiationFactory =
    new PrimedComponentFactory<ITodoItemInitialState>(
        TodoItemName,
        TodoItem,
        [
            SharedString.getFactory(),
            SharedCell.getFactory(),
        ],
        {},
        new Map([
            TextBoxInstantiationFactory.registryEntry,
            TextListInstantiationFactory.registryEntry,
            ClickerInstantiationFactory.registryEntry,
        ]),
    );
