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
import { Tree } from "@fluidframework/tree";
import React, { useEffect, useState } from "react";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";
import type { TodoTreeItem } from "../Todo/index.js";

interface TodoItemViewProps {
	readonly todoItemModel: TodoTreeItem;
	readonly className?: string;
}

export const TodoItemView: React.FC<TodoItemViewProps> = (props: TodoItemViewProps) => {
	const { todoItemModel, className } = props;

	const [itemText, setItemText] = useState<SharedString | undefined>(undefined);
	const [detailedText, setDetailedText] = useState<SharedString | undefined>(undefined);
	const [checked, setChecked] = useState<boolean>(todoItemModel.getCheckedState());
	const [detailsVisible, setDetailsVisible] = useState<boolean>(false);

	useEffect(() => {
		void Promise.resolve(todoItemModel.text.get()).then((text) => {
			setItemText(text as SharedString); // cast if necessary
		});
	}, [todoItemModel]);

	useEffect(() => {
		void Promise.resolve(todoItemModel.detailedText.get()).then((text) => {
			setDetailedText(text as SharedString); // cast if necessary
		});
	}, [todoItemModel]);

	useEffect(() => {
		const refreshCheckedStateFromModel = () => {
			setChecked(todoItemModel.getCheckedState());
		};

		Tree.on(todoItemModel, "treeChanged", refreshCheckedStateFromModel);
		refreshCheckedStateFromModel();

		return () => {
			// Clean up listeners
		};
	}, [todoItemModel]);

	const checkChangedHandler = (e: React.ChangeEvent<HTMLInputElement>): void => {
		todoItemModel.setCheckedState(e.target.checked);
	};

	if (itemText === undefined || detailedText === undefined) {
		return <div>Loading item...</div>;
	}

	return (
		<div className={`todo-item${className !== undefined ? ` ${className}` : ""}`}>
			<h2 className="todo-item-header">
				<input
					type="checkbox"
					className="todo-item-checkbox"
					checked={checked}
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
				<CollaborativeInput sharedString={itemText} className="todo-item-input" />
			</h2>
			{detailsVisible && (
				<CollaborativeTextArea
					className="todo-item-details"
					sharedStringHelper={new SharedStringHelper(detailedText)}
				/>
			)}
		</div>
	);
};
