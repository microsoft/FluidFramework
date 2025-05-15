/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CollaborativeInput,
	CollaborativeTextArea,
	SharedStringHelper,
} from "@fluid-example/example-utils";
import type { SharedString } from "@fluidframework/sequence/internal";
import { Tree, type TreeNode } from "@fluidframework/tree/internal";
import React from "react";

import type { TodoItem } from "../Schema.js";

/**
 * {@link TodoItemView} input props.
 * @internal
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
			<h2 className="todo-item-header">
				<input
					type="checkbox"
					className="todo-item-checkbox"
					checked={todoItemModel.completed}
					onChange={checkChangedHandler}
				/>
				<button
					className="todo-item-expand-button"
					name="toggleDetailsVisible"
					onClick={() => {
						setDetailsVisible(!detailsVisible);
					}}
				>
					{detailsVisible ? "▲" : "▼"}
				</button>
				<CollaborativeInput sharedString={itemTitle} className="todo-item-input" />
			</h2>
			{detailsVisible && (
				<CollaborativeTextArea
					className="todo-item-details"
					sharedStringHelper={new SharedStringHelper(itemDescription)}
				/>
			)}
		</div>
	);
};

/**
 * Custom hook which invalidates a React Component when there is a change in the subtree defined by `subtreeRoot`.
 * This includes changes to the tree's content, but not changes to its parentage.
 * See {@link @fluidframework/tree#TreeChangeEvents.treeChanged} for details.
 * @privateRemarks
 * Without a way to get invalidation callbacks for specific fields,
 * it's impractical to implement an ergonomic and efficient more fine-grained invalidation hook.
 * TODO: This was copied over from "fluid-experimental/tree-react-api".
 * Once the API has stabilized, this local copy should be removed and import from that package.
 * @public
 */
export function useTree(subtreeRoot: TreeNode): void {
	// Use a React effect hook to invalidate this component when the subtreeRoot changes.
	// We do this by incrementing a counter, which is passed as a dependency to the effect hook.
	const [invalidations, setInvalidations] = React.useState(0);

	// React effect hook that increments the 'invalidation' counter whenever subtreeRoot or any of its children change.
	React.useEffect(() => {
		// Returns the cleanup function to be invoked when the component unmounts.
		return Tree.on(subtreeRoot, "treeChanged", () => {
			setInvalidations((i) => i + 1);
		});
	}, [invalidations, subtreeRoot]);
}
