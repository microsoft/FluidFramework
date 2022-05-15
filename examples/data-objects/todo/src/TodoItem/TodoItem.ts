/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IValueChanged } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";

export interface ITodoItemInitialState {
    startingText: string;
}

const checkedKey = "checked";
const textKey = "text";
const detailedTextKey = "detailedText";

/**
 * Todo Item is a singular todo entry consisting of:
 * - Checkbox
 * - Collaborative string
 * - Embedded component
 * - Link to open component in separate tab
 * - Button to remove entry
 */
export class TodoItem extends DataObject<{ InitialState: ITodoItemInitialState; }> {
    private text: SharedString;
    private detailedText: SharedString;

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

        const detailedText = SharedString.create(this.runtime);
        this.root.set(detailedTextKey, detailedText.handle);
    }

    protected async hasInitialized() {
        const textP = this.root.get<IFluidHandle<SharedString>>(textKey).get();
        const detailedTextP = this.root.get<IFluidHandle<SharedString>>(detailedTextKey).get();

        this.setCheckedState = this.setCheckedState.bind(this);

        [
            this.text,
            this.detailedText,
        ] = await Promise.all([
            textP,
            detailedTextP,
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
        );

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

    // Would prefer not to hand this out, and instead give back a component?
    public getDetailedText(): SharedString {
        return this.detailedText;
    }

    // end public API surface for the TodoItem model, used by the view
}
