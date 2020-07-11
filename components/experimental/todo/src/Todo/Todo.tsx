/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/component-core-interfaces";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";
import { ITodoItemInitialState, TodoItem } from "../TodoItem/index";
import { TodoView } from "./TodoView";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
export const TodoName = `${pkg.name as string}-todo`;

/**
 * Todo base component.
 * Visually contains the following:
 * - Title
 * - New todo item entry
 * - List of todo items
 */
export class Todo extends PrimedComponent implements IComponentHTMLView {
    // DDS ids stored as variables to minimize simple string mistakes
    private readonly todoItemsKey = "todo-items";
    private readonly todoTitleKey = "todo-title";

    private todoItemsMap: ISharedMap;

    public get IComponentHTMLView() { return this; }

    // Would prefer not to hand this out, and instead give back a title component?
    public async getTodoTitleString() {
        return this.root.get<IFluidHandle<SharedString>>(this.todoTitleKey).get();
    }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        // Create a list for of all inner todo item components.
        // We will use this to know what components to load.
        const map = SharedMap.create(this.runtime);
        this.root.set(this.todoItemsKey, map.handle);

        const text = SharedString.create(this.runtime);
        text.insertText(0, "Title");
        this.root.set(this.todoTitleKey, text.handle);
    }

    protected async componentHasInitialized() {
        this.todoItemsMap = await this.root.get<IFluidHandle<ISharedMap>>(this.todoItemsKey).get();
        // Hide the DDS eventing used by the model, expose a model-specific event interface.
        this.todoItemsMap.on("op", (op, local) => {
            if (!local) {
                this.emit("todoItemsChanged");
            }
        });
    }

    // start IComponentHTMLView

    /**
     * Creates a new view for a caller that doesn't directly support React
     */
    public render(div: HTMLElement) {
        // Because we are using React and our caller is not we will use the
        // ReactDOM to render our JSX.Element directly into the provided div.
        ReactDOM.render(
            <TodoView todoModel={this} />,
            div,
        );
    }

    // end IComponentHTMLView

    // start public API surface for the Todo model, used by the view

    public async addTodoItemComponent(props?: ITodoItemInitialState) {
        // Create a new todo item
        const component = await TodoItem.getFactory().createComponent(this.context, props);

        // Store the id of the component in our ids map so we can reference it later
        this.todoItemsMap.set(component.url, component.handle);

        this.emit("todoItemsChanged");
    }

    public async getTodoItemComponents() {
        const todoItemComponentPromises: Promise<TodoItem>[] = [];
        for (const handle of this.todoItemsMap.values()) {
            todoItemComponentPromises.push(handle.get());
        }

        return Promise.all(todoItemComponentPromises);
    }

    // end public API surface for the Todo model, used by the view
}
