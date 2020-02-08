/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { IComponentReactViewable } from "@microsoft/fluid-aqueduct-react";
import { IComponentHandle, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as uuid from "uuid";
import { TodoItem, TodoItemName } from "../TodoItem/index";
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
export class Todo extends PrimedComponent implements IComponentHTMLVisual, IComponentReactViewable {

    // DDS ids stored as variables to minimize simple string mistakes
    private readonly todoItemsKey = "todo-items";
    private readonly todoTitleKey = "todo-title";

    private todoItemsMap: ISharedMap;

    public get IComponentHTMLVisual() { return this; }
    public get IComponentReactViewable() { return this; }

    // Would prefer not to hand this out, and instead give back a title component?
    public async getTodoTitleString() {
        return this.root.get<IComponentHandle>(this.todoTitleKey).get<SharedString>();
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
        this.todoItemsMap = await this.root.get<IComponentHandle>(this.todoItemsKey).get<ISharedMap>();
        // Hide the DDS eventing used by the model, expose a model-specific event interface.
        this.todoItemsMap.on("op", (op, local) => {
            if (!local) {
                this.emit("todoItemsChanged");
            }
        });
    }

    // start IComponentHTMLVisual

    /**
     * Creates a new view for a caller that doesn't directly support React
     */
    public render(div: HTMLElement) {
        // Because we are using React and our caller is not we will use the
        // ReactDOM to render our JSX.Element directly into the provided div.
        // Because we support IComponentReactViewable and createViewElement returns a JSX.Element
        // we can just call that and minimize duplicate code.
        ReactDOM.render(
            this.createJSXElement(),
            div,
        );
    }

    // end IComponentHTMLVisual

    // start IComponentReactViewable

    /**
     * If our caller supports React they can query against the IComponentReactViewable
     * Since this returns a JSX.Element it allows for an easier model.
     */
    public createJSXElement(): JSX.Element {
        return (
            <TodoView todoModel={this} />
        );
    }

    // end IComponentReactViewable

    // start public API surface for the Todo model, used by the view

    public async addTodoItemComponent(props?: any) {

        // Create a new todo item
        const componentRuntime: IComponentRuntime = await this.context.createComponent(uuid(), TodoItemName, props);
        await componentRuntime.request({ url: "/" });
        componentRuntime.attach();

        // Store the id of the component in our ids map so we can reference it later
        this.todoItemsMap.set(componentRuntime.id, "");

        this.emit("todoItemsChanged");
    }

    public async getTodoItemComponents() {
        const todoItemComponentPromises: Promise<TodoItem>[] = [];
        for (const id of this.todoItemsMap.keys()) {
            todoItemComponentPromises.push(this.getComponent<TodoItem>(id));
        }

        return Promise.all(todoItemComponentPromises);
    }

    // end public API surface for the Todo model, used by the view
}
