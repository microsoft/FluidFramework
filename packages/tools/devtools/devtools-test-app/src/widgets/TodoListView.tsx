/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeStyles } from "@fluentui/react-components";
import { CollaborativeInput } from "@fluid-example/example-utils";
import type { SharedString, ISharedString } from "@fluidframework/sequence/internal";
import { Tree } from "@fluidframework/tree/internal";
import React from "react";

import type { AppDataTree } from "../FluidObject.js";

import { TodoItemView, useTree } from "./TodoItemView.js";

const useStyles = makeStyles({
	todoView: {
		maxWidth: "800px",
		margin: "0 auto",
		padding: "0 15px",
	},
	todoTitle: {
		width: "100%",
		border: "none",
		fontSize: "50px",
		textAlign: "center",
		marginBottom: "5px",
		marginTop: "5px",
		outline: "none",
	},
	newItemForm: {
		margin: "20px 0",
	},
	newItemText: {
		boxSizing: "border-box",
		width: "calc(100% - 50px)",
		height: "50px",
		border: "1px solid #666",
		verticalAlign: "middle",
		fontSize: "30px",
		outline: "0",
	},
	newItemButton: {
		width: "50px",
		height: "50px",
		border: "1px solid #666",
		verticalAlign: "middle",
		fontSize: "30px",
	},
	itemWrap: {
		display: "flex",
	},
	todoItemView: {
		display: "inline-block",
		width: "calc(100% - 100px)",
	},
	actionButton: {
		boxSizing: "border-box",
		width: "50px",
		height: "50px",
		margin: "10px 0 10px 10px",
		border: "1px solid #666",
		padding: "0",
		fontSize: "30px",
		"&:last-child": {
			margin: "10px",
		},
	},
});

/**
 * {@link TodoListView} input props.
 * @internal
 */
export interface TodoListProps {
	readonly todoModel: AppDataTree;
}

/**
 * Contains the list of {@link TodoItemView}, an editable title input and an input/button for submitting new items.
 */
export const TodoListView: React.FC<TodoListProps> = (props: TodoListProps) => {
	const { todoModel } = props;
	const styles = useStyles();
	const [titleString, setTitleString] = React.useState<SharedString | undefined>();

	const newItemTextInputRef = React.useRef<HTMLInputElement>(null);

	useTree(todoModel.treeView.root);

	React.useEffect(() => {
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

	const todoItemViews = [...todoModel.treeView.root.items.entries()].map(([id, todoItem]) => (
		<div className={styles.itemWrap} key={id}>
			<TodoItemView todoItemModel={todoItem} className={styles.todoItemView} />
			<button
				className={styles.actionButton}
				onClick={() => {
					todoModel.treeView.root.items.delete(id);
					Tree.on(todoModel.treeView.root.items, "treeChanged", () => {});
				}}
			>
				X
			</button>
		</div>
	));

	return (
		<div className={styles.todoView}>
			<CollaborativeInput className={styles.todoTitle} sharedString={titleString} />
			<form className={styles.newItemForm} onSubmit={handleCreateClick}>
				<input
					className={styles.newItemText}
					type="text"
					ref={newItemTextInputRef}
					name="itemName"
					autoFocus
				/>
				<button className={styles.newItemButton} type="submit" name="createItem">
					+
				</button>
			</form>
			<div>{todoItemViews}</div>
		</div>
	);
};
