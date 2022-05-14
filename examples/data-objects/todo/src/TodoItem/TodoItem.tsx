/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IValueChanged } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";
import { TextBox, TextBoxInstantiationFactory } from "../TextBox";
import { TodoItemView } from "./TodoItemView";

export interface ITodoItemInitialState {
    startingText: string;
}

const checkedKey = "checked";
const textKey = "text";
const innerComponentKey = "innerId";

/**
 * Todo Item is a singular todo entry consisting of:
 * - Checkbox
 * - Collaborative string
 * - Embedded component
 * - Link to open component in separate tab
 * - Button to remove entry
 */
export class TodoItem extends DataObject<{ InitialState: ITodoItemInitialState; }> implements IFluidHTMLView {
    private text: SharedString;
    private innerComponent: TextBox | undefined;

    public get IFluidHTMLView() { return this; }

    /**
     * Do creation work
     */
    protected async initializingFirstTime(initialState?: ITodoItemInitialState) {
        // Set initial state if it was provided
        const newItemText = initialState?.startingText ?? "New Item";

        // The text of the todo item
        const text = SharedString.create(this.runtime);
        text.insertText(0, newItemText);
        this.root.set(textKey, text.handle);

        // The state of the checkbox
        this.root.set(checkedKey, false);

        // Each Todo Item has one inner component that it can have. This value is originally empty since we let the
        // user choose the component they want to embed. We store it in a cell for easier event handling.
        const textBox = await TextBoxInstantiationFactory.createChildInstance(this.context);
        this.root.set(innerComponentKey, textBox.handle);
    }

    protected async hasInitialized() {
        const text = this.root.get<IFluidHandle<SharedString>>(textKey).get();
        const innerComponent = this.root.get<IFluidHandle<TextBox>>(innerComponentKey).get();

        this.setCheckedState = this.setCheckedState.bind(this);

        [
            this.text,
            this.innerComponent,
        ] = await Promise.all([
            text,
            innerComponent,
        ]);

        this.root.on("valueChanged", (changed: IValueChanged, local: boolean) => {
            if (!local) {
                if (changed.key === checkedKey) {
                    this.emit("checkedStateChanged");
                    this.emit("stateChanged");
                }
            }
        });
    }

    public static getFactory() { return TodoItem.factory; }

    private static readonly factory =
        new DataObjectFactory(
            "@fluid-example/todo-item",
            TodoItem,
            [
                SharedString.getFactory(),
            ],
            {},
            new Map([
                TextBoxInstantiationFactory.registryEntry,
            ]),
        );

    // start IFluidHTMLView

    public render(div: HTMLElement) {
        // TODO: Temporary - this should ultimately come from the app, who controls the URL format.
        const getDirectLink = (itemId: string) => {
            const pathParts = window.location.pathname.split("/");
            const containerName = pathParts[2];

            return `/doc/${containerName}/${itemId}`;
        };
        ReactDOM.render(
            <TodoItemView todoItemModel={this} getDirectLink={getDirectLink}/>,
            div,
        );
    }

    // end IFluidHTMLView

    // start public API surface for the TodoItem model, used by the view

    // Would prefer not to hand this out, and instead give back a component?
    public getTodoItemText() {
        return this.text;
    }

    public setCheckedState(newState: boolean): void {
        this.root.set(checkedKey, newState);
        this.emit("stateChanged");
    }

    public getCheckedState(): boolean {
        return this.root.get(checkedKey);
    }

    public getInnerComponent(): TextBox {
        return this.innerComponent;
    }

    // end public API surface for the TodoItem model, used by the view
}
