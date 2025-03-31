/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CollaborativeInput,
	CollaborativeTextArea,
	SharedStringHelper,
} from "@fluid-example/example-utils";
import type { SharedString } from "@fluidframework/sequence/legacy";
import React, { useEffect, useState } from "react";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";
import { type TodoItem } from "../Todo/index.js";
import { useTree } from "../Utils/index.js";

interface TodoItemViewProps {
	readonly todoItemModel: TodoItem;
	readonly className?: string;
}

export const TodoItemView: React.FC<TodoItemViewProps> = (props: TodoItemViewProps) => {
	const { todoItemModel, className } = props;

	const [itemTitle, setItemTitle] = useState<SharedString | undefined>(undefined);
	const [itemDescription, setItemDescription] = useState<SharedString | undefined>(undefined);
	const [detailsVisible, setDetailsVisible] = useState<boolean>(false);

	useTree(todoItemModel);

	useEffect(() => {
		void Promise.resolve(todoItemModel.title.get()).then((text) => {
			setItemTitle(text as SharedString);
		});
	}, [todoItemModel.title]);

	useEffect(() => {
		void Promise.resolve(todoItemModel.description.get()).then((text) => {
			setItemDescription(text as SharedString);
		});
	}, [todoItemModel.description]);

	const checkChangedHandler = (e: React.ChangeEvent<HTMLInputElement>): void => {
		todoItemModel.completed = e.target.checked;
	};

	if (itemTitle === undefined || itemDescription === undefined) {
		return <div>Loading item...</div>;
	}

	return (
		<div className={`todo-item${className !== undefined ? ` ${className}` : ""}`}>
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
