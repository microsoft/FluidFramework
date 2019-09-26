/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeCheckbox, CollaborativeInput } from "@microsoft/fluid-aqueduct-react";
import * as React from "react";
import { TodoItem } from "./TodoItem";
import { TodoItemDetailsView } from "./TodoItemDetailsView";

interface p {
    todoItemModel: TodoItem;
}

interface s {
    checkedState: boolean;
    contentVisible: boolean;
}

export class TodoItemView extends React.Component<p, s> {
    private readonly baseUrl = `${window.location.origin}`;
    private readonly buttonStyle = {
        height: "25px",
        marginLeft: "2px",
        marginRight: "2px",
        width: "35px",
    };

    constructor(props: p) {
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
            checkedState: this.props.todoItemModel.getCheckedState(),
            contentVisible: false,
        };

        this.handleCheckedChange = this.handleCheckedChange.bind(this);
    }

    private handleCheckedChange(newState: boolean): void {
        this.props.todoItemModel.setCheckedState(newState);
        this.setState({checkedState: this.props.todoItemModel.getCheckedState()});
    }

    render() {
        // tslint:disable:strict-boolean-expressions
        return (
            <div className="todo-item">
                <h2>
                    <CollaborativeCheckbox
                        checked={this.props.todoItemModel.getCheckedState()}
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
                        onClick={() => {this.setState({contentVisible: !this.state.contentVisible}); }}>
                        {this.state.contentVisible ? "▲" : "▼"}
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
                    this.state.contentVisible &&
                    <TodoItemDetailsView
                        todoItemModel={this.props.todoItemModel}
                    />
                }
            </div>
        );
    }
}
