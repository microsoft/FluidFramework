/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";
import { ReactViewAdapter } from "@fluidframework/view-adapters";
import React from "react";
import { TodoItemSupportedComponents } from "./supportedComponent";
import { TodoItem } from "./TodoItem";

interface TodoItemDetailsViewProperties {
    todoItemModel: TodoItem;
}

interface TodoItemDetailsViewState {
    hasInnerComponent: boolean;
    innerComponent: IComponent;
}

export class TodoItemDetailsView extends React.Component<TodoItemDetailsViewProperties, TodoItemDetailsViewState> {
    constructor(props: TodoItemDetailsViewProperties) {
        super(props);

        this.state = {
            hasInnerComponent: this.props.todoItemModel.hasInnerComponent(),
            innerComponent: undefined,
        };

        this.createInnerComponent = this.createInnerComponent.bind(this);
    }

    private async createInnerComponent(type: TodoItemSupportedComponents) {
        await this.props.todoItemModel.createInnerComponent(type);
    }

    private async refreshInnerComponentFromModel(): Promise<void> {
        const innerComponent = await this.props.todoItemModel.getInnerComponent();
        this.setState({ innerComponent });
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

            // createInnerComponent will create the model component for the chosen option.  We then need to get the
            // view component out of it (for now).  Preferably, we would instead take the returned model and feed it
            // into our own view component of our choosing.
            return <ReactViewAdapter component={this.state.innerComponent} />;
        }
    }
}
