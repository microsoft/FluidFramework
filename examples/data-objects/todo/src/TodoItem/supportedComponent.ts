/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Clicker } from "@fluid-example/clicker";
import { FluidObject } from "@fluidframework/core-interfaces";
import { TextBox } from "../TextBox";
import { TextList } from "../TextList";
import { TodoItem } from "./TodoItem";

/**
 * Components supported by the TodoItem component
 */
export type TodoItemSupportedComponents = "todo" | "clicker" | "textBox" | "textList";

interface ITodoItemInnerComponentBase {
    type: TodoItemSupportedComponents;
    component: FluidObject;
}

interface ITodoItemInnerTodoComponent extends ITodoItemInnerComponentBase {
    type: "todo";
    component: TodoItem;
}

interface ITodoItemInnerClickerComponent extends ITodoItemInnerComponentBase {
    type: "clicker";
    component: Clicker;
}

interface ITodoItemInnerTextBoxComponent extends ITodoItemInnerComponentBase {
    type: "textBox";
    component: TextBox;
}

interface ITodoItemInnerTextListComponent extends ITodoItemInnerComponentBase {
    type: "textList";
    component: TextList;
}

export type ITodoItemInnerComponent =
    ITodoItemInnerTodoComponent
    | ITodoItemInnerClickerComponent
    | ITodoItemInnerTextBoxComponent
    | ITodoItemInnerTextListComponent;
