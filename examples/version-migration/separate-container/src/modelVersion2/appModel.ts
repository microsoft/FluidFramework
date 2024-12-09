/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parseStringDataVersionTwo, readVersion } from "../dataTransform.js";
import type { IMigratableModel } from "../migratableModel.js";
import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces.js";

// This type represents a stronger expectation than just any string - it needs to be in the right format.
export type InventoryListAppModelExportFormat2 = string;

/**
 * The InventoryListAppModel serves the purpose of wrapping this particular Container in a friendlier interface,
 * with stronger typing and accessory functionality.  It should have the same layering restrictions as we want for
 * the Container (e.g. no direct access to the Loader).  It does not have a goal of being general-purpose like
 * Container does -- instead it is specially designed for the specific container code.
 */
export class InventoryListAppModel implements IInventoryListAppModel, IMigratableModel {
	// To be used by the consumer of the model to pair with an appropriate view.
	public readonly version = "two";

	public constructor(public readonly inventoryList: IInventoryList) {}

	public readonly supportsDataFormat = (
		initialData: unknown,
	): initialData is InventoryListAppModelExportFormat2 => {
		return typeof initialData === "string" && readVersion(initialData) === "two";
	};

	public readonly importData = async (initialData: unknown): Promise<void> => {
		if (!this.supportsDataFormat(initialData)) {
			throw new Error("Data format not supported");
		}

		// Applies string data in version:two format.
		const parsedInventoryItemData = parseStringDataVersionTwo(initialData);
		for (const { name, quantity } of parsedInventoryItemData) {
			this.inventoryList.addItem(name, quantity);
		}
	};

	public readonly exportData = async (): Promise<InventoryListAppModelExportFormat2> => {
		// Exports in version:two format (using tab delimiter between name/quantity)
		const inventoryItems = this.inventoryList.getItems();
		const inventoryItemStrings = inventoryItems.map((inventoryItem) => {
			return `${inventoryItem.name.getText()}\t${inventoryItem.quantity.toString()}`;
		});
		return `version:two\n${inventoryItemStrings.join("\n")}`;
	};
}
