/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import { SharedMap } from "@fluidframework/map";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

import {
	createHandleNode,
	defaultVisualizers,
	DataVisualizerGraph,
	FluidObjectTreeNode,
	FluidObjectValueNode,
	NodeKind,
} from "../data-visualization";

describe("DataVisualizerGraph unit tests", () => {
	it("Single root DDS (SharedCounter)", async () => {
		const runtime = new MockFluidDataStoreRuntime();
		const sharedCounter = new SharedCounter(
			"test-counter",
			runtime,
			SharedCounter.getFactory().attributes,
		);

		const visualizer = new DataVisualizerGraph(
			{
				counter: sharedCounter,
			},
			defaultVisualizers,
		);

		const rootTrees = await visualizer.renderRootHandles();
		expect(rootTrees.length).to.equal(1);

		const expectedTree = createHandleNode(sharedCounter.id, "counter");
		expect(rootTrees[0]).to.deep.equal(expectedTree);

		const childTree = await visualizer.render(sharedCounter.id);
		const expectedChildTree: FluidObjectValueNode = {
			label: "counter",
			fluidObjectId: sharedCounter.id,
			value: 0,
			typeMetadata: "SharedCounter",
			nodeKind: NodeKind.FluidValueNode,
		};
		expect(childTree).to.deep.equal(expectedChildTree);

		// Make data change and test re-render
		const delta = 37;
		sharedCounter.increment(delta);

		const childTreeAfterEdit = await visualizer.render(sharedCounter.id);
		const expectedChildTreeAfterEdit: FluidObjectValueNode = {
			label: "counter",
			fluidObjectId: sharedCounter.id,
			value: 37,
			typeMetadata: "SharedCounter",
			nodeKind: NodeKind.FluidValueNode,
		};
		expect(childTreeAfterEdit).to.deep.equal(expectedChildTreeAfterEdit);
	});

	it("Single root DDS (SharedMap)", async () => {
		const runtime = new MockFluidDataStoreRuntime();

		// Create SharedMap
		const sharedMap = new SharedMap("test-map", runtime, SharedMap.getFactory().attributes);

		const visualizer = new DataVisualizerGraph(
			{
				map: sharedMap,
			},
			defaultVisualizers,
		);

		const rootTrees = await visualizer.renderRootHandles();
		expect(rootTrees.length).to.equal(1);

		const expectedTree = createHandleNode(sharedMap.id, "map");
		expect(rootTrees[0]).to.deep.equal(expectedTree);

		const childTree = await visualizer.render(sharedMap.id);
		const expectedChildTree: FluidObjectTreeNode = {
			label: "map",
			fluidObjectId: sharedMap.id,
			children: [],
			metadata: { size: 0 },
			typeMetadata: "SharedMap",
			nodeKind: NodeKind.FluidTreeNode,
		};
		expect(childTree).to.deep.equal(expectedChildTree);

		// Make data change and test re-render
		sharedMap.set("test-string", "Hello world");
		sharedMap.set("test-object", {
			a: 1,
			b: "2",
			c: true,
		});
		const sharedCounter = new SharedCounter(
			"test-counter",
			runtime,
			SharedCounter.getFactory().attributes,
		);
		sharedMap.set("test-handle", sharedCounter.handle);

		const childTreeAfterEdit = await visualizer.render(sharedMap.id);
		const expectedChildTreeAfterEdit: FluidObjectTreeNode = {
			label: "map",
			fluidObjectId: sharedMap.id,
			children: [
				{
					label: "test-string",
					value: "Hello world",
					typeMetadata: "string",
					nodeKind: NodeKind.ValueNode,
				},
				{
					label: "test-object",
					children: [
						{
							label: "a",
							value: 1,
							typeMetadata: "number",
							nodeKind: NodeKind.ValueNode,
						},
						{
							label: "b",
							value: "2",
							typeMetadata: "string",
							nodeKind: NodeKind.ValueNode,
						},
						{
							label: "c",
							value: true,
							typeMetadata: "boolean",
							nodeKind: NodeKind.ValueNode,
						},
					],
					typeMetadata: "object",
					nodeKind: NodeKind.TreeNode,
				},
				{
					label: "test-handle",
					fluidObjectId: sharedCounter.id,
					typeMetadata: "Fluid Handle",
					nodeKind: NodeKind.FluidHandleNode,
				},
			],
			metadata: { size: 3 },
			typeMetadata: "SharedMap",
			nodeKind: NodeKind.FluidTreeNode,
		};
		expect(childTreeAfterEdit).to.deep.equal(expectedChildTreeAfterEdit);
	});

	it("Multiple root DDS_s", async () => {
		const runtime = new MockFluidDataStoreRuntime();

		const sharedCounter = new SharedCounter(
			"test-counter",
			runtime,
			SharedCounter.getFactory().attributes,
		);
		sharedCounter.increment(42);
		const sharedCell = new SharedCell("test-cell", runtime, SharedCell.getFactory().attributes);
		sharedCell.set("Hello world");

		const visualizer = new DataVisualizerGraph(
			{
				counter: sharedCounter,
				cell: sharedCell,
			},
			defaultVisualizers,
		);

		const rootTrees = await visualizer.renderRootHandles();
		expect(rootTrees.length).to.equal(2);

		const expectedCounterTree = createHandleNode(sharedCounter.id, "counter");
		expect(rootTrees[0]).to.deep.equal(expectedCounterTree);

		const expectedCellTree = createHandleNode(sharedCell.id, "cell");
		expect(rootTrees[1]).to.deep.equal(expectedCellTree);

		const childCounterTree = await visualizer.render(sharedCounter.id);
		const expectedChildCounterTree: FluidObjectValueNode = {
			label: "counter",
			fluidObjectId: sharedCounter.id,
			value: 42,
			typeMetadata: "SharedCounter",
			nodeKind: NodeKind.FluidValueNode,
		};
		expect(childCounterTree).to.deep.equal(expectedChildCounterTree);

		const childCellTree = await visualizer.render(sharedCell.id);
		const expectedChildCellTree: FluidObjectTreeNode = {
			label: "cell",
			fluidObjectId: sharedCell.id,
			children: [
				{
					label: "data",
					value: "Hello world",
					typeMetadata: "string",
					nodeKind: NodeKind.ValueNode,
				},
			],
			typeMetadata: "SharedCell",
			nodeKind: NodeKind.FluidTreeNode,
		};
		expect(childCellTree).to.deep.equal(expectedChildCellTree);
	});
});
