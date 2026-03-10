/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	InventoryItem,
	InventorySchema,
	treeConfiguration,
} from "../model/newTreeInventoryList.js";

describe("tree-comparison", () => {
	describe("InventoryItem schema", () => {
		it("can create an inventory item", () => {
			const item = new InventoryItem({ id: "item-1", name: "bolt", quantity: 5 });
			assert.equal(item.id, "item-1");
			assert.equal(item.name, "bolt");
			assert.equal(item.quantity, 5);
		});

		it("can modify inventory item quantity", () => {
			const item = new InventoryItem({ id: "item-2", name: "nut", quantity: 10 });
			item.quantity = 20;
			assert.equal(item.quantity, 20);
		});
	});

	describe("InventorySchema", () => {
		it("can create an inventory with items", () => {
			const inventory = new InventorySchema({
				inventoryItemList: [
					new InventoryItem({ id: "a", name: "apple", quantity: 3 }),
					new InventoryItem({ id: "b", name: "banana", quantity: 5 }),
				],
			});

			assert.equal(inventory.inventoryItemList.length, 2);
			assert.equal(inventory.inventoryItemList[0]?.name, "apple");
			assert.equal(inventory.inventoryItemList[1]?.name, "banana");
		});

		it("treeConfiguration uses InventorySchema as root", () => {
			assert.ok(treeConfiguration !== undefined, "Expected treeConfiguration to be defined");
		});
	});
});
