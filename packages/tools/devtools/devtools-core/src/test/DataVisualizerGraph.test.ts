/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import { SharedMap } from "@fluidframework/map";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { type IFluidLoadable } from "@fluidframework/core-interfaces";

import {
	createHandleNode,
	defaultVisualizers,
	DataVisualizerGraph,
	type FluidObjectTreeNode,
	type FluidObjectValueNode,
	VisualNodeKind,
	defaultEditors,
} from "../data-visualization";
import { EditType } from "../CommonInterfaces";

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
			defaultEditors,
		);

		const rootTrees = await visualizer.renderRootHandles();

		const expectedTree = createHandleNode(sharedCounter.id);
		expect(rootTrees.counter).to.deep.equal(expectedTree);

		const childTree = await visualizer.render(sharedCounter.id);
		const expectedChildTree: FluidObjectValueNode = {
			fluidObjectId: sharedCounter.id,
			value: 0,
			typeMetadata: "SharedCounter",
			nodeKind: VisualNodeKind.FluidValueNode,
			editProps: { editTypes: [EditType.Number] },
		};
		expect(childTree).to.deep.equal(expectedChildTree);

		// Make data change and test re-render
		const delta = 37;
		sharedCounter.increment(delta);

		const childTreeAfterEdit = await visualizer.render(sharedCounter.id);
		const expectedChildTreeAfterEdit: FluidObjectValueNode = {
			fluidObjectId: sharedCounter.id,
			value: 37,
			typeMetadata: "SharedCounter",
			nodeKind: VisualNodeKind.FluidValueNode,
			editProps: { editTypes: [EditType.Number] },
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
			defaultEditors,
		);

		const rootTrees = await visualizer.renderRootHandles();

		const expectedTree = createHandleNode(sharedMap.id);
		expect(rootTrees.map).to.deep.equal(expectedTree);

		const childTree = await visualizer.render(sharedMap.id);
		const expectedChildTree: FluidObjectTreeNode = {
			fluidObjectId: sharedMap.id,
			children: {},
			metadata: { size: 0 },
			typeMetadata: "SharedMap",
			nodeKind: VisualNodeKind.FluidTreeNode,
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
			fluidObjectId: sharedMap.id,
			children: {
				"test-string": {
					value: "Hello world",
					typeMetadata: "string",
					nodeKind: VisualNodeKind.ValueNode,
				},
				"test-object": {
					children: {
						a: {
							value: 1,
							typeMetadata: "number",
							nodeKind: VisualNodeKind.ValueNode,
						},
						b: {
							value: "2",
							typeMetadata: "string",
							nodeKind: VisualNodeKind.ValueNode,
						},
						c: {
							value: true,
							typeMetadata: "boolean",
							nodeKind: VisualNodeKind.ValueNode,
						},
					},
					typeMetadata: "object",
					nodeKind: VisualNodeKind.TreeNode,
				},
				"test-handle": {
					fluidObjectId: sharedCounter.id,
					typeMetadata: "Fluid Handle",
					nodeKind: VisualNodeKind.FluidHandleNode,
				},
			},
			metadata: { size: 3 },
			typeMetadata: "SharedMap",
			nodeKind: VisualNodeKind.FluidTreeNode,
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
			defaultEditors,
		);

		const rootTrees = await visualizer.renderRootHandles();

		const expectedCounterTree = createHandleNode(sharedCounter.id);
		expect(rootTrees.counter).to.deep.equal(expectedCounterTree);

		const expectedCellTree = createHandleNode(sharedCell.id);
		expect(rootTrees.cell).to.deep.equal(expectedCellTree);

		const childCounterTree = await visualizer.render(sharedCounter.id);
		const expectedChildCounterTree: FluidObjectValueNode = {
			fluidObjectId: sharedCounter.id,
			value: 42,
			typeMetadata: "SharedCounter",
			nodeKind: VisualNodeKind.FluidValueNode,
			editProps: { editTypes: [EditType.Number] },
		};
		expect(childCounterTree).to.deep.equal(expectedChildCounterTree);

		const childCellTree = await visualizer.render(sharedCell.id);
		const expectedChildCellTree: FluidObjectValueNode = {
			fluidObjectId: sharedCell.id,
			value: "Hello world",
			typeMetadata: "SharedCell",
			nodeKind: VisualNodeKind.FluidValueNode,
			editProps: {
				editTypes: undefined,
			},
		};
		expect(childCellTree).to.deep.equal(expectedChildCellTree);
	});

	it("Unknown object in Container Data", async () => {
		const unknownObject = {};

		const visualizer = new DataVisualizerGraph(
			{
				unknownObject: unknownObject as IFluidLoadable,
			},
			defaultVisualizers,
			defaultEditors,
		);

		const rootTrees = await visualizer.renderRootHandles();
		const expectedChildUnknownObject = {
			unknownObject: {
				nodeKind: VisualNodeKind.UnknownObjectNode,
			},
		};

		expect(rootTrees).to.deep.equal(expectedChildUnknownObject);
	});

	it("Empty Container Data", async () => {
		// Pass in the empty containerData to the visualizer.
		const emptyRecord: Record<string, IFluidLoadable> = {};

		const visualizer = new DataVisualizerGraph(emptyRecord, defaultVisualizers, defaultEditors);

		const childEmptyRecord = await visualizer.renderRootHandles();
		const expectedChildEmptyRecord = {};

		expect(childEmptyRecord).to.deep.equal(expectedChildEmptyRecord);
	});
});
