/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigratableModel } from "@fluid-example/migration-tools/internal";
import { AttachState } from "@fluidframework/container-definitions";
import { IContainer, DisconnectReason } from "@fluidframework/container-definitions/internal";

import { parseStringDataVersionOne, readVersion } from "../dataTransform.js";
import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces.js";

// This type represents a stronger expectation than just any string - it needs to be in the right format.
export type InventoryListAppModelExportFormat1 = string;

/**
 * The InventoryListAppModel serves the purpose of wrapping this particular Container in a friendlier interface,
 * with stronger typing and accessory functionality.  It should have the same layering restrictions as we want for
 * the Container (e.g. no direct access to the Loader).  It does not have a goal of being general-purpose like
 * Container does -- instead it is specially designed for the specific container code.
 */
export class InventoryListAppModel implements IInventoryListAppModel, IMigratableModel {
	// To be used by the consumer of the model to pair with an appropriate view.
	public readonly version = "one";

	public constructor(
		public readonly inventoryList: IInventoryList,
		private readonly container: IContainer,
	) {}

	public readonly supportsDataFormat = (
		initialData: unknown,
	): initialData is InventoryListAppModelExportFormat1 => {
		return typeof initialData === "string" && readVersion(initialData) === "one";
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

		// Applies string data in version:one format.
		const parsedInventoryItemData = parseStringDataVersionOne(initialData);
		for (const { name, quantity } of parsedInventoryItemData) {
			this.inventoryList.addItem(name, quantity);
		}
	};

	public readonly exportData = async (): Promise<InventoryListAppModelExportFormat1> => {
		// Exports in version:one format (using ':' delimiter between name/quantity)
		const inventoryItems = this.inventoryList.getItems();
		const inventoryItemStrings = inventoryItems.map((inventoryItem) => {
			return `${inventoryItem.name.getText()}:${inventoryItem.quantity.toString()}`;
		});
		return `version:one\n${inventoryItemStrings.join("\n")}`;
	};

	public dispose(): void {
		this.container.dispose(DisconnectReason.Expected);
	}
}
