/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CollaborativeInput,
	CollaborativeTextArea,
	SharedStringHelper,
} from "@fluid-example/example-utils";
import { useTree } from "@fluid-experimental/tree-react-api";
import type { IFluidContainer } from "fluid-framework";
import type { ISharedString, SharedString } from "fluid-framework/legacy";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

import { createTodoItem, type TodoListContainerSchema } from "./fluid.js";
import type { TodoList, TodoItem } from "./schema.js";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

const ContainerContext = createContext<IFluidContainer | undefined>(undefined);

/**
 * {@link TodoListAppView} input props.
 */
export interface TodoListAppViewProps {
	readonly todoList: TodoList;
	readonly container: IFluidContainer<TodoListContainerSchema>;
}

/**
 * TODO list application view component.
 */
export const TodoListAppView: React.FC<TodoListAppViewProps> = (
	props: TodoListAppViewProps,
) => {
	const { todoList, container } = props;

	// Use the container context to provide the container to child components.
	// This allows child components to create DDSs dynamically.
	return (
		<ContainerContext.Provider value={container}>
			<TodoListView todoList={todoList} />
		</ContainerContext.Provider>
	);
};

/**
 * {@link TodoListView} input props.
 */
interface TodoListViewProps {
	readonly todoList: TodoList;
}

/**
 * TODO list view component.
 */
const TodoListView: React.FC<TodoListViewProps> = (props: TodoListViewProps) => {
	const { todoList } = props;
	const [titleString, setTitleString] = useState<SharedString | undefined>();

	const newItemTextInputRef = useRef<HTMLInputElement>(null);
	useTree(todoList);
	const container = useContext(ContainerContext) ?? fail("Container context is not defined.");

	const todoListTitleHandle = todoList.title;

	useEffect(() => {
		todoListTitleHandle
			.get()
			.then((title) => {
				setTitleString(title as ISharedString);
			})
			.catch((error) => {
				console.error("Failed to get TODO list title:", error);
				throw error;
			});
		return () => {};
	}, [todoListTitleHandle]);

	if (titleString === undefined) {
		return <div>Loading...</div>;
	}
	const handleCreateClick = (ev: React.FormEvent<HTMLFormElement>): void => {
		ev.preventDefault();

		const input = newItemTextInputRef.current;
		if (input === null) {
			throw new Error("New item text field missing");
		}

		createTodoItem({
			container,
			initialTitleText: input.value,
			completed: false,
		})
			.then((todoItem) => {
				todoList.items.insertAtEnd(todoItem);
				if (input !== null) {
					input.value = "";
				}
			})
			.catch((error) => {
				console.error("Failed to create TODO item:", error);
				throw error;
			});
	};

	// Using the list of TodoItem objects, make a list of TodoItemViews.
	const todoItemViews = todoList.items.map((todoItem, index) => (
		<div className="item-wrap" key={todoItem.id}>
			<TodoItemView todoItem={todoItem} />
			<button
				className="action-button"
				onClick={() => {
					todoList.items.removeAt(index);
				}}
			>
				X
			</button>
		</div>
	));

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

/**
 * {@link TodoItemView} input props.
 */
interface TodoItemViewProps {
	readonly todoItem: TodoItem;
}

/**
 * TODO list item view component.
 */
const TodoItemView: React.FC<TodoItemViewProps> = (props: TodoItemViewProps) => {
	const { todoItem } = props;

	const [itemTitle, setItemTitle] = useState<SharedString | undefined>(undefined);
	const [itemDescription, setItemDescription] = useState<SharedString | undefined>(undefined);
	const [detailsVisible, setDetailsVisible] = useState<boolean>(false);

	useTree(todoItem);

	const todoItemTitleHandle = todoItem.title;
	useEffect(() => {
		todoItemTitleHandle
			.get()
			.then((text) => {
				setItemTitle(text as SharedString);
			})
			.catch((error) => {
				console.error("Failed to get TODO item title:", error);
				throw error;
			});
	}, [todoItemTitleHandle]);

	const todoItemDescriptionHandle = todoItem.description;
	useEffect(() => {
		todoItemDescriptionHandle
			.get()
			.then((text) => {
				setItemDescription(text as SharedString);
			})
			.catch((error) => {
				console.error("Failed to get TODO item description:", error);
				throw error;
			});
	}, [todoItemDescriptionHandle]);

	const checkChangedHandler = (e: React.ChangeEvent<HTMLInputElement>): void => {
		todoItem.completed = e.target.checked;
	};

	if (itemTitle === undefined || itemDescription === undefined) {
		return <div>Loading item...</div>;
	}

	return (
		<div className="todo-item">
			<h2 className="todo-item-header">
				<input
					type="checkbox"
					className="todo-item-checkbox"
					checked={todoItem.completed}
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
