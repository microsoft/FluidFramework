/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ContainerSchema } from "@fluidframework/fluid-static";
import { toPropTreeNode, treeDataObject } from "@fluidframework/react/alpha";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";
import * as React from "react";

import { Inventory, Part, treeConfiguration } from "../schema.js";
import {
	InventoryViewMonolithic,
	InventoryViewWithHook,
	MainView,
} from "../view/inventoryList.js";

describe("inventoryApp", () => {
	describe("collaboration", () => {
		it("syncs inventory changes between two clients", async () => {
			const containerSchema = {
				initialObjects: {
					tree: treeDataObject(
						treeConfiguration,
						() =>
							new Inventory({
								parts: [
									new Part({ name: "nut", quantity: 5 }),
									new Part({ name: "bolt", quantity: 5 }),
								],
							}),
					),
				},
			} satisfies ContainerSchema;

			const tinyliciousClient = new TinyliciousClient();

			// Client 1: Create and attach container. Wait for Client 1 to be connected
			const { container: container1 } = await tinyliciousClient.createContainer(
				containerSchema,
				"2",
			);
			const containerId = await container1.attach();

			await new Promise<void>((resolve) => {
				container1.on("connected", () => resolve());
			});

			// Client 1: Modify the inventory
			const tree1 = container1.initialObjects.tree;
			const firstPart = tree1.treeView.root.parts[0];
			assert(firstPart !== undefined);
			firstPart.quantity = 10;

			await new Promise<void>((resolve) => {
				if (!container1.isDirty) {
					resolve();
					return;
				}
				container1.on("saved", () => resolve());
			});

			// Client 2: Load the same container and verify the changes are visible
			const { container: container2 } = await tinyliciousClient.getContainer(
				containerId,
				containerSchema,
				"2",
			);

			await new Promise<void>((resolve) => {
				container2.on("connected", () => resolve());
			});

			const tree2 = container2.initialObjects.tree;
			assert.equal(tree2.treeView.root.parts[0]?.quantity, 10);
			container1.dispose();
			container2.dispose();
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

		const views = [
			{ name: "MainView", component: MainView },
			{ name: "InventoryViewMonolithic", component: InventoryViewMonolithic },
			{ name: "InventoryViewWithHook", component: InventoryViewWithHook },
		];

		// Run without strict mode to make sure it works in a normal production setup.
		// Run with strict mode to potentially detect additional issues.
		for (const reactStrictMode of [false, true]) {
			describe(`StrictMode: ${reactStrictMode}`, () => {
				for (const { name, component: ViewComponent } of views) {
					it(`renders ${name} with inventory data`, () => {
						const inventory = new Inventory({
							parts: [
								new Part({ name: "bolt", quantity: 5 }),
								new Part({ name: "nut", quantity: 10 }),
							],
						});

						const rendered = render(<ViewComponent root={toPropTreeNode(inventory)} />, {
							reactStrictMode,
						});

						// Verify the app renders the inventory header and parts
						assert.match(rendered.baseElement.textContent ?? "", /Inventory:/);
						assert.match(rendered.baseElement.textContent ?? "", /bolt/);
						assert.match(rendered.baseElement.textContent ?? "", /nut/);
					});
				}
			});
		}
	});
});
