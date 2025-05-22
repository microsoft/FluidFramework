/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-example/example-utils";
import { SharedString, type ISharedString } from "@fluidframework/sequence/legacy";
import React, { useEffect, useRef, useState } from "react";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

import { TodoItemView } from "../TodoItem/index.js";
import { useTree } from "../Utils/index.js";

import { type TodoListDataObject } from "./index.js";

export interface TodoListProps {
	readonly todoModel: TodoListDataObject;
	readonly getDirectLink: (itemId: string) => string;
}

export const TodoListView: React.FC<TodoListProps> = (props: TodoListProps) => {
	const { todoModel, getDirectLink } = props;
	const [titleString, setTitleString] = useState<SharedString | undefined>();

	const newItemTextInputRef = useRef<HTMLInputElement>(null);

	useTree(todoModel.treeView.root);

	useEffect(() => {
		Promise.resolve(todoModel.treeView.root.title.get())
			.then((title) => {
				setTitleString(title as ISharedString);
			})
			.catch((error) => {
				console.error(error);
			});
		return () => {};
	}, [todoModel]);

	if (titleString === undefined) {
		return <div>Loading...</div>;
	}
	const handleCreateClick = (ev: React.FormEvent<HTMLFormElement>): void => {
		ev.preventDefault();

		const input = newItemTextInputRef.current;
		if (!input) {
			throw new Error("New item text field missing");
		}

		todoModel
			.addTodoItem({ startingText: input.value })
			.then(() => {
				input.value = "";
			})
			.catch((error) => {
				console.error("Failed to create todo item:", error);
			});
	};

	// Using the list of TodoItem objects, make a list of TodoItemViews.
	const todoItemViews = Array.from(todoModel.treeView.root.items.entries()).map(
		([id, todoItem]) => (
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
				<button
					className="action-button"
					onClick={() => {
						todoModel.treeView.root.items.delete(id);
					}}
				>
					X
				</button>
			</div>
		),
	);

	// TodoView is made up of an editable title input, an input/button for submitting new items, and the list
	// of TodoItemViews.
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
};
