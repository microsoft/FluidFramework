/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISharedMap, SharedMap } from "@fluidframework/map/legacy";
import { SharedString } from "@fluidframework/sequence/legacy";
import { v4 as uuid } from "uuid";

import { ITodoItemInitialState, TodoItem, TodoItemFactory } from "../TodoItem/index.js";

export const TodoName = "Todo";

const todoItemsKey = "todo-items";
const todoTitleKey = "todo-title";

/**
 * Todo data object.
 * Contains the following:
 * - Title
 * - List of todo items
 */
export class Todo extends DataObject {
	private _todoItemsMap: ISharedMap | undefined;
	private get todoItemsMap(): ISharedMap {
		if (this._todoItemsMap === undefined) {
			throw new Error("Attempted to access todoItemsMap before initialized");
		}
		return this._todoItemsMap;
	}

	/**
	 * Create the map for todo items and a string for the title
	 */
	protected async initializingFirstTime() {
		const map = SharedMap.create(this.runtime);
		this.root.set(todoItemsKey, map.handle);

		const text = SharedString.create(this.runtime);
		text.insertText(0, "Title");
		this.root.set(todoTitleKey, text.handle);
	}

	protected async hasInitialized() {
		const todoItemsHandle = this.root.get<IFluidHandle<ISharedMap>>(todoItemsKey);
		if (todoItemsHandle === undefined) {
			throw new Error("Todo items ISharedMap missing");
		}
		this._todoItemsMap = await todoItemsHandle.get();
		// Hide the DDS eventing used by the model, expose a model-specific event interface.
		this.todoItemsMap.on("valueChanged", (changed, local) => {
			if (!local) {
				this.emit("todoItemsChanged");
			}
		});
	}

	// start public API surface for the Todo model, used by the view

	// Would prefer not to hand this out, and instead give back a title object?
	public async getTodoTitleString() {
		const todoTitleHandle = this.root.get<IFluidHandle<SharedString>>(todoTitleKey);
		if (todoTitleHandle === undefined) {
			throw new Error("Todo title SharedString missing");
		}
		return todoTitleHandle.get();
	}

	public async addTodoItem(props?: ITodoItemInitialState) {
		// Create a new todo item
		const todoItem = await TodoItemFactory.createChildInstance(this.context, props);

		// Generate an ID that we can sort on later, and store the handle.
		const id = `${Date.now()}-${uuid()}`;

		this.todoItemsMap.set(id, todoItem.handle);

		this.emit("todoItemsChanged");
	}

	public async getTodoItems(): Promise<[string, TodoItem][]> {
		const todoItemsEntries: [string, IFluidHandle<TodoItem>][] = [
			...this.todoItemsMap.entries(),
		];
		const todoItemsEntriesResolvedP = todoItemsEntries.map(
			async ([key, todoItemHandle]): Promise<[string, TodoItem]> => {
				const todoItem = await todoItemHandle.get();
				return [key, todoItem];
			},
		);
		const todoItemsEntriesResolved = await Promise.all(todoItemsEntriesResolvedP);
		todoItemsEntriesResolved.sort((entryA, entryB) => {
			// Sort on keys as strings
			return entryA[0].localeCompare(entryB[0]);
		});
		return todoItemsEntriesResolved;
	}

	public async getTodoItem(id: string) {
		const maybeHandle: IFluidHandle<TodoItem> | undefined = this.todoItemsMap.get(id);
		if (maybeHandle !== undefined) {
			return maybeHandle.get();
		}
	}

	public deleteTodoItem(id: string) {
		if (this.todoItemsMap.delete(id)) {
			this.emit("todoItemsChanged");
		}
	}

	// end public API surface for the Todo model, used by the view
}

export const TodoFactory = new DataObjectFactory(
	TodoName,
	Todo,
	[SharedMap.getFactory(), SharedString.getFactory()],
	{},
	new Map([TodoItemFactory.registryEntry]),
);
