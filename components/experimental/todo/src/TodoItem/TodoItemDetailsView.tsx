/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { ReactViewAdapter } from "@microsoft/fluid-view-adapters";
import * as React from "react";
import { TodoItemSupportedComponents } from "./supportedComponent";
import { TodoItem } from "./TodoItem";
import { TodoItemView } from "./TodoItemView";

interface TodoItemDetailsViewProperties {
    todoItemModel: TodoItem;
}

interface TodoItemDetailsViewState {
    hasInnerComponent: boolean;
    innerComponent: IComponent;
    innerComponentType: TodoItemSupportedComponents | undefined;
}

export class TodoItemDetailsView extends React.Component<TodoItemDetailsViewProperties, TodoItemDetailsViewState> {
    constructor(props: TodoItemDetailsViewProperties) {
        super(props);

        this.state = {
            hasInnerComponent: this.props.todoItemModel.hasInnerComponent(),
            innerComponent: undefined,
            innerComponentType: undefined,
        };

        this.createInnerComponent = this.createInnerComponent.bind(this);
    }

    private async createInnerComponent(type: TodoItemSupportedComponents) {
        await this.props.todoItemModel.createInnerComponent(
            type,
            this.props.todoItemModel.getBaseUrl(),
        );
    }

    private async refreshInnerComponentFromModel(): Promise<void> {
        const innerComponent = await this.props.todoItemModel.getInnerComponent();
        const innerComponentType = this.props.todoItemModel.getInnerComponentType();
        this.setState({ innerComponent, innerComponentType });
    }

    public async componentDidMount() {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.props.todoItemModel.on("innerComponentChanged", async () => {
            this.setState({
                hasInnerComponent: this.props.todoItemModel.hasInnerComponent(),
            });
            await this.refreshInnerComponentFromModel();
        });

        await this.refreshInnerComponentFromModel();
    }

    public render() {
        if (!this.state.hasInnerComponent) {
            // No one has created a detailed item yet
            return (
                <>
                    <button onClick={async () => this.createInnerComponent("todo")}>todo</button>
                    <button onClick={async () => this.createInnerComponent("clicker")}>clicker</button>
                    <button onClick={async () => this.createInnerComponent("textBox")}>textBox</button>
                    <button onClick={async () => this.createInnerComponent("textList")}>textList</button>
                </>
            );
        } else if (!this.state.innerComponent) {
            // A detailed item has been created (we have the component id), but we haven't retrieved it yet
            return (
                <div>Loading...</div>
            );
        } else {
            // Fully loaded
            if (this.state.innerComponentType === "todo") {
                return <TodoItemView todoItemModel={this.state.innerComponent as TodoItem} />;
            }

            // createInnerComponent will create the model component for the chosen option.  We then need to get the
            // view component out of it (for now).  Preferably, we would instead take the returned model and feed it
            // into our own view component of our choosing, as we are now doing with TodoItemView.
            return <ReactViewAdapter component={this.state.innerComponent} />;
        }
    }
}
