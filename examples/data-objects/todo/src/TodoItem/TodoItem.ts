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
 * - Boolean stored in the root SharedDirectory for the checkbox
 * - SharedString for the item's text
 * - SharedString for the item's detailed text
 */
export class TodoItem extends DataObject<{ InitialState: ITodoItemInitialState; }> {
    private text: SharedString;
    private detailedText: SharedString;

    protected async initializingFirstTime(initialState?: ITodoItemInitialState) {
        // The text of the todo item, with initial value if it was provided
        const newItemText = initialState?.startingText ?? "New Item";
        const text = SharedString.create(this.runtime);
        text.insertText(0, newItemText);
        this.root.set(textKey, text.handle);

        // The detailed text of the todo item
        const detailedText = SharedString.create(this.runtime);
        this.root.set(detailedTextKey, detailedText.handle);

        // The state of the checkbox
        this.root.set(checkedKey, false);
    }

    protected async hasInitialized() {
        const textP = this.root.get<IFluidHandle<SharedString>>(textKey).get();
        const detailedTextP = this.root.get<IFluidHandle<SharedString>>(detailedTextKey).get();

        [this.text, this.detailedText] = await Promise.all([textP, detailedTextP]);

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
    public getText() {
        return this.text;
    }

    // Would prefer not to hand this out, and instead give back a component?
    public getDetailedText(): SharedString {
        return this.detailedText;
    }

    public getCheckedState(): boolean {
        return this.root.get(checkedKey);
    }

    public setCheckedState(newState: boolean): void {
        this.root.set(checkedKey, newState);
        this.emit("stateChanged");
    }

    // end public API surface for the TodoItem model, used by the view
}
