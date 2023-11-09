/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { TestTreeProvider, TestTreeProviderLite } from "../utils";
import { SchemaBuilder } from "../../domains";
import { AllowedUpdateType } from "../../core";
import { Tree } from "../../feature-libraries";

describe("SharedTreeView Concurrency Tests", () => {
	it("Getting proxy value on afterChange event hits assert 'Cannot associate an edit node with multiple targets'", () => {
		const builder = new SchemaBuilder({ scope: "inventory app" });
		const inventoryItemSchema = builder.object("item", {
			name: builder.string,
			quantity: builder.number,
		});
		const inventoryItemList = builder.list(inventoryItemSchema);
		const inventorySchema = builder.object("inventory", {
			inventoryItemList,
		});
		const schema = builder.intoSchema(inventorySchema);
		const config = {
			initialTree: {
				inventoryItemList: {
					"": [
						{
							name: "nut",
							quantity: 0,
						},
					],
				},
			},
			allowedSchemaModifications: AllowedUpdateType.None,
			schema,
		};
		const provider = new TestTreeProviderLite(1);
		const tree1 = provider.trees[0].schematize(config);
		provider.processMessages();

		const list1 = tree1.root.inventoryItemList;

		Tree.on(list1, "afterChange", () => {
			for (const item of list1) {
				const map = new Map<string, typeof item>();
				// Not sure why this is the line that breaks
				map.set("any", item);
			}
		});

		provider.processMessages();
		// This should not throw
		assert.throws(
			() =>
				list1.insertAtEnd([
					{
						name: "bolt",
						quantity: 2,
					},
				]),
			"succeeded in making insertAtEnd not throw",
		);
	});

	it("Setting a value to NaN", async () => {
		const builder = new SchemaBuilder({ scope: "inventory app" });
		const itemSchema = builder.object("item", {
			name: builder.string,
			quantity: builder.number,
		});
		const schema = builder.intoSchema(itemSchema);
		const config = {
			initialTree: {
				name: "nut",
				quantity: 0,
			},
			allowedSchemaModifications: AllowedUpdateType.None,
			schema,
		};
		const provider = await TestTreeProvider.create(2);

		const tree1 = provider.trees[0].schematize(config);
		const tree2 = provider.trees[1].schematize(config);
		await provider.ensureSynchronized();

		const item1 = tree1.root;
		const item2 = tree2.root;
		Tree.on(item2, "changing", () => {
			item2.quantity.toString();
		});

		item1.quantity = NaN;
		// Processing NaN causes the remote container to close
		await provider.ensureSynchronized();
		// item2.quantity === NaN or we should just throw before we submit the op
		assert(item2.quantity === null, "quantity check");
	});
});
