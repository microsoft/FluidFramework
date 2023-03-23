/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrationTool } from "@fluid-example/example-utils";
import { ISharedTree, JsonableTree, jsonableTreeFromCursor, mapCursorField, moveToDetachedField, rootFieldKeySymbol, runSynchronous, singleTextCursor } from "@fluid-internal/tree";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { AttachState, IContainer } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";

import { readVersion } from "../dataTransform";
import type {
	IInventoryListAppModel,
	IInventoryListAppModelEvents,
	IInventoryList,
} from "../modelInterfaces";
import { appSchemaData } from "./inventoryList";

// This type represents a stronger expectation than just any string - it needs to be in the right format.
export type InventoryListAppModelExportFormat2 = string;

/**
 * The InventoryListAppModel serves the purpose of wrapping this particular Container in a friendlier interface,
 * with stronger typing and accessory functionality.  It should have the same layering restrictions as we want for
 * the Container (e.g. no direct access to the Loader).  It does not have a goal of being general-purpose like
 * Container does -- instead it is specially designed for the specific container code.
 */
export class InventoryListAppModel
	extends TypedEventEmitter<IInventoryListAppModelEvents>
	implements IInventoryListAppModel
{
	// To be used by the consumer of the model to pair with an appropriate view.
	public readonly version = "two";

	public constructor(
		public readonly inventoryList: IInventoryList,
		public readonly migrationTool: IMigrationTool,
		private readonly container: IContainer,
	) {
		super();
		this.container.on("connected", () => {
			this.emit("connected");
		});
	}

	public readonly supportsDataFormat = (
		initialData: unknown,
	): initialData is InventoryListAppModelExportFormat2 => {
		return typeof initialData === "string" && readVersion(initialData) === "two";
	};

	// Ideally, prevent this from being called after the container has been modified at all -- i.e. only support
	// importing data into a completely untouched InventoryListAppModel.
	public readonly importData = async (initialData: unknown): Promise<void> => {
		if (this.container.attachState !== AttachState.Detached) {
			throw new Error("Cannot set initial data after attach");
		}
		if (!this.supportsDataFormat(initialData)) {
			throw new Error("Data format not supported");
		}
		const treeData = initialData.split("\n");
		treeData.shift(); // remove version line
		const tree = this.inventoryList.tree as ISharedTree;
		const jsonableTree: JsonableTree = JSON.parse(treeData[0]);

		tree.storedSchema.update(appSchemaData);
		console.log(jsonableTree);
		runSynchronous(tree, () => {
			const writeCursors = singleTextCursor(jsonableTree);
			const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
			field.insert(0, writeCursors);
		});

		this.inventoryList.tree = tree;
		console.log(this.inventoryList.getTreeView());
		const nodeIds = []
		getNodeIdList(jsonableTree, nodeIds)
		console.log(nodeIds)

		this.inventoryList.nodeIds = nodeIds
		// // Applies string data in version:two format.
		// const parsedInventoryItemData = parseStringDataVersionTwo(initialData);
		// for (const { name, quantity } of parsedInventoryItemData) {
		// 	this.inventoryList.addItem(name, quantity);
		// }
	};

	public readonly exportData = async (): Promise<InventoryListAppModelExportFormat2> => {
		// Exports in version:two format (using tab delimiter between name/quantity)
		// const inventoryItems = this.inventoryList.getItems();
		// const inventoryItemStrings = inventoryItems.map((inventoryItem) => {
		// 	return `${inventoryItem.name.getText()}\t${inventoryItem.quantity.toString()}`;
		// });
		// return `version:two\n${inventoryItemStrings.join("\n")}`;
		const tree = this.inventoryList.tree as ISharedTree;
		const stringifiedTree = transformTreeToString(tree);
		return `version:two\n${stringifiedTree}`;
	};

	public connected() {
		return this.container.connectionState === ConnectionState.Connected;
	}

	public close() {
		this.container.close();
	}
}

function transformTreeToString(tree: ISharedTree): string {
	const readCursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, readCursor);
	const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
	readCursor.free();
	// we need to get a hashmap of each identifier in its corresponding parent identifier
	console.log(actual)
	return JSON.stringify(actual);
}

function getNodeIdList(tree:JsonableTree, nodeIds: string[]): void{
	for (const key of Object.keys(tree)) {
		if (typeof tree[key] === "object" && tree[key] !== null) {
			getNodeIdList(tree[key], nodeIds);
		}
		if (key === "value") {
			// assert(tree[key] !== undefined);
			if (typeof tree[key] !== "object") {
				nodeIds.push(tree[key] as string)
			}
		}
	}
}