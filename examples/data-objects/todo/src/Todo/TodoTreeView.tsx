/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-example/example-utils";
import { useTree } from "@fluid-experimental/tree-react-api";
import { SharedString, type ISharedString } from "@fluidframework/sequence/legacy";
import { Tree } from "@fluidframework/tree/legacy";
import React, { useEffect, useRef, useState } from "react";

import { TodoItemView } from "../TodoItem/index.js";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

import type { TodoTreeDataObject, TodoTreeItem } from "./index.js";

export interface TodoViewProps {
	readonly todoModel: TodoTreeDataObject;
	readonly getDirectLink: (itemId: string) => string;
}

export const TodoTreeView: React.FC<TodoViewProps> = (props: TodoViewProps) => {
	const { todoModel, getDirectLink } = props;
	const [todoItems, setTodoItems] = useState<[string, TodoTreeItem][]>([]);
	const [titleString, setTitleString] = useState<SharedString | undefined>();

	const newItemTextInputRef = useRef<HTMLInputElement>(null);

	useTree(todoModel.treeView.root);

	useEffect(() => {
		Promise.resolve(todoModel.treeView.root.title.get())
			.then((title) => {
				setTitleString(title as ISharedString);
			})
			.catch((error) => {
				console.log("todomodel");
				console.log(todoModel);
				console.error(error);
			});
		const refreshTodoItemListFromModel = () => {
			try {
				const items = Array.from(todoModel.treeView.root.items.entries());
				setTodoItems(items);
			} catch (error) {
				console.error(error);
			}
		};
		Tree.on(todoModel.treeView.root.items, "treeChanged", refreshTodoItemListFromModel);
		refreshTodoItemListFromModel();

		return () => {};
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
			<button
				className="action-button"
				onClick={() => {
					todoModel.treeView.root.items.delete(id);
					Tree.on(todoModel.treeView.root.items, "treeChanged", () => {});
				}}
			>
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
