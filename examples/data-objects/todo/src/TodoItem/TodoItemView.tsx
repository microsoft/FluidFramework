/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";
import { SharedString } from "@fluidframework/sequence";
import React from "react";
import { TodoItem } from "./TodoItem";
import { TodoItemDetailsView } from "./TodoItemDetailsView";

interface TodoItemViewProps {
    todoItemModel: TodoItem;
}

interface TodoItemViewState {
    checked: boolean;
    innerComponentVisible: boolean;
    absoluteUrl: string | undefined;
}

export class TodoItemView extends React.Component<TodoItemViewProps, TodoItemViewState> {
    private readonly itemText: SharedString;
    private readonly buttonStyle = {
        height: "25px",
        marginLeft: "2px",
        marginRight: "2px",
        width: "35px",
    };

    constructor(props: TodoItemViewProps) {
        super(props);

        this.itemText = this.props.todoItemModel.getTodoItemText();

        this.state = {
            checked: this.props.todoItemModel.getCheckedState(),
            innerComponentVisible: false,
            absoluteUrl: this.props.todoItemModel.absoluteUrl,
        };

        this.setCheckedState = this.setCheckedState.bind(this);
    }

    public componentDidMount() {
        this.props.todoItemModel.on("stateChanged", () => {
            this.setState({
                checked: this.props.todoItemModel.getCheckedState(),
                absoluteUrl: this.props.todoItemModel.absoluteUrl,
            });
        });
    }

    private setCheckedState(e: React.ChangeEvent<HTMLInputElement>): void {
        this.props.todoItemModel.setCheckedState(e.target.checked);
    }

    public render() {
        return (
            <div className="todo-item">
                <h2>
                    <input
                        type="checkbox"
                        name={this.props.todoItemModel.handle.absolutePath}
                        checked={this.state.checked}
                        onChange={this.setCheckedState} />
                    <CollaborativeInput
                        sharedString={this.itemText}
                        style={{
                            border: "none",
                            fontFamily: "inherit",
                            fontSize: 20,
                            marginBottom: 5,
                            marginTop: 5,
                            outline: "none",
                            width: "inherit",
                        }} />
                    <button
                        name="toggleInnerVisible"
                        style={this.buttonStyle}
                        onClick={() => {
                            this.setState({ innerComponentVisible: !this.state.innerComponentVisible });
                        }}>
                        {this.state.innerComponentVisible ? "▲" : "▼"}
                    </button>
                    <button
                        name="OpenSubComponent"
                        id={this.state.absoluteUrl}
                        style={this.buttonStyle}
                        onClick={() => window.open(this.state.absoluteUrl, "_blank")}
                        disabled={this.state.absoluteUrl === undefined}>↗
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
