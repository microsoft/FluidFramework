/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { ISharedCell, SharedCell } from "@microsoft/fluid-cell";
import {
    IComponentHandle, IComponentLoadable,
} from "@microsoft/fluid-component-core-interfaces";
import { IValueChanged } from "@microsoft/fluid-map";
import { SharedString } from "@microsoft/fluid-sequence";
import { TextBoxInstantiationFactory } from "../TextBox";
import { TextListInstantiationFactory } from "../TextList";
import { TodoItemSupportedComponents } from "./supportedComponent";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
export const TodoItemName = `${pkg.name as string}-item`;

export interface ITodoItemInitialState {
    startingText: string;
    baseUrl?: string;
}

const checkedKey = "checked";
const textKey = "text";
const baseUrlKey = "baseUrl";
const innerComponentHandleKey = "innerComponentHandle";
const innerComponentTypeKey = "innerComponentType";

/**
 * Todo Item is a singular todo entry consisting of:
 * - Checkbox
 * - Collaborative string
 * - Embedded component
 * - Link to open component in separate tab
 * - Button to remove entry
 */
export class TodoItem extends PrimedComponent<{}, ITodoItemInitialState> {
    private text: SharedString;
    private innerIdCell: ISharedCell;
    private baseUrl: string = "";

    /**
     * Do creation work
     */
    protected async componentInitializingFirstTime(initialState?: ITodoItemInitialState) {
        // Set initial state if it was provided
        const newItemText = initialState?.startingText ?? "New Item";
        this.baseUrl = initialState?.baseUrl ?? "";

        // The text of the todo item
        const text = SharedString.create(this.runtime);
        text.insertText(0, newItemText);
        this.root.set(textKey, text.handle);

        // The state of the checkbox
        this.root.set(checkedKey, false);
        this.root.set(baseUrlKey, this.baseUrl);

        // Each Todo Item has one inner component that it can have. This value is originally empty since we let the
        // user choose the component they want to embed. We store it in a cell for easier event handling.
        const innerIdCell = SharedCell.create(this.runtime);
        innerIdCell.set(undefined);
        this.root.set(innerComponentHandleKey, innerIdCell.handle);
    }

    protected async componentHasInitialized() {
        const text = this.root.get<IComponentHandle<SharedString>>(textKey).get();
        const innerIdCell = this.root.get<IComponentHandle<ISharedCell>>(innerComponentHandleKey).get();
        this.baseUrl = this.root.get(baseUrlKey);

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
                }
            }
        });
    }

    public static getFactory() { return TodoItem.factory; }

    private static readonly factory = new PrimedComponentFactory(
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

    // start public API surface for the TodoItem model, used by the view

    // Would prefer not to hand this out, and instead give back a component?
    public getTodoItemText() {
        return this.text;
    }

    public getBaseUrl() {
        return this.baseUrl;
    }

    public setCheckedState(newState: boolean): void {
        this.root.set(checkedKey, newState);
        this.emit("checkedStateChanged");
    }

    public getCheckedState(): boolean {
        return this.root.get(checkedKey);
    }

    public hasInnerComponent(): boolean {
        return !!this.innerIdCell.get();
    }

    public getInnerComponentType() {
        return this.root.get<TodoItemSupportedComponents>(innerComponentTypeKey);
    }

    public async getInnerComponent() {
        const innerComponentHandle = this.innerIdCell.get();
        if (innerComponentHandle) {
            return innerComponentHandle.get();
        } else {
            return undefined;
        }
    }

    /**
     * The Todo Item can embed multiple types of components. This is where these components are defined.
     * @param type - component to be created
     * @param props - props to be passed into component creation
     */
    public async createInnerComponent(type: TodoItemSupportedComponents, baseUrl?: string): Promise<void> {
        let component: IComponentLoadable;
        switch (type) {
            case "todo":
                component = await TodoItem.getFactory().createComponent(
                    this.context,
                    { startingText: type, baseUrl },
                );
                break;
            case "clicker":
                component = await ClickerInstantiationFactory.createComponent(this.context);
                break;
            case "textBox":
                component = await TextBoxInstantiationFactory.createComponent(this.context, type);
                break;
            case "textList":
                component = await TextListInstantiationFactory.createComponent(this.context);
                break;
            default:
        }

        // Update the inner component id
        this.innerIdCell.set(component.handle);
        this.root.set(innerComponentTypeKey, type);

        this.emit("innerComponentChanged");
    }

    // end public API surface for the TodoItem model, used by the view
}
