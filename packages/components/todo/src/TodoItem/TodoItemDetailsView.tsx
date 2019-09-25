/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { HTMLEmbeddedComponent, IComponentReactViewable } from "@microsoft/fluid-aqueduct-react";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import { TodoItemSupportedComponents } from "./supportedComponent";
import { TodoItem } from "./TodoItem";

interface p {
    todoItemModel: TodoItem;
    getComponent(id: string): Promise<IComponent>;
}

interface s {
    innerId: string;
    innerComponent: IComponent;
}

export class TodoItemDetailsView extends React.Component<p, s> {
    constructor(props: p) {
        super(props);

        this.state = {
            innerId: this.props.todoItemModel.innerIdCell.get(),
            innerComponent: undefined,
        };

        this.createInnerComponent = this.createInnerComponent.bind(this);
    }

    async createInnerComponent(type: TodoItemSupportedComponents) {
        await this.props.todoItemModel.createInnerComponent(type, { startingText: type });
    }

    async pullInnerComponent(): Promise<void> {
        return this.props.getComponent(this.state.innerId).then((innerComponent) => this.setState({innerComponent}));
    }

    async componentDidMount() {
        this.props.todoItemModel.innerIdCell.on("op", async () => {
            this.setState({
                innerId: this.props.todoItemModel.innerIdCell.get(),
                innerComponent: undefined,
            });
            await this.pullInnerComponent();
        });

        await this.pullInnerComponent();
    }

    render() {
        // tslint:disable-next-line:no-console
        console.log(this.state.innerId, this.state.innerComponent);
        if (this.state.innerId === "") {
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
