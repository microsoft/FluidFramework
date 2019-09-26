/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeCheckbox, CollaborativeInput } from "@microsoft/fluid-aqueduct-react";
import * as React from "react";
import { TodoItem } from "./TodoItem";
import { TodoItemDetailsView } from "./TodoItemDetailsView";

interface TodoItemViewProps {
    todoItemModel: TodoItem;
}

interface TodoItemViewState {
    checked: boolean;
    innerComponentVisible: boolean;
}

export class TodoItemView extends React.Component<TodoItemViewProps, TodoItemViewState> {
    private readonly baseUrl = `${window.location.origin}`;
    private readonly buttonStyle = {
        height: "25px",
        marginLeft: "2px",
        marginRight: "2px",
        width: "35px",
    };

    constructor(props: TodoItemViewProps) {
        super(props);

        const pathName = window.location.pathname.split("/");
        const path: string[] = [];
        for (const val of pathName) {
            if (!val.startsWith("item")) {
                path.push(val);
            }
        }
        this.baseUrl += `${path.join("/")}${window.location.search}`;
        this.state = {
            checked: this.props.todoItemModel.getCheckedState(),
            innerComponentVisible: false,
        };

        this.handleCheckedChange = this.handleCheckedChange.bind(this);
    }

    componentDidMount() {
        this.props.todoItemModel.on("checkedStateChanged", () => {
            this.setState({ checked: this.props.todoItemModel.getCheckedState() });
        });
    }

    private handleCheckedChange(newState: boolean): void {
        this.props.todoItemModel.setCheckedState(newState);
    }

    render() {
        // tslint:disable:strict-boolean-expressions
        return (
            <div className="todo-item">
                <h2>
                    <CollaborativeCheckbox
                        checked={this.state.checked}
                        onCheckedChange={this.handleCheckedChange}
                        id={this.props.todoItemModel.url}/>
                    <CollaborativeInput
                        sharedString={this.props.todoItemModel.text}
                        style={{
                            border: "none",
                            fontFamily: "inherit",
                            fontSize: 20,
                            marginBottom: 5,
                            marginTop: 5,
                            outline: "none",
                            width: "inherit",
                        }}/>
                    <button
                        style={this.buttonStyle}
                        onClick={() => {this.setState({innerComponentVisible: !this.state.innerComponentVisible}); }}>
                        {this.state.innerComponentVisible ? "▲" : "▼"}
                    </button>
                    <button
                        style={this.buttonStyle}
                        onClick={() => window.open(`${this.baseUrl}/${this.props.todoItemModel.url}`, "_blank")}>↗
                    </button>
                    <button
                        style={this.buttonStyle}
                        onClick={() => alert("Implement Delete")}>X</button>
                </h2>
                {
                    // If the content is visible we will show a button or a component
                    this.state.innerComponentVisible &&
                    <TodoItemDetailsView
                        todoItemModel={this.props.todoItemModel}
                    />
                }
            </div>
        );
    }
}
