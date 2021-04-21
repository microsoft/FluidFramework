/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SequenceDeltaEvent, SharedObjectSequence, SharedString } from "@fluidframework/sequence";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";
import { ITodoItemInitialState, TodoItem } from "../TodoItem/index";
import { TodoView } from "./TodoView";

export const TodoName = "Todo";

/**
 * Todo base component.
 * Visually contains the following:
 * - Title
 * - New todo item entry
 * - List of todo items
 */
export class Todo extends DataObject implements IFluidHTMLView {
    // DDS ids stored as variables to minimize simple string mistakes
    private readonly todoItemsKey = "todo-items";
    private readonly todoTitleKey = "todo-title";

    private todoItems: SharedObjectSequence<IFluidHandle<TodoItem>>;

    public get IFluidHTMLView() { return this; }

    // Would prefer not to hand this out, and instead give back a title component?
    public async getTodoTitleString() {
        return this.root.get<IFluidHandle<SharedString>>(this.todoTitleKey).get();
    }

    /**
     * Do setup work here
     */
    protected async initializingFirstTime() {
        // Create a list for of all inner todo item components.
        // We will use this to know what components to load.
        const seq = SharedObjectSequence.create(this.runtime);
        this.root.set(this.todoItemsKey, seq.handle);

        const text = SharedString.create(this.runtime);
        text.insertText(0, "Title");
        this.root.set(this.todoTitleKey, text.handle);
    }

    protected async hasInitialized() {
        this.todoItems =
            await this.root.get<IFluidHandle<SharedObjectSequence<IFluidHandle<TodoItem>>>>(this.todoItemsKey).get();
        // Hide the DDS eventing used by the model, expose a model-specific event interface.
        this.todoItems.on("sequenceDelta",(event: SequenceDeltaEvent)=>{
            this.emit("todoItemsChanged");
        });
    }

    // start IFluidHTMLView

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

    // end IFluidHTMLView

    // start public API surface for the Todo model, used by the view

    public async addTodoItemComponent(props?: ITodoItemInitialState) {
        // Create a new todo item
        const component = await TodoItem.getFactory().createChildInstance(this.context, props);

        // Store the handle to the component in the sequence
        this.todoItems.insert(this.todoItems.getLength(), [component.handle]);
    }

    public async getTodoItemComponents() {
        return Promise.all(
            this.todoItems.getItems(0).map(async (i)=>i.get()));
    }

    // end public API surface for the Todo model, used by the view
}
