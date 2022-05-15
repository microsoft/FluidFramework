/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";
import { SharedString } from "@fluidframework/sequence";
import React, { useEffect, useRef, useState } from "react";
import { TodoItem } from "../TodoItem/TodoItem";
import { TodoItemView } from "../TodoItem/TodoItemView";
import { Todo } from "./Todo";

interface TodoViewProps {
    readonly todoModel: Todo;
    readonly getDirectLink: (itemId: string) => string;
}

export const TodoView: React.FC<TodoViewProps> = (props: TodoViewProps) => {
    const { todoModel, getDirectLink } = props;

    const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
    const [titleString, setTitleString] = useState<SharedString | undefined>();

    const newItemTextInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        todoModel.getTodoTitleString()
            .then(setTitleString)
            .catch(console.error);

        const refreshTodoItemListFromModel = () => {
            todoModel.getTodoItems()
                .then(setTodoItems)
                .catch(console.error);
        };
        todoModel.on("todoItemsChanged", refreshTodoItemListFromModel);
        refreshTodoItemListFromModel();

        return () => {
            todoModel.off("todoItemsChanged", refreshTodoItemListFromModel);
        };
    }, [todoModel]);

    if (titleString === undefined) {
        return <div>Loading...</div>;
    }

    const handleCreateClick = async (ev: React.FormEvent<HTMLFormElement>): Promise<void> => {
        ev.preventDefault();
        await todoModel.addTodoItem({
            startingText: newItemTextInputRef.current.value,
        });
        newItemTextInputRef.current.value = "";
    };

    // Using the list of TodoItem components, make a list of TodoItemViews.  We know they're available because
    // this.state.modelLoaded is true.
    const todoItemViews = todoItems.map((todoItem) => (
        <TodoItemView
            todoItemModel={todoItem}
            getDirectLink={getDirectLink}
            key={todoItem.id}
        />
    ));

    // TodoView is made up of an editable title input, an input/button for submitting new items, and the list
    // of TodoItemViews.
    return (
        <div className="todo-view">
            <CollaborativeInput
                className="todo-title"
                sharedString={titleString}
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
            <form onSubmit={handleCreateClick}>
                <input
                    type="text"
                    ref={newItemTextInputRef}
                    name="itemName"
                    autoFocus
                />
                <button type="submit" name="createItem">+</button>
            </form>
            <div className="todo-item-list">
                {todoItemViews}
            </div>
        </div>
    );
};
