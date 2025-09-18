/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";
import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";
import * as React from "react";

import { objectIdNumber } from "../simpleIdentifier.js";
import {
	toPropTreeNode,
	toPropTreeRecord,
	unwrapPropTreeNode,
	usePropTreeNode,
	withTreeObservations,
	type PropTreeNode,
} from "../useTree.js";

describe("useTree", () => {
	it("PropTreeNode", () => {
		const builder = new SchemaFactory("tree-react-api");

		class Inventory extends builder.object("Inventory", {
			nuts: builder.number,
		}) {}

		const node = new Inventory({ nuts: 5 });

		const prop = toPropTreeNode(node);

		// @ts-expect-error Read access should be removed
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const nuts = prop.nuts;

		const node2 = unwrapPropTreeNode(prop);

		assert.equal(node2, node);
	});

	it("PropTreeNode value", () => {
		const value = 5;

		// toPropTreeNode leaves leaves alone
		const prop: 5 = toPropTreeNode(value);

		const node2: 5 = unwrapPropTreeNode(prop);

		assert.equal(node2, value);
	});

	it("NodeRecord", () => {
		const builder = new SchemaFactory("tree-react-api");

		class Inventory extends builder.object("Inventory", { nuts: builder.number }) {}

		const record = toPropTreeRecord({ num: 5, node: new Inventory({ nuts: 5 }) });
		const prop = record.node;

		// @ts-expect-error Read access should be removed
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const nuts = prop.nuts;

		const node = unwrapPropTreeNode(prop);

		assert.equal(node, prop);
	});

	describe("dom tests", () => {
		let cleanup: () => void;

		before(() => {
			cleanup = globalJsdom();
		});

		after(() => {
			cleanup();
		});

		for (const reactStrictMode of [false, true]) {
			/**
			 * Check then clear, the contents of `log`.
			 *
			 * When in StrictMode, React may double render, so that case is not checked for an exact match.
			 */
			// eslint-disable-next-line no-inner-declarations
			function checkRenderLog(log: string[], expected: readonly string[]): void {
				if (reactStrictMode) {
					assert.deepEqual(new Set(log), new Set(expected));
				} else {
					assert.deepEqual(log, expected);
				}
				log.length = 0;
			}

			describe(`StrictMode: ${reactStrictMode}`, () => {
				it("usePropTreeNode", async () => {
					const builder = new SchemaFactory("tree-react-api");

					class Point extends builder.object("Point", {
						x: builder.number,
						y: builder.number,
					}) {}

					const log: string[] = [];

					function PointComponent(props: { node: PropTreeNode<Point> }): JSX.Element {
						log.push("render");
						const { x, y } = usePropTreeNode(props.node, (node) => {
							log.push(`usePropTreeNode`);
							return {
								x: node.x,
								y: node.y,
							};
						});
						return <span>{`x: ${x}, y: ${y}`}</span>;
					}

					function ParentComponent(props: { node: PropTreeNode<Point> }): JSX.Element {
						log.push("parent");
						return <PointComponent node={props.node} />;
					}

					const point = new Point({ x: 1, y: 1 });
					const propPoint = toPropTreeNode(point);

					const content = <ParentComponent node={propPoint} />;

					const rendered = render(content, { reactStrictMode });
					const found = await rendered.findAllByText("x: 1, y: 1");
					assert.equal(found.length, 1);
					checkRenderLog(log, ["parent", "render", "usePropTreeNode"]);

					rendered.rerender(content);
					assertLogEmpty(log);

					point.x = 2;
					assertLogEmpty(log);
					rendered.rerender(content);
					// Parent which passed node down did not rerender, but PointComponent which read from it did:
					checkRenderLog(log, ["render", "usePropTreeNode"]);
					const found2 = await rendered.findAllByText("x: 2, y: 1");
					assert.equal(found2.length, 1);
				});
			});

			describe("withTreeObservations and array", () => {
				const builder = new SchemaFactory("tree-react-api");

				class Item extends builder.object("Item", {
					x: builder.number,
				}) {}

				class Collection extends builder.array("Collection", Item) {}

				beforeEach(() => {
					// Ensure the log starts empty for each test.
					log.length = 0;
				});

				const log: string[] = [];

				const ItemComponent = withTreeObservations(
					(props: { item: Item }): JSX.Element => {
						log.push(`Item: ${props.item.x}`);
						return <span>{`${props.item.x}`}</span>;
					},
					() => log.push("Item invalidated"),
				);

				const CollectionComponent = withTreeObservations(
					(props: { collection: Collection }): JSX.Element => {
						log.push("Collection");

						const items = props.collection.map((item) => (
							<ItemComponent key={objectIdNumber(item)} item={item} />
						));

						return <div>{items}</div>;
					},
					() => log.push("Collection invalidated"),
				);

				const ParentComponent = withTreeObservations(
					(props: { node: Collection }): JSX.Element => {
						log.push("Parent");
						return <CollectionComponent collection={props.node} />;
					},
					() => log.push("Parent invalidated"),
				);

				it("empty", async () => {
					const collection = new Collection([]);
					const content = <ParentComponent node={collection} />;
					render(content, { reactStrictMode });
					checkRenderLog(log, ["Parent", "Collection"]);
				});

				it("array editing", async () => {
					const collection = new Collection([{ x: 1 }, { x: 2 }, { x: 3 }]);
					const content = <ParentComponent node={collection} />;
					const rendered = render(content, { reactStrictMode });
					checkRenderLog(log, ["Parent", "Collection", "Item: 1", "Item: 2", "Item: 3"]);
					collection.moveToEnd(0);
					checkRenderLog(log, ["Collection invalidated"]);
					rendered.rerender(content);
					checkRenderLog(log, ["Collection"]);
					collection.removeAt(1);
					collection.insertAtStart(new Item({ x: 4 }));
					rendered.rerender(content);
					checkRenderLog(log, ["Collection", "Item: 4"]);

					const found = await rendered.findAllByText(/.*/);
					assert.deepEqual(
						found.map((e) => e.textContent),
						["4", "3", "1"],
					);
				});

				it("array editing2", async () => {
					const collection = new Collection([{ x: 1 }, { x: 2 }, { x: 3 }]);
					const content = <ParentComponent node={collection} />;
					const rendered = render(content, { reactStrictMode });
					checkRenderLog(log, ["Parent", "Collection", "Item: 1", "Item: 2", "Item: 3"]);
					collection.insertAtEnd(new Item({ x: 4 }));
					checkRenderLog(log, ["Collection invalidated"]);
					rendered.rerender(content);
					checkRenderLog(log, ["Collection", "Item: 4"]);

					const found = await rendered.findAllByText(/.*/);
					assert.deepEqual(
						found.map((e) => e.textContent),
						["1", "2", "3", "4"],
					);
				});
			});
		}
	});
});

/**
 * Assert that an array is empty.
 *
 * Not inlined because doing so causes TypeScript to infer the array type as never[] afterwards and breaks push.
 * Better than asserting length is 0 as this gets a better error message on failure.
 */
function assertLogEmpty(log: string[]): void {
	assert.deepEqual(log, []);
}
