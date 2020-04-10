/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerInstantiationFactory, ClickerName } from "@fluid-example/clicker";
import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SharedCell } from "@microsoft/fluid-cell";
import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { TextBoxInstantiationFactory, TextBoxName } from "../TextBox";
import { TextListInstantiationFactory, TextListName } from "../TextList";
import { TodoItemName } from "./TodoItem";
import { TodoItem } from "./index";

export const TodoItemInstantiationFactory: IComponentFactory = new PrimedComponentFactory(
    TodoItemName,
    TodoItem,
    [
        SharedString.getFactory(),
        SharedCell.getFactory(),
    ],
    new Map([
        [TextBoxName, Promise.resolve(TextBoxInstantiationFactory)],
        [TextListName, Promise.resolve(TextListInstantiationFactory)],
        [ClickerName, Promise.resolve(ClickerInstantiationFactory)],
    ]),
);
