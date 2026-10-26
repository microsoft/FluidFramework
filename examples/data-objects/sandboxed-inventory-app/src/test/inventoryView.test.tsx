/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { toPropTreeNode } from "@fluidframework/react/alpha";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import globalJsdom from "global-jsdom";

import { InventoryView } from "../inventoryView.js";
import { Inventory, Part } from "../schema.js";

describe("Inventory controls", () => {
	let cleanupDom: () => void;

	beforeEach(() => {
		cleanupDom = globalJsdom();
	});

	afterEach(() => {
		cleanup();
		cleanupDom();
	});

	for (const reactStrictMode of [false, true]) {
		describe(`StrictMode: ${reactStrictMode}`, () => {
			it("renders part names and quantities", () => {
				const inventory = new Inventory({
					parts: [
						{ name: "nut", quantity: 2 },
						{ name: "bolt", quantity: 3 },
					],
				});
				const view = render(<InventoryView root={toPropTreeNode(inventory)} />, {
					reactStrictMode,
				});
				assert.equal(view.getByRole("heading", { name: "nut" }).textContent, "nut");
				assert.equal(view.getByLabelText("nut quantity").textContent, "2");
				assert.equal(view.getByLabelText("bolt quantity").textContent, "3");
			});

			it("edits quantities and disables decrement at zero", () => {
				const inventory = new Inventory({ parts: [{ name: "nut", quantity: 0 }] });
				const view = render(<InventoryView root={toPropTreeNode(inventory)} />, {
					reactStrictMode,
				});
				const decrement = view.getByRole("button", { name: "Decrease nut quantity" });
				assert.equal(decrement.hasAttribute("disabled"), true);
				fireEvent.click(decrement);
				assert.equal(inventory.parts[0]?.quantity, 0);
				fireEvent.click(view.getByRole("button", { name: "Increase nut quantity" }));
				assert.equal(inventory.parts[0]?.quantity, 1);
				assert.equal(view.getByLabelText("nut quantity").textContent, "1");
				assert.equal(decrement.hasAttribute("disabled"), false);
				fireEvent.click(decrement);
				assert.equal(inventory.parts[0]?.quantity, 0);
				assert.equal(decrement.hasAttribute("disabled"), true);
			});

			it("adds and removes parts, including parts with the same name", () => {
				const inventory = new Inventory({ parts: [] });
				const view = render(<InventoryView root={toPropTreeNode(inventory)} />, {
					reactStrictMode,
				});
				const add = view.getByRole("button", { name: "Add Part" });
				fireEvent.click(add);
				fireEvent.click(add);
				assert.equal(inventory.parts.length, 2);
				const remaining = inventory.parts[1];
				const firstRow = view.getAllByRole("listitem")[0];
				assert(firstRow !== undefined);
				fireEvent.click(within(firstRow).getByRole("button", { name: "Remove New Part" }));
				assert.equal(inventory.parts.length, 1);
				assert.equal(inventory.parts[0], remaining);
				assert.equal(view.getAllByRole("listitem").length, 1);
			});

			it("observes external edits without rerendering the root explicitly", () => {
				const inventory = new Inventory({ parts: [{ name: "nut", quantity: 0 }] });
				const view = render(<InventoryView root={toPropTreeNode(inventory)} />, {
					reactStrictMode,
				});
				const nut = inventory.parts[0];
				assert(nut !== undefined);
				act(() => {
					nut.quantity = 7;
					inventory.parts.insertAtStart(new Part({ name: "bolt", quantity: 1 }));
				});
				assert.equal(view.getByLabelText("nut quantity").textContent, "7");
				assert.equal(view.getAllByRole("listitem").length, 2);
				fireEvent.click(view.getByRole("button", { name: "Remove nut" }));
				assert.deepEqual(
					[...inventory.parts].map((part) => part.name),
					["bolt"],
				);
			});

			it("preserves a part's rendered identity when another part is inserted before it", () => {
				const inventory = new Inventory({ parts: [{ name: "nut", quantity: 0 }] });
				const view = render(<InventoryView root={toPropTreeNode(inventory)} />, {
					reactStrictMode,
				});
				const nutControl = view.getByRole("button", { name: "Increase nut quantity" });
				act(() => inventory.parts.insertAtStart(new Part({ name: "bolt", quantity: 0 })));
				assert.equal(view.getByRole("button", { name: "Increase nut quantity" }), nutControl);
			});
		});
	}
});
