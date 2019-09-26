/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@microsoft/fluid-aqueduct-react";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
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
    modelLoaded: boolean;
}

// tslint:disable:react-a11y-input-elements
export class TodoView extends React.Component<TodoViewProps, TodoViewState> {
    private newTextInput: HTMLInputElement;
    private titleString: SharedString;
    constructor(props: TodoViewProps) {
        super(props);

        this.state = {
            todoItemComponents: [],
            modelLoaded: false,
        };

        this.createNewTodoItem = this.createNewTodoItem.bind(this);
        this.refreshTodoItemListFromModel = this.refreshTodoItemListFromModel.bind(this);
    }

    async componentDidMount() {
        // Get the shared string for the title off the model
        this.titleString = await this.props.todoModel.getTodoTitleString();

        // Map is now realized, register for events on it
        // Would prefer for the model to register for these events, and then emit events of its own
        // (e.g. maybe "componentListUpdate")
        this.props.todoModel.on("todoItemsChanged", async () => {
            // Doesn't really matter if we await this?
            await this.refreshTodoItemListFromModel();
        });

        // Wait for all the todo items to load, then declare the model loaded so we can render later
        await this.refreshTodoItemListFromModel();
        this.setState({modelLoaded: true});

        // Set focus to the text input
        this.newTextInput.focus();
    }

    async refreshTodoItemListFromModel(): Promise<void> {
        const todoItemComponents = await this.props.todoModel.getTodoItemComponents();
        this.setState({todoItemComponents});
    }

    /**
     * This allows us to prevent default form behavior while getting all the benefits
     */
    async createNewTodoItem(ev: React.FormEvent<HTMLFormElement>): Promise<void> {
        ev.preventDefault();
        await this.props.todoModel.addTodoItemComponent({ startingText: this.newTextInput.value });
        this.newTextInput.value = "";
    }

    render(): JSX.Element {
        // Getting the subcomponents and DDSs is async and happens after the first render in componentDidMount.
        if (!this.state.modelLoaded) {
            return <div>Loading...</div>;
        }

        // Using the list of TodoItem components, make a list of TodoItemViews.  We know they're available because
        // this.state.modelLoaded is true.
        const todoItemComponents = this.state.todoItemComponents.map((todoItemComponent) => {
            return (
                <TodoItemView
                    todoItemModel={todoItemComponent}
                    getComponent={this.props.getComponent}
                    key={todoItemComponent.url}
                />
            );
        });

        // TodoView is made up of an editable title input, an input/button for submitting new items, and the list
        // of TodoItemViews.
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
                <form onSubmit={this.createNewTodoItem}>
                    <input
                        type="text"
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
