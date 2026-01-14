/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { toPropTreeNode } from "@fluidframework/react/alpha";
import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";
import * as React from "react";

import { Inventory, Part } from "../schema.js";
import {
	InventoryViewMonolithic,
	InventoryViewWithHook,
	MainView,
} from "../view/inventoryView.js";

const views = [
	{ name: "MainView", component: MainView },
	{ name: "InventoryViewMonolithic", component: InventoryViewMonolithic },
	{ name: "InventoryViewWithHook", component: InventoryViewWithHook },
];

describe("inventoryApp", () => {
	describe("schema", () => {
		it("can create and edit inventory", () => {
			const inventory = new Inventory({
				parts: [
					new Part({ name: "bolt", quantity: 5 }),
					new Part({ name: "nut", quantity: 10 }),
				],
			});

			// Verify initial state
			assert.equal(inventory.parts.length, 2);
			const bolt = inventory.parts[0];
			const nut = inventory.parts[1];
			assert(bolt !== undefined);
			assert(nut !== undefined);
			assert.equal(bolt.name, "bolt");
			assert.equal(bolt.quantity, 5);
			assert.equal(nut.name, "nut");
			assert.equal(nut.quantity, 10);

			// Edit quantities
			bolt.quantity = 20;
			nut.quantity = 30;

			// Verify edits
			assert.equal(bolt.quantity, 20);
			assert.equal(nut.quantity, 30);
		});

		it("can add and remove parts", () => {
			const inventory = new Inventory({
				parts: [new Part({ name: "bolt", quantity: 5 })],
			});

			assert.equal(inventory.parts.length, 1);

			// Add a part
			inventory.parts.insertAtEnd(new Part({ name: "nut", quantity: 10 }));
			assert.equal(inventory.parts.length, 2);
			const addedPart = inventory.parts[1];
			assert(addedPart !== undefined);
			assert.equal(addedPart.name, "nut");

			// Remove a part
			inventory.parts.removeAt(0);
			assert.equal(inventory.parts.length, 1);
			const remainingPart = inventory.parts[0];
			assert(remainingPart !== undefined);
			assert.equal(remainingPart.name, "nut");
		});
	});

	describe("dom tests", () => {
		let cleanup: () => void;

		before(() => {
			cleanup = globalJsdom();
		});

		after(() => {
			cleanup();
		});

		// Run without strict mode to make sure it works in a normal production setup.
		// Run with strict mode to potentially detect additional issues.
		for (const reactStrictMode of [false, true]) {
			describe(`StrictMode: ${reactStrictMode}`, () => {
				for (const { name, component: ViewComponent } of views) {
					it(`renders ${name} with correct inventory data`, () => {
						const inventory = new Inventory({
							parts: [
								new Part({ name: "bolt", quantity: 5 }),
								new Part({ name: "nut", quantity: 10 }),
							],
						});

						const content = <ViewComponent root={toPropTreeNode(inventory)} />;
						const rendered = render(content, { reactStrictMode });

						// Verify the app renders the inventory header and parts
						assert.match(rendered.baseElement.textContent ?? "", /Inventory:/);
						assert.match(rendered.baseElement.textContent ?? "", /bolt/);
						assert.match(rendered.baseElement.textContent ?? "", /nut/);

						// Test invalidation: mutate the tree and verify the view updates
						const bolt = inventory.parts[0];
						assert(bolt !== undefined);
						bolt.quantity = 67;

						rendered.rerender(content);
						assert.match(rendered.baseElement.textContent ?? "", /67/);
					});
				}
			});
		}
	});
});
