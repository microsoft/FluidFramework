/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { ISharedCell, SharedCell } from "@microsoft/fluid-cell";
import {
    IComponentHandle, IComponentLoadable,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { IComponentHTMLView, IComponentReactViewable } from "@microsoft/fluid-view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { TextBoxInstantiationFactory } from "../TextBox";
import { TextListInstantiationFactory } from "../TextList";
import { TodoItemInstantiationFactory } from "./todoItemInstantiationFactory";
import { TodoItemSupportedComponents } from "./supportedComponent";
import { TodoItemView } from "./TodoItemView";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
export const TodoItemName = `${pkg.name as string}-item`;

export interface ITodoItemInitialState {
    startingText: string;
    baseUrl: string;
}

const checkedKey = "checked";
const textKey = "text";
const baseUrlKey = "baseUrl";
const innerComponentKey = "innerId";

/**
 * Todo Item is a singular todo entry consisting of:
 * - Checkbox
 * - Collaborative string
 * - Embedded component
 * - Link to open component in separate tab
 * - Button to remove entry
 */
export class TodoItem extends PrimedComponent
    implements
    IComponentHTMLView,
    IComponentReactViewable {

    private text: SharedString;
    private innerIdCell: ISharedCell;
    private baseUrl: string = "";

    public get IComponentHTMLView() { return this; }
    public get IComponentReactViewable() { return this; }

    public constructor(
        runtime: IComponentRuntime,
        context: IComponentContext,
        private initialState?: ITodoItemInitialState,
    ) {
        super(runtime, context);
    }

    /**
     * Do creation work
     */
    protected async componentInitializingFirstTime() {
        // Set initial state if it was provided
        const newItemText = this.initialState?.startingText ?? "New Item";
        this.baseUrl = this.initialState?.baseUrl ?? "";

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
        this.root.set(innerComponentKey, innerIdCell.handle);

        this.initialState = undefined;
    }

    protected async componentHasInitialized() {
        const text = this.root.get<IComponentHandle<SharedString>>(textKey).get();
        const innerIdCell = this.root.get<IComponentHandle<ISharedCell>>(innerComponentKey).get();
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

        this.root.on("valueChanged", (op, local) => {
            if (!local) {
                if (op.key === checkedKey) {
                    this.emit("checkedStateChanged");
                }
            }
        });
    }

    // start IComponentHTMLView

    public render(div: HTMLElement) {
        ReactDOM.render(
            this.createJSXElement(),
            div,
        );
    }

    // end IComponentHTMLView

    // start IComponentReactViewable

    /**
     * If our caller supports React they can query against the IComponentReactViewable
     * Since this returns a JSX.Element it allows for an easier model.
     */
    public createJSXElement(): JSX.Element {
        return (
            <TodoItemView
                todoItemModel={this}
            />
        );
    }

    // end IComponentReactViewable

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
                component = await TodoItemInstantiationFactory.createComponent(
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

        this.emit("innerComponentChanged");
    }

    // end public API surface for the TodoItem model, used by the view
}
