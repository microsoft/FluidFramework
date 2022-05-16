/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject } from "@fluidframework/aqueduct";
import { IFluidHandle, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { RequestParser } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
// import { v4 as uuid } from "uuid";
import { ITodoItemInitialState, TodoItem } from "../TodoItem/index";

export const TodoName = "Todo";

interface ITodoStorageFormat {
    index: string;
    handle: IFluidHandle<TodoItem>;
}

/**
 * Todo base component.
 * Visually contains the following:
 * - Title
 * - New todo item entry
 * - List of todo items
 */
export class Todo extends DataObject {
    // DDS ids stored as variables to minimize simple string mistakes
    private readonly todoItemsKey = "todo-items";
    private readonly todoTitleKey = "todo-title";

    private todoItemsMap: ISharedMap;

    // Todo uses request handling similar to the collection pattern, though the TodoItems are actually distinct
    // data stores in this case (whereas in the collection pattern, the items are not distinct data stores).
    // We'll respond to subrequests to return specific TodoItems.
    public async request(request: IRequest): Promise<IResponse> {
        const requestParser = RequestParser.create(request);
        // We interpret the first path part as the id of the TodoItem that we should retrieve
        if (requestParser.pathParts.length === 1) {
            const todoItem = this.getTodoItem(requestParser.pathParts[0]);
            console.log(todoItem);
            return { mimeType: "fluid/object", status: 200, value: todoItem };
        }
        // Otherwise we'll return the Todo itself
        return super.request(request);
    }

    /**
     * Do setup work here
     */
    protected async initializingFirstTime() {
        // Create a list for of all inner todo item components.
        // We will use this to know what components to load.
        const map = SharedMap.create(this.runtime);
        this.root.set(this.todoItemsKey, map.handle);

        const text = SharedString.create(this.runtime);
        text.insertText(0, "Title");
        this.root.set(this.todoTitleKey, text.handle);
    }

    protected async hasInitialized() {
        this.todoItemsMap = await this.root.get<IFluidHandle<ISharedMap>>(this.todoItemsKey).get();
        // Hide the DDS eventing used by the model, expose a model-specific event interface.
        this.todoItemsMap.on("valueChanged", (changed, local) => {
            if (!local) {
                this.emit("todoItemsChanged");
            }
        });
    }

    // start public API surface for the Todo model, used by the view

    // Would prefer not to hand this out, and instead give back a title component?
    public async getTodoTitleString() {
        return this.root.get<IFluidHandle<SharedString>>(this.todoTitleKey).get();
    }

    public async addTodoItem(props?: ITodoItemInitialState) {
        // Create a new todo item
        const todoItem = await TodoItem.getFactory().createChildInstance(this.context, props);

        // Generate a key that we can sort on later, and store the handle.
        this.todoItemsMap.set(
            todoItem.id,
            {
                index: `${Date.now()}-${todoItem.id}`,
                handle: todoItem.handle,
            },
        );

        this.emit("todoItemsChanged");
    }

    public async getTodoItems() {
        const todoItemsEntries: [string, ITodoStorageFormat][] = [...this.todoItemsMap.entries()];
        todoItemsEntries.sort((entryA, entryB) => {
            // Sort on keys as strings
            return entryA[1].index.localeCompare(entryB[1].index);
        });
        const todoItemComponentPromises = todoItemsEntries.map(async (entry) => entry[1].handle.get());

        return Promise.all(todoItemComponentPromises);
    }

    public async getTodoItem(id: string) {
        return this.todoItemsMap.get(id)?.handle.get() as Promise<TodoItem>;
    }

    public async deleteTodoItem(id: string) {
        if (this.todoItemsMap.delete(id)) {
            this.emit("todoItemsChanged");
        }
    }

    // end public API surface for the Todo model, used by the view
}
