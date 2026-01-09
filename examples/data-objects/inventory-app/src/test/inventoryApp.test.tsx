/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ContainerSchema } from "@fluidframework/fluid-static";
import type { PropTreeNode } from "@fluidframework/react/alpha";
import { treeDataObject, TreeViewComponent } from "@fluidframework/react/alpha";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
// eslint-disable-next-line import-x/no-internal-modules
import { independentView } from "@fluidframework/tree/internal";
import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";
import * as React from "react";

import { Inventory, Part, treeConfiguration } from "../schema.js";
import { MainView } from "../view/inventoryList.js";

describe("inventoryApp", () => {
	it("treeDataObject", async () => {
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

		const { container } = await tinyliciousClient.createContainer(containerSchema, "2");
		const dataObject = container.initialObjects.tree;
		assert.equal(dataObject.treeView.root.parts.length, 2);
		const firstPart = dataObject.treeView.root.parts[0];
		const secondPart = dataObject.treeView.root.parts[1];
		assert(firstPart !== undefined);
		assert(secondPart !== undefined);
		firstPart.quantity += 1;
		secondPart.quantity += 2;
		assert.equal(dataObject.treeView.root.parts[0]?.quantity, 6);
		assert.equal(dataObject.treeView.root.parts[1]?.quantity, 7);
		container.dispose();
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
				const builder = new SchemaFactory("tree-react-api");

				class Item extends builder.object("Item", {}) {}

				const View = ({ root }: { root: PropTreeNode<Item> }): React.JSX.Element => (
					<span>View</span>
				);

				it("TreeViewComponent", () => {
					const view = independentView(new TreeViewConfiguration({ schema: Item }));
					const content = <TreeViewComponent viewComponent={View} tree={{ treeView: view }} />;
					const rendered = render(content, { reactStrictMode });

					// Ensure that viewing an incompatible document displays an error.
					assert.match(rendered.baseElement.textContent ?? "", /Document is incompatible/);
					// Ensure that changes in compatibility are detected and invalidate the view,
					// and that compatible documents show the content from `viewComponent`
					view.initialize(new Item({}));
					rendered.rerender(content);
					assert.equal(rendered.baseElement.textContent, "View");
				});

				it("renders MainView with inventory data", () => {
					const view = independentView(treeConfiguration);
					const content = (
						<TreeViewComponent viewComponent={MainView} tree={{ treeView: view }} />
					);
					const rendered = render(content, { reactStrictMode });

					// Ensure that viewing an incompatible document displays an error.
					assert.match(rendered.baseElement.textContent ?? "", /Document is incompatible/);

					// Initialize with inventory data
					view.initialize(
						new Inventory({
							parts: [
								new Part({ name: "bolt", quantity: 5 }),
								new Part({ name: "nut", quantity: 10 }),
							],
						}),
					);
					rendered.rerender(content);

					// Verify the app renders the inventory header and parts
					assert.match(rendered.baseElement.textContent ?? "", /Inventory:/);
					assert.match(rendered.baseElement.textContent ?? "", /bolt/);
					assert.match(rendered.baseElement.textContent ?? "", /nut/);
				});
			});
		}
	});
});
