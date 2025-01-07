/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-example/example-utils";
import { SharedString } from "@fluidframework/sequence/legacy";
import React, { useEffect, useRef, useState } from "react";

import { TodoItem, TodoItemView } from "../TodoItem/index.js";

import { Todo } from "./Todo.js";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

interface TodoViewProps {
	readonly todoModel: Todo;
	readonly getDirectLink: (itemId: string) => string;
}

export const TodoView: React.FC<TodoViewProps> = (props: TodoViewProps) => {
	const { todoModel, getDirectLink } = props;

	const [todoItems, setTodoItems] = useState<[string, TodoItem][]>([]);
	const [titleString, setTitleString] = useState<SharedString | undefined>();

	const newItemTextInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		todoModel.getTodoTitleString().then(setTitleString).catch(console.error);

		const refreshTodoItemListFromModel = () => {
			todoModel.getTodoItems().then(setTodoItems).catch(console.error);
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
		if (newItemTextInputRef.current === null) {
			throw new Error("New item text field missing");
		}
		await todoModel.addTodoItem({
			startingText: newItemTextInputRef.current.value,
		});
		newItemTextInputRef.current.value = "";
	};

	// Using the list of TodoItem objects, make a list of TodoItemViews.
	const todoItemViews = todoItems.map(([id, todoItem]) => (
		<div className="item-wrap" key={id}>
			<TodoItemView todoItemModel={todoItem} className="todo-item-view" />
			<button
				name="OpenInNewTab"
				id={id}
				className="action-button"
				onClick={() => window.open(getDirectLink(id), "_blank")}
			>
				↗
			</button>
			<button className="action-button" onClick={() => todoModel.deleteTodoItem(id)}>
				X
			</button>
		</div>
	));

	// TodoView is made up of an editable title input, an input/button for submitting new items, and the list
	// of TodoItemViews.
	/* eslint-disable @typescript-eslint/no-misused-promises */
	return (
		<div className="todo-view">
			<CollaborativeInput className="todo-title" sharedString={titleString} />
			<form className="new-item-form" onSubmit={handleCreateClick}>
				<input
					className="new-item-text"
					type="text"
					ref={newItemTextInputRef}
					name="itemName"
					autoFocus
				/>
				<button className="new-item-button" type="submit" name="createItem">
					+
				</button>
			</form>
			<div className="todo-item-list">{todoItemViews}</div>
		</div>
	);
	/* eslint-enable @typescript-eslint/no-misused-promises */
};
