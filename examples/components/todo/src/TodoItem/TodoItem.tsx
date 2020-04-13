/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerName } from "@fluid-example/clicker";
import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { ISharedCell, SharedCell } from "@microsoft/fluid-cell";
import {
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { SharedString } from "@microsoft/fluid-sequence";
import { IComponentHTMLView, IComponentReactViewable } from "@microsoft/fluid-view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { TextBoxName } from "../TextBox";
import { TextListName } from "../TextList";
import { TodoItemSupportedComponents } from "./supportedComponent";
import { TodoItemView } from "./TodoItemView";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
export const TodoItemName = `${pkg.name as string}-item`;

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

    /**
     * Do creation work
     */
    protected async componentInitializingFirstTime(props?: any) {
        let newItemText = "New Item";

        // If the creating component passed props with a startingText value then set it.
        if (props) {
            if (props.startingText) {
                newItemText = props.startingText;
            }
            if (props.baseUrl) {
                this.baseUrl = props.baseUrl;
            }
        }

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
    public async createInnerComponent(type: TodoItemSupportedComponents, props?: any): Promise<void> {
        let componentType: string | undefined;
        switch (type) {
            case "todo":
                componentType = TodoItemName;
                break;
            case "clicker":
                componentType = ClickerName;
                break;
            case "textBox":
                componentType = TextBoxName;
                break;
            case "textList":
                componentType = TextListName;
                break;
            default:
        }

        const component = await this.createAndAttachComponent(componentType, props);
        // Update the inner component id
        this.innerIdCell.set(component.handle);

        this.emit("innerComponentChanged");
    }

    // end public API surface for the TodoItem model, used by the view
}
