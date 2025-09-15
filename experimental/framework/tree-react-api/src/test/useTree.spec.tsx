/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";
import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";
import * as React from "react";

import {
	toPropTreeNode,
	toPropTreeRecord,
	unwrapPropTreeNode,
	usePropTreeNode,
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

		it("usePropTreeNode", async () => {
			const builder = new SchemaFactory("tree-react-api");

			class Point extends builder.object("Point", { x: builder.number, y: builder.number }) {}

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
				return <PointComponent node={toPropTreeNode(point)} />;
			}

			const point = new Point({ x: 1, y: 1 });
			const propPoint = toPropTreeNode(point);

			const content = <ParentComponent node={propPoint} />;

			const rendered = render(content);
			const found = await rendered.findAllByText("x: 1, y: 1");
			assert.equal(found.length, 1);
			assert.deepEqual(log, ["parent", "render", "usePropTreeNode"]);
			log.length = 0;

			rendered.rerender(content);
			assertLogEmpty(log);

			// eslint-disable-next-line require-atomic-updates
			point.x = 2;
			assertLogEmpty(log);
			const rendered2 = rendered.rerender(content);
			// Parent which passed node down did not rerender, but PointComponent which read from it did:
			assert.deepEqual(log, ["render", "usePropTreeNode"]);
			const found2 = await rendered.findAllByText("x: 2, y: 1");
			assert.equal(found2.length, 1);
		});
	});
});

/**
 * Assert that an array is empty.
 *
 * Not inlined because doing so causes TypeScript to infer the array type as never[] afterwards and breaks push.
 */
function assertLogEmpty(log: string[]): void {
	assert.deepEqual(log, []);
}
