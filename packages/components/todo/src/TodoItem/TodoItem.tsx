/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerName } from "@fluid-example/clicker";
import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { ISharedCell, SharedCell } from "@microsoft/fluid-cell";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { TextBoxName } from "../TextBox";
import { TextListName } from "../TextList";
import { TodoItemSupportedComponents } from "./supportedComponent";

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
export class TodoItem extends PrimedComponent {
    private text: SharedString;
    private innerIdCell: ISharedCell;
    private baseUrl: string = "";

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
        const text = this.root.get<IComponentHandle>(textKey).get<SharedString>();
        const innerIdCell = this.root.get<IComponentHandle>(innerComponentKey).get<ISharedCell>();
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
        const innerComponentId = this.innerIdCell.get();
        if (innerComponentId) {
            return this.getComponent(innerComponentId);
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
        let componentRuntime: IComponentRuntime;
        switch (type) {
            case "todo":
                componentRuntime = await this.context.createComponent(undefined, TodoItemName, props);
                break;
            case "clicker":
                componentRuntime = await this.context.createComponent(undefined, ClickerName, props);
                break;
            case "textBox":
                componentRuntime = await this.context.createComponent(undefined, TextBoxName, props);
                break;
            case "textList":
                componentRuntime = await this.context.createComponent(undefined, TextListName, props);
                break;
            default:
        }
        await componentRuntime.request({ url: "/" });
        componentRuntime.attach();
        // Update the inner component id
        this.innerIdCell.set(componentRuntime.id);

        this.emit("innerComponentChanged");
    }

    // end public API surface for the TodoItem model, used by the view
}
