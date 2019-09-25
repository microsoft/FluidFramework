/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { TodoItemSupportedComponents } from "./supportedComponent";
import { TodoItem } from "./TodoItem";

interface p {
    todoItemModel: TodoItem;
    createComponentView(id: string): JSX.Element;
}

interface s {
    innerId: string;
}

export class TodoItemDetailsView extends React.Component<p, s> {
    constructor(props: p) {
        super(props);

        this.state = {
            innerId: this.props.todoItemModel.innerIdCell.get(),
        };

        this.createInnerComponent = this.createInnerComponent.bind(this);
    }

    async createInnerComponent(type: TodoItemSupportedComponents) {
        await this.props.todoItemModel.createInnerComponent(type, { startingText: type });
    }

    componentDidMount() {
        this.props.todoItemModel.innerIdCell.on("op", () => {
            this.setState({innerId: this.props.todoItemModel.innerIdCell.get()});
        });
    }

    render() {
        // tslint:disable:strict-boolean-expressions
        return (
            <div className="todoItemDetails">
                {
                    this.state.innerId === "" ?
                    <>
                        <button onClick={async () => this.createInnerComponent("todo")}>todo</button>
                        <button onClick={async () => this.createInnerComponent("clicker")}>clicker</button>
                        <button onClick={async () => this.createInnerComponent("textBox")}>textBox</button>
                        <button onClick={async () => this.createInnerComponent("textList")}>textList</button>
                    </> :
                    this.props.createComponentView(this.state.innerId)
                }
            </div>
        );
    }
}
