/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { HTMLEmbeddedComponent, IComponentReactViewable } from "@microsoft/fluid-aqueduct-react";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
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

    async createInnerComponent(type: TodoItemSupportedComponents) {
        await this.props.todoItemModel.createInnerComponent(type, { startingText: type });
    }

    async refreshInnerComponentFromModel(): Promise<void> {
        const innerComponent = await this.props.todoItemModel.getInnerComponent();
        this.setState({innerComponent});
    }

    async componentDidMount() {
        this.props.todoItemModel.on("innerComponentChanged", async () => {
            this.setState({
                hasInnerComponent: this.props.todoItemModel.hasInnerComponent(),
            });
            await this.refreshInnerComponentFromModel();
        });

        await this.refreshInnerComponentFromModel();
    }

    render() {
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
            if (this.state.innerComponent.IComponentReactViewable) {
                return (this.state.innerComponent as IComponentReactViewable).createJSXElement();
            } else if (this.state.innerComponent.IComponentHTMLVisual) {
                return (<HTMLEmbeddedComponent component={this.state.innerComponent.IComponentHTMLVisual} />);
            }
        }
    }
}
