/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { objectIdNumber } from "@fluid-experimental/tree-react-api";
import { SharedCell, type ISharedCell } from "@fluidframework/cell/internal";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter/internal";
import { SharedMap } from "@fluidframework/map/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { expect } from "chai";

import { EditType } from "../CommonInterfaces.js";
import {
	DataVisualizerGraph,
	type FluidObjectTreeNode,
	type FluidObjectValueNode,
	VisualNodeKind,
	createHandleNode,
	defaultVisualizers,
} from "../data-visualization/index.js";

describe("DataVisualizerGraph unit tests", () => {
	it("Single root DDS (SharedCounter)", async () => {
		const runtime = new MockFluidDataStoreRuntime({ registry: [SharedCounter.getFactory()] });
		const sharedCounter = SharedCounter.create(runtime, "test-counter");
		const counterId = objectIdNumber(sharedCounter);

		const visualizer = new DataVisualizerGraph(
			{
				counter: sharedCounter,
			},
			defaultVisualizers,
		);

		const rootTrees = await visualizer.renderRootHandles();

		const expectedTree = createHandleNode(counterId);
		expect(rootTrees.counter).to.deep.equal(expectedTree);

		const childTree = await visualizer.render(counterId);
		const expectedChildTree: FluidObjectValueNode = {
			fluidObjectId: counterId,
			value: 0,
			typeMetadata: "SharedCounter",
			nodeKind: VisualNodeKind.FluidValueNode,
			editProps: { editTypes: [EditType.Number] },
		};
		expect(childTree).to.deep.equal(expectedChildTree);

		// Make data change and test re-render
		const delta = 37;
		sharedCounter.increment(delta);

		const childTreeAfterEdit = await visualizer.render(counterId);
		const expectedChildTreeAfterEdit: FluidObjectValueNode = {
			fluidObjectId: counterId,
			value: 37,
			typeMetadata: "SharedCounter",
			nodeKind: VisualNodeKind.FluidValueNode,
			editProps: { editTypes: [EditType.Number] },
		};
		expect(childTreeAfterEdit).to.deep.equal(expectedChildTreeAfterEdit);
	});

	it("Single root DDS (SharedMap)", async () => {
		const runtime = new MockFluidDataStoreRuntime({
			registry: [SharedMap.getFactory(), SharedCounter.getFactory()],
		});
		// Create SharedMap
		const sharedMap = SharedMap.create(runtime, "test-map");
		const mapId = objectIdNumber(sharedMap);

		const visualizer = new DataVisualizerGraph(
			{
				map: sharedMap,
			},
			defaultVisualizers,
		);

		const rootTrees = await visualizer.renderRootHandles();

		const expectedTree = createHandleNode(mapId);
		expect(rootTrees.map).to.deep.equal(expectedTree);

		const childTree = await visualizer.render(mapId);
		const expectedChildTree: FluidObjectTreeNode = {
			fluidObjectId: mapId,
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
		const sharedCounter = SharedCounter.create(runtime, "test-counter");
		const counterId = objectIdNumber(sharedCounter);
		sharedMap.set("test-handle", sharedCounter.handle);

		const childTreeAfterEdit = await visualizer.render(mapId);
		const expectedChildTreeAfterEdit: FluidObjectTreeNode = {
			fluidObjectId: mapId,
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
					fluidObjectId: counterId,
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
		const runtime = new MockFluidDataStoreRuntime({
			registry: [SharedCounter.getFactory(), SharedCell.getFactory()],
		});

		const sharedCounter = SharedCounter.create(runtime, "test-counter");
		const counterId = objectIdNumber(sharedCounter);
		sharedCounter.increment(42);
		const sharedCell = SharedCell.create(runtime, "test-cell") as ISharedCell<string>;
		const cellId = objectIdNumber(sharedCell);
		sharedCell.set("Hello world");

		const visualizer = new DataVisualizerGraph(
			{
				counter: sharedCounter,
				cell: sharedCell,
			},
			defaultVisualizers,
		);

		const rootTrees = await visualizer.renderRootHandles();

		const expectedCounterTree = createHandleNode(counterId);
		expect(rootTrees.counter).to.deep.equal(expectedCounterTree);

		const expectedCellTree = createHandleNode(cellId);
		expect(rootTrees.cell).to.deep.equal(expectedCellTree);

		const childCounterTree = await visualizer.render(counterId);
		const expectedChildCounterTree: FluidObjectValueNode = {
			fluidObjectId: counterId,
			value: 42,
			typeMetadata: "SharedCounter",
			nodeKind: VisualNodeKind.FluidValueNode,
			editProps: { editTypes: [EditType.Number] },
		};
		expect(childCounterTree).to.deep.equal(expectedChildCounterTree);

		const childCellTree = await visualizer.render(cellId);
		const expectedChildCellTree: FluidObjectValueNode = {
			fluidObjectId: cellId,
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

		const visualizer = new DataVisualizerGraph(emptyRecord, defaultVisualizers);

		const childEmptyRecord = await visualizer.renderRootHandles();
		const expectedChildEmptyRecord = {};

		expect(childEmptyRecord).to.deep.equal(expectedChildEmptyRecord);
	});
});
