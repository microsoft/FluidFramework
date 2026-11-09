/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ContainerSchema } from "@fluidframework/fluid-static";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { createIndependentTreeBeta } from "@fluidframework/tree/beta";
import { independentView } from "@fluidframework/tree/internal";
import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";
import type { JSX } from "react";

import type { PropTreeNode } from "../propNode.js";
import { treeDataObject, TreeViewComponent } from "../reactSharedTreeView.js";
import { usePropTreeNode } from "../useTree.js";

describe("reactSharedTreeView", () => {
	it("treeDataObject", async () => {
		const builder = new SchemaFactory("tree-react-api");

		class Inventory extends builder.object("Contoso:InventoryItem-1.0.0", {
			nuts: builder.number,
			bolts: builder.number,
		}) {}

		const containerSchema = {
			initialObjects: {
				// TODO: it seems odd that DataObjects in container schema need both a key under initialObjects where they are,
				// as well as a key under the root data object, and SharedObjects only need one key.
				// Maybe we can default the shared object's key to be derived from the data objects key by default?
				tree: treeDataObject(
					new TreeViewConfiguration({ schema: Inventory }),
					() => new Inventory({ nuts: 5, bolts: 6 }),
				),
			},
		} satisfies ContainerSchema;

		// TODO: Ideally we would use a local-server service-client, but one does not appear to exist.
		const tinyliciousClient = new TinyliciousClient();

		const { container } = await tinyliciousClient.createContainer(containerSchema, "2.0.0");
		const dataObject = container.initialObjects.tree;
		assert.equal(dataObject.treeView.root.nuts, 5);
		dataObject.treeView.root.nuts += 1;
		assert.equal(dataObject.treeView.root.bolts, 6);
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
		// Note that React's strict mode is not more strict,
		// but instead drastically changes when the component code and its effects run to exercise more edge cases and detect certain kinds of bugs.
		for (const reactStrictMode of [false, true]) {
			describe(`StrictMode: ${reactStrictMode}`, () => {
				const builder = new SchemaFactory("tree-react-api");

				class Item extends builder.object("Item", {}) {}

				const View = ({ root }: { root: PropTreeNode<Item> }): JSX.Element => (
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

					rendered.unmount();
					view.dispose();
				});

				it("renders viewable content when schemas are not equivalent", () => {
					class StoredItem extends builder.object("RolloutItem", {
						name: builder.string,
						extra: builder.optional(builder.string),
					}) {}
					class ViewItem extends builder.object("RolloutItem", { name: builder.string }) {}
					const tree = createIndependentTreeBeta();
					const storedView = tree.viewWith(new TreeViewConfiguration({ schema: StoredItem }));
					storedView.initialize(new StoredItem({ name: "Visible", extra: "Preserved" }));
					storedView.dispose();
					const view = tree.viewWith(new TreeViewConfiguration({ schema: ViewItem }));
					const RolloutView = ({ root }: { root: PropTreeNode<ViewItem> }): JSX.Element => (
						<span>{usePropTreeNode(root, (node) => node.name)}</span>
					);

					// The unknown optional field permits viewing without schema equivalence.
					assert.equal(view.compatibility.canView, true);

					const rendered = render(
						<TreeViewComponent viewComponent={RolloutView} tree={{ treeView: view }} />,
						{ reactStrictMode },
					);
					assert.equal(rendered.baseElement.textContent, "Visible");

					rendered.unmount();
					view.dispose();
				});

				it("displays an error when the schema cannot be viewed or upgraded", () => {
					const tree = createIndependentTreeBeta();
					const storedView = tree.viewWith(
						new TreeViewConfiguration({ schema: builder.string }),
					);
					storedView.initialize("Incompatible");
					storedView.dispose();
					const view = tree.viewWith(new TreeViewConfiguration({ schema: Item }));

					assert.equal(view.compatibility.canView, false);
					assert.equal(view.compatibility.canUpgrade, false);
					const rendered = render(
						<TreeViewComponent viewComponent={View} tree={{ treeView: view }} />,
						{ reactStrictMode },
					);
					assert.match(
						rendered.baseElement.textContent ?? "",
						/Document is incompatible.*format cannot be updated/,
					);
					// eslint-disable-next-line unicorn/no-null -- `queryByRole` returns `null`
					assert.equal(rendered.queryByRole("button", { name: "Upgrade" }), null);

					rendered.unmount();
					view.dispose();
				});
			});
		}
	});
});
