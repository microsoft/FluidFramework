/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@microsoft/fluid-aqueduct-react";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap } from "@microsoft/fluid-map";
import { SharedString } from "@microsoft/fluid-sequence";
import * as React from "react";
import { TodoItem } from "../TodoItem/TodoItem";
import { TodoItemView } from "../TodoItem/TodoItemView";
import { Todo } from "./Todo";

interface TodoViewProps {
    todoModel: Todo;
    getComponent(id: string): Promise<IComponent>;
}

interface TodoViewState {
    todoItemComponents: TodoItem[];
    inputValue: string;
    modelLoaded: boolean;
}

// tslint:disable:react-a11y-input-elements
export class TodoView extends React.Component<TodoViewProps, TodoViewState> {
    private newTextInput: HTMLInputElement;
    private todoItemsMap: ISharedMap;
    private titleString: SharedString;
    constructor(props: TodoViewProps) {
        super(props);

        this.state = {
            todoItemComponents: [],
            inputValue: "",
            modelLoaded: false,
        };

        this.handleSubmit = this.handleSubmit.bind(this);
        this.updateInputValue = this.updateInputValue.bind(this);
        this.pullTodoItems = this.pullTodoItems.bind(this);
    }

    async componentDidMount() {
        await Promise.all([
            // Get the shared data structures off the model
            this.props.todoModel.getTodoItemsMapPromise().then((todoItemsMap) => { this.todoItemsMap = todoItemsMap; }),
            this.props.todoModel.getTodoTitleStringPromise().then((titleString) => { this.titleString = titleString; }),
        ]);

        // Map is now realized, register for events on it
        this.todoItemsMap.on("op", async () => {
            // Ideally should not be listening to op - this will be redundant for ACK on ops we submitted
            await this.pullTodoItems();
        });

        // Wait for all the todo items to load, then declare the model loaded so we can render later
        await this.pullTodoItems();
        this.setState({modelLoaded: true});

        // Set focus to the text input
        this.newTextInput.focus();
    }

    async pullTodoItems(): Promise<void> {
        const todoItemComponentPromises = [];
        for (const key of this.todoItemsMap.keys()) {
            todoItemComponentPromises.push(this.props.getComponent(key));
        }

        return Promise.all(todoItemComponentPromises).then((todoItemComponents) => this.setState({todoItemComponents}));
    }

    /**
     * This allows us to prevent default form behavior while getting all the benefits
     */
    async handleSubmit(ev: React.FormEvent<HTMLFormElement>): Promise<void> {
        ev.preventDefault();
        await this.props.todoModel.addTodoItemComponent({ startingText: this.state.inputValue });
        await this.pullTodoItems();
        this.setState({inputValue: ""});
    }

    updateInputValue(ev: React.ChangeEvent<HTMLInputElement>): void {
        this.setState({inputValue: ev.target.value});
    }

    render(): JSX.Element {
        if (!this.state.modelLoaded) {
            return <div>Loading...</div>;
        }

        const todoItemComponents = this.state.todoItemComponents.map((todoItemComponent) => {
            return (
                <TodoItemView
                    todoItemModel={todoItemComponent}
                    getComponent={this.props.getComponent}
                    key={todoItemComponent.url}
                />
            );
        });

        return (
            <div className="todo-view">
                <CollaborativeInput
                    className="todo-title"
                    sharedString={this.titleString}
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
                <div className="todo-item-list">
                    {todoItemComponents}
                </div>
            </div>
        );
    }
}
