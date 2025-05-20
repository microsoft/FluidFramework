/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DataObject,
	DataObjectFactory,
	PureDataObjectFactory,
	TreeDataObject,
} from "@fluidframework/aqueduct/internal";
import { SharedCell } from "@fluidframework/cell/internal";
import type { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter/internal";
import { SharedMatrix } from "@fluidframework/matrix/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import { type ITree, SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree, type TreeView } from "@fluidframework/tree/internal";
import { v4 as uuid } from "uuid";

import { TodoList, TodoItem } from "./Schema.js";

/**
 * Props used when creating a new todo item.
 */
interface TodoItemProps {
	/**
	 * The initial text to populate the todo item's title with.
	 * This value will be inserted into the shared string at index 0.
	 */
	readonly startingText: string;
}

/**
 * Object so we can test {@link TreeDataObject} inside {@link AppData}.
 */
export class AppDataTree extends TreeDataObject<TreeView<typeof TodoList>> {
	public static readonly Name = "@devtools-example/test-app-tree-data-object";

	private readonly config = new TreeViewConfiguration({ schema: TodoList });
	private static readonly factory = new PureDataObjectFactory<
		TreeDataObject<TreeView<typeof TodoList>>
	>(AppDataTree.Name, AppDataTree, [SharedString.getFactory(), SharedTree.getFactory()], {});

	public static getFactory(): PureDataObjectFactory<
		TreeDataObject<TreeView<typeof TodoList>>
	> {
		return AppDataTree.factory;
	}

	/**
	 * Converts the underlying ITree into a typed TreeView using the provided schema configuration.
	 *
	 * @param tree - The ITree instance to view.
	 * @returns A typed TreeView using the TodoList schema.
	 */
	public override generateView(tree: ITree): TreeView<typeof TodoList> {
		return tree.viewWith(this.config) as unknown as TreeView<typeof TodoList>;
	}

	/**
	 * Initializes the tree with a default title and empty todo item list.
	 * @remarks Called during the initial creation of the data object.
	 */
	public override async initializingFirstTime(): Promise<void> {
		const title = SharedString.create(this.runtime);
		title.insertText(0, "Title");

		this.treeView.initialize(new TodoList({ title: title.handle, items: [] }));
	}

	/**
	 * Adds a new todo item to the list.
	 *
	 * @param props
	 * -`startingText`: The text to prefill into the item's title.
	 *
	 * @privateRemarks
	 * This method was placed in the data object (instead of the TodoList schema class),
	 * as we needed access to the runtime to create the `SharedString`.
	 */
	public async addTodoItem(props?: TodoItemProps): Promise<void> {
		const title = SharedString.create(this.runtime);
		const newItemText = props?.startingText ?? "New Item";
		title.insertText(0, newItemText);
		const description = SharedString.create(this.runtime);

		const todoItem = new TodoItem({
			title: title.handle,
			description: description.handle,
			completed: false,
		});

		// TODO: We should consider creating a separate field for date, so that we do not need to
		// concatenate it to the id.
		// Generate an ID that we can sort on later, and store the todo item.
		const id = `${Date.now()}-${uuid()}`;

		this.treeView.root.items.set(id, todoItem);
	}
}

/**
 * Additional Data Object added to the {@link AppData}.
 */
export class AppDataTwo extends DataObject {
	/**
	 * Key in the app's `rootMap` under which the SharedString object is stored.
	 */
	private readonly sharedTextKey = "shared-text";

	public static readonly Name = "@devtools-example/test-app-2";

	private _text: SharedString | undefined;

	public get text(): SharedString {
		if (this._text === undefined) {
			throw new Error("The SharedString was not initialized correctly");
		}
		return this._text;
	}

	private static readonly factory = new DataObjectFactory({
		type: AppDataTwo.Name,
		ctor: AppDataTwo,
		sharedObjects: [SharedString.getFactory()],
	});

	public static getFactory(): DataObjectFactory<AppDataTwo> {
		return this.factory;
	}

	protected async initializingFirstTime(): Promise<void> {
		// Create the shared objects and store their handles in the root SharedDirectory
		const text = SharedString.create(this.runtime, this.sharedTextKey);

		this.root.set(this.sharedTextKey, text.handle);
		this.root.set("test-object-two", {
			a: true,
			b: "hello world",
			c: 1,
		});
	}

	protected async hasInitialized(): Promise<void> {
		this._text = await this.root.get<IFluidHandle<SharedString>>(this.sharedTextKey)?.get();
	}
}

/**
 * AppData uses the React CollaborativeTextArea to load a collaborative HTML <textarea>
 */
export class AppData extends DataObject {
	/**
	 * Key in the app's `rootMap` under which the SharedString object is stored.
	 */
	private readonly sharedTextKey = "shared-text";

	/**
	 * Key in the app's `rootMap` under which the SharedCounter object is stored.
	 */
	private readonly sharedCounterKey = "shared-counter";

	/**
	 * Key in the app's `rootMap` under which the SharedCell object is stored.
	 */
	private readonly emojiMatrixKey = "emoji-matrix";

	/**
	 * Key in the app's `rootMap` under which the SharedTree object is stored.
	 */
	private readonly sharedTreeKey = "shared-tree";

	/**
	 * Key in the app's `rootMap` under which the SharedDirectory object is stored.
	 */
	private readonly initialObjectsDirKey = "rootMap";

	/**
	 * Key in the app's `rootMap` under which the RootDataObject object is stored.
	 */
	private readonly dataObjectKey = "shared-data-object";

	/**
	 * Key in the app's `rootMap` under which the {@link AppDataTree} object is stored.
	 */
	private readonly treeDataObjectKey = "tree-data-object";

	// previous app's `rootMap`
	private readonly _initialObjects: Record<string, IFluidLoadable> = {};
	private _sharedTree: ITree | undefined;
	private _text: SharedString | undefined;
	private _counter: SharedCounter | undefined;
	private _emojiMatrix: SharedMatrix | undefined;
	private _treeDataObject: AppDataTree | undefined;

	public get text(): SharedString {
		if (this._text === undefined) {
			throw new Error("The SharedString was not initialized correctly");
		}
		return this._text;
	}

	public get counter(): SharedCounter {
		if (this._counter === undefined) {
			throw new Error("The SharedCounter was not initialized correctly");
		}
		return this._counter;
	}

	public get emojiMatrix(): SharedMatrix {
		if (this._emojiMatrix === undefined) {
			throw new Error("The SharedMatrix was not initialized correctly");
		}
		return this._emojiMatrix;
	}

	public get sharedTree(): ITree {
		if (this._sharedTree === undefined) {
			throw new Error("The SharedTree was not initialized correctly");
		}
		return this._sharedTree;
	}

	public get treeDataObject(): AppDataTree {
		if (this._treeDataObject === undefined) {
			throw new Error("The TreeDataObject was not initialized correctly");
		}
		return this._treeDataObject;
	}

	public getRootObject(): Record<string, IFluidLoadable> {
		return this._initialObjects;
	}

	public static readonly Name = "@devtools-example/test-app";

	private static readonly factory = new DataObjectFactory({
		type: AppData.Name,
		ctor: AppData,
		sharedObjects: [
			SharedString.getFactory(),
			SharedCounter.getFactory(),
			SharedMatrix.getFactory(),
			SharedCell.getFactory(),
			SharedTree.getFactory(),
		],
		registryEntries: new Map([
			AppDataTwo.getFactory().registryEntry,
			AppDataTree.getFactory().registryEntry,
		]),
	});

	public static getFactory(): DataObjectFactory<AppData> {
		return this.factory;
	}

	protected async initializingFirstTime(): Promise<void> {
		// Create the shared objects and store their handles in the root SharedDirectory
		const text = SharedString.create(this.runtime, this.sharedTextKey);
		const counter = SharedCounter.create(this.runtime, this.sharedCounterKey);
		const sharedTree = SharedTree.create(this.runtime, this.sharedTreeKey);

		const emojiMatrix = SharedMatrix.create(this.runtime, this.emojiMatrixKey);
		const matrixDimension = 2; // Height and Width
		emojiMatrix.insertRows(0, matrixDimension);
		emojiMatrix.insertCols(0, matrixDimension);
		for (let row = 0; row < matrixDimension; row++) {
			for (let col = 0; col < matrixDimension; col++) {
				const emojiCell = SharedCell.create(this.runtime);
				emojiMatrix.setCell(row, col, emojiCell.handle);
			}
		}
		this.populateSharedTree(sharedTree);

		const appDataTwo = await AppDataTwo.getFactory().createChildInstance(this.context);
		const appDataTree = await AppDataTree.getFactory().createChildInstance(this.context);

		this.root.set(this.sharedTextKey, text.handle);
		this.root.set(this.sharedCounterKey, counter.handle);
		this.root.set(this.emojiMatrixKey, emojiMatrix.handle);
		this.root.set(this.sharedTreeKey, sharedTree.handle);
		this.root.set(this.dataObjectKey, appDataTwo.handle);
		this.root.set(this.treeDataObjectKey, appDataTree.handle);

		// Also set a couple of primitives for testing the debug view
		this.root.set("numeric-value", 42);
		this.root.set("string-value", "Hello world!");
		this.root.set("record-value", {
			aNumber: 37,
			aString: "Here is some text content.",
			anObject: {
				a: "a",
				b: "b",
			},
		});

		this._initialObjects[this.initialObjectsDirKey] = this.root;
	}

	protected async hasInitialized(): Promise<void> {
		// Store the objects if we are loading the first time or loading from existing
		this._text = await this.root.get<IFluidHandle<SharedString>>(this.sharedTextKey)?.get();
		this._counter = await this.root
			.get<IFluidHandle<SharedCounter>>(this.sharedCounterKey)
			?.get();
		this._emojiMatrix = await this.root
			.get<IFluidHandle<SharedMatrix>>(this.emojiMatrixKey)
			?.get();
		this._treeDataObject = await this.root
			.get<IFluidHandle<AppDataTree>>(this.treeDataObjectKey)
			?.get();
		const sharedTree = await this.root.get<IFluidHandle<ITree>>(this.sharedTreeKey)?.get();
		if (sharedTree === undefined) {
			throw new Error("SharedTree was not initialized");
		} else {
			this._sharedTree = sharedTree;
		}
	}

	private populateSharedTree(sharedTree: ITree): void {
		const builder = new SchemaFactory("TodoList_Schema");

		class WorkItem extends builder.object("work-item", {
			title: builder.string,
			completed: builder.boolean,
			dueDate: builder.string,
			assignee: builder.string,
			collaborators: builder.optional(builder.array(builder.string)),
		}) {}

		class PersonalItem extends builder.object("personal-item", {
			title: builder.string,
			completed: builder.boolean,
			dueDate: builder.string,
			location: builder.optional(builder.string),
			with: builder.optional(builder.array(builder.string)),
		}) {}

		class TodoWorkspace extends builder.object("todo-workspace", {
			categories: builder.object("todo-categories", {
				work: [builder.map([WorkItem]), builder.array(WorkItem)],
				personal: [builder.map([PersonalItem]), builder.array(PersonalItem)],
			}),
		}) {}

		const config = new TreeViewConfiguration({
			schema: [TodoWorkspace],
		});

		const view = sharedTree.viewWith(config);
		view.initialize(
			new TodoWorkspace({
				categories: {
					work: [
						{
							title: "Submit a PR",
							completed: false,
							dueDate: "2026-01-01",
							assignee: "Alice",
							collaborators: ["Bob", "Charlie"],
						},
						{
							title: "Review a PR",
							completed: true,
							dueDate: "2025-01-01",
							assignee: "David",
						},
					],
					personal: new Map([
						[
							"Health",
							{
								title: "Go to the gym",
								completed: true,
								dueDate: "2025-01-01",
								with: ["Wayne", "Tyler"],
							},
						],
						[
							"Education",
							{
								title: "Finish reading the book",
								completed: false,
								dueDate: "2026-01-01",
							},
						],
					]),
				},
			}),
		);
	}
}
