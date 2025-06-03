/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeStyles } from "@fluentui/react-components";
import {
	CollaborativeInput,
	CollaborativeTextArea,
	SharedStringHelper,
} from "@fluid-example/example-utils";
import { useTree } from "@fluid-experimental/tree-react-api";
import type { SharedString } from "@fluidframework/sequence/internal";
import React from "react";

import type { TodoItem } from "../Schema.js";

const useStyles = makeStyles({
	todoItemHeader: {
		margin: 0,
		display: "flex",
	},
	todoItemExpandButton: {
		boxSizing: "border-box",
		width: "30px",
		height: "50px",
		margin: "10px 0 10px 10px",
		border: "none",
		padding: 0,
		fontSize: "30px",
		background: "none",
	},
	todoItemCheckbox: {
		boxSizing: "border-box",
		width: "50px",
		height: "50px",
		margin: "10px 0 10px 10px",
	},
	todoItemInput: {
		boxSizing: "border-box",
		border: "1px solid #666",
		width: "100%",
		height: "50px",
		margin: "10px 0 10px 10px",
		padding: 0,
		fontSize: "20px",
		outline: "none",
	},
	todoItemDetails: {
		width: "100%",
	},
});

/**
 * {@link TodoItemView} input props.
 */
interface TodoItemViewProps {
	readonly todoItemModel: TodoItem;
	readonly className?: string;
}

/**
 * Todo Item that will be stored in the {@link TodoListView} tree.
 * Contains a title, description and a checkbox to mark it as completed.
 */
export const TodoItemView: React.FC<TodoItemViewProps> = (props: TodoItemViewProps) => {
	const { todoItemModel, className } = props;
	const styles = useStyles();

	const [itemTitle, setItemTitle] = React.useState<SharedString | undefined>(undefined);
	const [itemDescription, setItemDescription] = React.useState<SharedString | undefined>(
		undefined,
	);
	const [detailsVisible, setDetailsVisible] = React.useState<boolean>(false);

	useTree(todoItemModel);

	React.useEffect(() => {
		todoItemModel.title
			.get()
			.then((text) => {
				setItemTitle(text as SharedString);
			})
			.catch((error) => {
				console.error("Failed to load title:", error);
			});
	}, [todoItemModel.title]);

	React.useEffect(() => {
		todoItemModel.description
			.get()
			.then((text) => {
				setItemDescription(text as SharedString);
			})
			.catch((error) => {
				console.error("Failed to load description:", error);
			});
	}, [todoItemModel.description]);

	const checkChangedHandler = (e: React.ChangeEvent<HTMLInputElement>): void => {
		todoItemModel.completed = e.target.checked;
	};

	if (itemTitle === undefined || itemDescription === undefined) {
		return <div>Loading item...</div>;
	}

	return (
		<div className={`todo-item${className === undefined ? "" : ` ${className}`}`}>
			<h2 className={styles.todoItemHeader}>
				<input
					type="checkbox"
					className={styles.todoItemCheckbox}
					checked={todoItemModel.completed}
					onChange={checkChangedHandler}
				/>
				<button
					className={styles.todoItemExpandButton}
					name="toggleDetailsVisible"
					onClick={() => {
						setDetailsVisible(!detailsVisible);
					}}
				>
					{detailsVisible ? "▲" : "▼"}
				</button>
				<CollaborativeInput sharedString={itemTitle} className={styles.todoItemInput} />
			</h2>
			{detailsVisible && (
				<CollaborativeTextArea
					className={styles.todoItemDetails}
					sharedStringHelper={new SharedStringHelper(itemDescription)}
				/>
			)}
		</div>
	);
};
