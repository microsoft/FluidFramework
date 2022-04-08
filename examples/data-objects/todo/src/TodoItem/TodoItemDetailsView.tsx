/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerReactView } from "@fluid-example/clicker";
import { ReactViewAdapter } from "@fluidframework/view-adapters";
import React from "react";
import { ITodoItemInnerComponent, TodoItemSupportedComponents } from "./supportedComponent";
import { TodoItem } from "./TodoItem";

interface TodoItemDetailsViewProperties {
    todoItemModel: TodoItem;
}

interface TodoItemDetailsViewState {
    hasInnerComponent: boolean;
    innerComponent: ITodoItemInnerComponent | undefined;
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
        } else if (this.state.innerComponent === undefined) {
            // A detailed item has been created (we have the component id), but we haven't retrieved it yet
            return (
                <div>Loading...</div>
            );
        } else {
            // Fully loaded

            if (this.state.innerComponent.type === "clicker") {
                return <ClickerReactView clicker={this.state.innerComponent.component} />;
            }

            // createInnerComponent will create the model component for the chosen option.  For components with
            // combined model/view we then need to get the view from it (for now).  Preferably, we would instead
            // take the returned model and feed it into our own view component of our choosing like we do with
            // Clicker above.
            return <ReactViewAdapter view={this.state.innerComponent.component} />;
        }
    }
}
