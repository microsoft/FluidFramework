/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactViewAdapter } from "@fluidframework/view-adapters";
import React from "react";
import { TextBox } from "../TextBox";
import { TodoItem } from "./TodoItem";

interface TodoItemDetailsViewProperties {
    todoItemModel: TodoItem;
}

interface TodoItemDetailsViewState {
    innerComponent: TextBox | undefined;
}

export class TodoItemDetailsView extends React.Component<TodoItemDetailsViewProperties, TodoItemDetailsViewState> {
    constructor(props: TodoItemDetailsViewProperties) {
        super(props);

        this.state = {
            innerComponent: undefined,
        };
    }

    private async refreshInnerComponentFromModel(): Promise<void> {
        const innerComponent = await this.props.todoItemModel.getInnerComponent();
        this.setState({ innerComponent });
    }

    public async componentDidMount() {
        await this.refreshInnerComponentFromModel();
    }

    public render() {
        if (this.state.innerComponent === undefined) {
            // A detailed item has been created (we have the component id), but we haven't retrieved it yet
            return (
                <div>Loading...</div>
            );
        } else {
            // Fully loaded
            return <ReactViewAdapter view={this.state.innerComponent} />;
        }
    }
}
