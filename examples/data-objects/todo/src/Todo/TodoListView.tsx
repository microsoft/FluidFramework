/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-example/example-utils";
import { SharedString, type ISharedString } from "@fluidframework/sequence/legacy";
import { Tree, type TreeNode } from "@fluidframework/tree/legacy";
import React, { useEffect, useRef, useState } from "react";

import { TodoItemView } from "../TodoItem/index.js";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

import { type TodoListDataObject } from "./index.js";

export interface TodoViewProps {
	readonly todoModel: TodoListDataObject;
	readonly getDirectLink: (itemId: string) => string;
}

// TODO: This was copied over from the "@fluid-experimental/tree-react-api" package.
// This should be imported from that package, once it is no longer experimental.
export function useTree(subtreeRoot: TreeNode): void {
	// Use a React effect hook to invalidate this component when the subtreeRoot changes.
	// We do this by incrementing a counter, which is passed as a dependency to the effect hook.
	const [invalidations, setInvalidations] = useState(0);

	// React effect hook that increments the 'invalidation' counter whenever subtreeRoot or any of its children change.
	useEffect(() => {
		// Returns the cleanup function to be invoked when the component unmounts.
		return Tree.on(subtreeRoot, "treeChanged", () => {
			setInvalidations((i) => i + 1);
		});
	}, [invalidations, subtreeRoot]);
}

export const TodoView: React.FC<TodoViewProps> = (props: TodoViewProps) => {
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
				console.log("todomodel");
				console.log(todoModel);
				console.error(error);
			});
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
						Tree.on(todoModel.treeView.root.items, "treeChanged", () => {});
					}}
				>
					X
				</button>
			</div>
		),
	);

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
