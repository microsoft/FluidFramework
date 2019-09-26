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
            modelLoaded: false,
        };

        this.createNewTodoItem = this.createNewTodoItem.bind(this);
        this.refreshTodoItemListFromModel = this.refreshTodoItemListFromModel.bind(this);
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
            await this.refreshTodoItemListFromModel();
        });

        // Wait for all the todo items to load, then declare the model loaded so we can render later
        await this.refreshTodoItemListFromModel();
        this.setState({modelLoaded: true});

        // Set focus to the text input
        this.newTextInput.focus();
    }

    async refreshTodoItemListFromModel(): Promise<void> {
        // The map only stores keys, so we need to go retrieve the component using getComponent.  Ultimately we'd probably prefer
        // to be storing handles in the values so we can get them out without passing in the getComponent.  Alternatively, maybe
        // move a "getComponentList" method to the model
        const todoItemComponentPromises = [];
        for (const id of this.todoItemsMap.keys()) {
            todoItemComponentPromises.push(this.props.getComponent(id));
        }

        return Promise.all(todoItemComponentPromises).then((todoItemComponents) => this.setState({todoItemComponents}));
    }

    /**
     * This allows us to prevent default form behavior while getting all the benefits
     */
    async createNewTodoItem(ev: React.FormEvent<HTMLFormElement>): Promise<void> {
        ev.preventDefault();
        await this.props.todoModel.addTodoItemComponent({ startingText: this.newTextInput.value });
        await this.refreshTodoItemListFromModel();
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
