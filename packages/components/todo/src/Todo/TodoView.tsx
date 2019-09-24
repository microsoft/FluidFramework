/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@microsoft/fluid-aqueduct-react";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap } from "@microsoft/fluid-map";
import { SharedString } from "@microsoft/fluid-sequence";
import * as React from "react";
import { Todo } from "./Todo";
import { TodoItem } from "../TodoItem/TodoItem";
import { TodoItemView } from "../TodoItem/TodoItemView";

interface p {
    todoModel: Todo;
    createComponentView(id: string): JSX.Element;
    todoItemsMap: ISharedMap;
    textSharedString: SharedString;
    getComponent(id: string): Promise<IComponent>;
}

interface s {
    todoItemComponents: TodoItem[];
    inputValue: string;
}

// tslint:disable:react-a11y-input-elements
export class TodoView extends React.Component<p, s> {
    private newTextInput: HTMLInputElement;
    constructor(props: p) {
        super(props);

        this.state = {
            todoItemComponents: [],
            inputValue: "",
        };

        this.handleSubmit = this.handleSubmit.bind(this);
        this.updateInputValue = this.updateInputValue.bind(this);
    }

    componentDidMount(): void {
        this.revalidateTodoItems();

        this.props.todoItemsMap.on("op", () => {
            this.revalidateTodoItems();
        });

        // Set focus on the new text input
        this.newTextInput.focus();
    }

    revalidateTodoItems(): void {
        const todoItemComponentPromises = []
        for(const key of this.props.todoItemsMap.keys()) {
            todoItemComponentPromises.push(this.props.getComponent(key));
        }

        Promise.all(todoItemComponentPromises).then(todoItemComponents => this.setState({todoItemComponents}));
    }

    /**
     * This allows us to prevent default form behavior while getting all the benefits
     */
    async handleSubmit(ev: React.FormEvent<HTMLFormElement>): Promise<void> {
        ev.preventDefault();
        await this.props.todoModel.addTodoItemComponent({ startingText: this.state.inputValue });
        this.revalidateTodoItems();
        this.setState({inputValue: ""});
    }

    updateInputValue(ev: React.ChangeEvent<HTMLInputElement>): void {
        this.setState({inputValue: ev.target.value});
    }

    render(): JSX.Element {
        const todoItemComponents = [];

        this.state.todoItemComponents.forEach((todoItemComponent) => {
            const todoItemView = (
                <TodoItemView
                    todoItemModel={todoItemComponent}
                    createComponentView={this.props.createComponentView}
                    key={todoItemComponent.url}
                />
            );
            todoItemComponents.push(todoItemView);
        });

        return (
            <div className="todoView">
                <CollaborativeInput
                    sharedString={this.props.textSharedString}
                    style={{
                        border: "none",
                        fontFamily: "inherit",
                        fontSize: 30,
                        marginBottom: 5,
                        marginTop: 5,
                        outline: "none",
                        width: "inherit",
                    }}
                />
                <form onSubmit={this.handleSubmit}>
                    <input
                        type="text"
                        value={this.state.inputValue}
                        onChange={this.updateInputValue}
                        ref={(input) => { this.newTextInput = input; }}/>
                    <button type="submit">+</button>
                </form>
                <div className="todoItemList">
                    {todoItemComponents}
                </div>
            </div>
        );
    }
}
