/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import { SharedCell } from "@fluidframework/cell/internal";
import type { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter/internal";
import { SharedMatrix } from "@fluidframework/matrix/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import { type ITree, SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";
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

	// previous app's `rootMap`
	private readonly _initialObjects: Record<string, IFluidLoadable> = {};
	private _sharedTree: ITree | undefined;
	private _text: SharedString | undefined;
	private _counter: SharedCounter | undefined;
	private _emojiMatrix: SharedMatrix | undefined;

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

	public getRootObject(): Record<string, IFluidLoadable> {
		return this._initialObjects;
	}

	public static readonly Name = "@devtools-example/test-app";

	private static readonly factory = new DataObjectFactory(
		AppData.Name,
		AppData,
		[
			SharedString.getFactory(),
			SharedCounter.getFactory(),
			SharedMatrix.getFactory(),
			SharedCell.getFactory(),
			SharedTree.getFactory(),
		],
		{},
	);

	public static getFactory(): DataObjectFactory<AppData> {
		return this.factory;
	}

	protected async initializingFirstTime(): Promise<void> {
		// Create the shared objects and store their handles in the root SharedDirectory
		const text = SharedString.create(this.runtime, this.sharedTextKey);
		const counter = SharedCounter.create(this.runtime, this.sharedCounterKey);
		const sharedTree = SharedTree.create(this.runtime);

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

		this.root.createSubDirectory(this.initialObjectsDirKey);
		this.root.set(this.sharedTextKey, text.handle);
		this.root.set(this.sharedCounterKey, counter.handle);
		this.root.set(this.emojiMatrixKey, emojiMatrix.handle);
		this.root.set(this.sharedTreeKey, sharedTree.handle);

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

		this._initialObjects[this.initialObjectsDirKey] = this.root.IFluidLoadable;
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
		const sharedTree = await this.root.get<IFluidHandle<ITree>>(this.sharedTreeKey)?.get();
		if (sharedTree === undefined) {
			throw new Error("SharedTree was not initialized");
		} else {
			this._sharedTree = sharedTree;

			// We will always load the initial objects so they are available to the developer
			const loadInitialObjectsP: Promise<void>[] = [];
			const dir = this.root.getSubDirectory(this.initialObjectsDirKey);
			if (dir === undefined) {
				throw new Error("InitialObjects sub-directory was not initialized");
			}

			for (const [key, value] of dir.entries()) {
				// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
				const loadDir = async () => {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
					const obj = await value.get();
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					Object.assign(this._initialObjects, { [key]: obj });
				};
				loadInitialObjectsP.push(loadDir());
			}

			await Promise.all(loadInitialObjectsP);
		}
	}

	private populateSharedTree(sharedTree: ITree): void {
		// Set up SharedTree for visualization
		const builder = new SchemaFactory("DefaultVisualizer_SharedTree_Test");

		// TODO: Maybe include example handle
		class LeafNodeSchema extends builder.object("leaf-node", {
			value: [builder.boolean, builder.handle, builder.string],
		}) {}

		class ArrayNodeSchema extends builder.object("array-node", {
			value: [builder.string, builder.boolean],
			childLeaf: builder.optional(LeafNodeSchema),
		}) {}

		class BranchNodeSchema extends builder.object("branch-node", {
			arrayOrHandleNode: [builder.array(ArrayNodeSchema), builder.handle],
			numericLeafNode: builder.number,
		}) {}

		class MainBranchA extends builder.object("main-object-a", {
			numericLeafNode: builder.optional(builder.number),
			objectNode: BranchNodeSchema,
		}) {}

		class MainBranchB extends builder.object("main-object-b", {
			numericLeafNode: builder.optional(builder.number),
			booleanValue: builder.boolean,
		}) {}

		class RootField extends builder.object("root-field-b", {
			mainObjectNode: builder.optional([MainBranchA, MainBranchB]),
		}) {}

		const config = new TreeViewConfiguration({
			schema: [RootField, builder.number],
		});
		const view = sharedTree.viewWith(config);
		view.initialize({
			mainObjectNode: {
				numericLeafNode: 42,
				objectNode: {
					arrayOrHandleNode: [
						{
							value: false,
							childLeaf: {
								value: "hello world!",
							},
						},
						{
							value: true,
						},
					],
					numericLeafNode: 123,
				},
			},
		});
	}
}
