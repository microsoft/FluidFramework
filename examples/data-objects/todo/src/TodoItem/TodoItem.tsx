/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Clicker, ClickerInstantiationFactory } from "@fluid-example/clicker";
import { DataObject, DataObjectFactory, waitForAttach } from "@fluidframework/aqueduct";
import { ISharedCell, SharedCell } from "@fluidframework/cell";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { IValueChanged } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";
import { TextBox, TextBoxInstantiationFactory } from "../TextBox";
import { TextList, TextListInstantiationFactory } from "../TextList";
import { ITodoItemInnerComponent, TodoItemSupportedComponents } from "./supportedComponent";
import { TodoItemView } from "./TodoItemView";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
export const TodoItemName = `${pkg.name as string}-item`;

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
    private innerIdCell: ISharedCell<{ type: TodoItemSupportedComponents; handle: IFluidHandle; }>;
    private _absoluteUrl: string | undefined;

    public get IFluidHTMLView() { return this; }
    public get absoluteUrl() { return this._absoluteUrl; }

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
        const innerIdCell = SharedCell.create(this.runtime);
        innerIdCell.set(undefined);
        this.root.set(innerComponentKey, innerIdCell.handle);
    }

    protected async hasInitialized() {
        const text = this.root.get<IFluidHandle<SharedString>>(textKey).get();
        const innerIdCell = this.root.get<IFluidHandle<ISharedCell>>(innerComponentKey).get();

        this.setCheckedState = this.setCheckedState.bind(this);

        [
            this.text,
            this.innerIdCell,
        ] = await Promise.all([
            text,
            innerIdCell,
        ]);

        this.innerIdCell.on("op", (op, local) => {
            if (!local) {
                this.emit("innerComponentChanged");
            }
        });

        this.root.on("valueChanged", (changed: IValueChanged, local: boolean) => {
            if (!local) {
                if (changed.key === checkedKey) {
                    this.emit("checkedStateChanged");
                    this.emit("stateChanged");
                }
            }
        });

        waitForAttach(this.runtime)
            .then(async () => {
                const url = await this.context.getAbsoluteUrl(this.handle.absolutePath);
                this._absoluteUrl = url;
                this.emit("stateChanged");
            })
            .catch(console.error);
    }

    public static getFactory() { return TodoItem.factory; }

    private static readonly factory =
        new DataObjectFactory(
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

    // start IFluidHTMLView

    public render(div: HTMLElement) {
        ReactDOM.render(
            <TodoItemView todoItemModel={this} />,
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

    public hasInnerComponent(): boolean {
        return this.innerIdCell.get() !== undefined;
    }

    public async getInnerComponent(): Promise<ITodoItemInnerComponent> {
        const innerComponentInfo = this.innerIdCell.get();
        if (innerComponentInfo === undefined) {
            return undefined;
        }

        switch (innerComponentInfo.type) {
            case "todo":
                return {
                    type: innerComponentInfo.type,
                    component: await innerComponentInfo.handle.get() as TodoItem,
                };
            case "clicker":
                return {
                    type: innerComponentInfo.type,
                    component: await innerComponentInfo.handle.get() as Clicker,
                };
            case "textBox":
                return {
                    type: innerComponentInfo.type,
                    component: await innerComponentInfo.handle.get() as TextBox,
                };
            case "textList":
                return {
                    type: innerComponentInfo.type,
                    component: await innerComponentInfo.handle.get() as TextList,
                };
            default:
                throw new Error("Unknown inner component type");
        }
    }

    /**
     * The Todo Item can embed multiple types of components. This is where these components are defined.
     * @param type - component to be created
     * @param props - props to be passed into component creation
     */
    public async createInnerComponent(type: TodoItemSupportedComponents): Promise<void> {
        let component: IFluidLoadable;
        switch (type) {
            case "todo":
                component = await TodoItem.getFactory().createPeerInstance(
                    this.context,
                    { startingText: type },
                );
                break;
            case "clicker":
                component = await ClickerInstantiationFactory.createChildInstance(this.context);
                break;
            case "textBox":
                component = await TextBoxInstantiationFactory.createChildInstance(this.context, type);
                break;
            case "textList":
                component = await TextListInstantiationFactory.createChildInstance(this.context);
                break;
            default:
        }

        // Update the inner component id
        this.innerIdCell.set({ type, handle: component.handle });

        this.emit("innerComponentChanged");
    }

    // end public API surface for the TodoItem model, used by the view
}
