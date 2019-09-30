/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@microsoft/fluid-aqueduct-react";
import { SharedString } from "@microsoft/fluid-sequence";
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
    private readonly itemText: SharedString;
    private readonly baseUrl = `${window.location.origin}`;
    private readonly buttonStyle = {
        height: "25px",
        marginLeft: "2px",
        marginRight: "2px",
        width: "35px",
    };

    constructor(props: TodoItemViewProps) {
        super(props);

        this.itemText = this.props.todoItemModel.getTodoItemText();

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

        this.setCheckedState = this.setCheckedState.bind(this);
    }

    public componentDidMount() {
        this.props.todoItemModel.on("checkedStateChanged", () => {
            this.setState({ checked: this.props.todoItemModel.getCheckedState() });
        });
    }

    private setCheckedState(e: React.ChangeEvent<HTMLInputElement>): void {
        this.props.todoItemModel.setCheckedState(e.target.checked);
    }

    public render() {
        // tslint:disable:react-a11y-input-elements
        // react-a11y-input-elements incorrectly thinks checkboxes need placeholder text
        // Issue fixed in tslint-microsoft-contrib 6.1.0:
        // https://github.com/microsoft/tslint-microsoft-contrib/issues/749

        // tslint:disable:react-a11y-role-has-required-aria-props
        // react-a11y-role-has-required-aria-props incorrectly thinks native checkboxes need aria-checked
        // Known open issue (9/26/2019):
        // https://github.com/microsoft/tslint-microsoft-contrib/issues/409
        return (
            <div className="todo-item">
                <h2>
                    <input
                        type="checkbox"
                        name={this.props.todoItemModel.url}
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
        // tslint:enable:react-a11y-input-elements
        // tslint:enable:react-a11y-role-has-required-aria-props
    }
}
