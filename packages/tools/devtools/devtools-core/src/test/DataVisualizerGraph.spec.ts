/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCell, type ISharedCell } from "@fluidframework/cell/internal";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter/internal";
import { SharedMap } from "@fluidframework/map/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { expect } from "chai";

import { EditType } from "../CommonInterfaces.js";
import { getKeyForFluidObject } from "../FluidObjectKey.js";
import {
	DataVisualizerGraph,
	type FluidObjectTreeNode,
	type FluidObjectValueNode,
	VisualNodeKind,
	createHandleNode,
	defaultVisualizers,
} from "../data-visualization/index.js";

describe("DataVisualizerGraph unit tests", () => {
	/**
	 * Returns the number of "op" event listeners currently attached to the provided shared object.
	 * Used to verify that the visualizer only monitors a shared object while a consumer is subscribed.
	 */
	function getOpListenerCount(sharedObject: IFluidLoadable): number {
		return (sharedObject as unknown as { listenerCount(event: string): number }).listenerCount(
			"op",
		);
	}

	it("Single root DDS (SharedCounter)", async () => {
		const runtime = new MockFluidDataStoreRuntime({ registry: [SharedCounter.getFactory()] });
		const sharedCounter = SharedCounter.create(runtime, "test-counter");
		const counterId = getKeyForFluidObject(sharedCounter);

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
		const mapId = getKeyForFluidObject(sharedMap);

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
		const counterId = getKeyForFluidObject(sharedCounter);
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
		const counterId = getKeyForFluidObject(sharedCounter);
		sharedCounter.increment(42);
		const sharedCell = SharedCell.create(runtime, "test-cell") as ISharedCell<string>;
		const cellId = getKeyForFluidObject(sharedCell);
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

	describe("On-demand subscriptions", () => {
		it("Does not monitor a root object until it is subscribed to", async () => {
			const runtime = new MockFluidDataStoreRuntime({
				registry: [SharedCounter.getFactory()],
			});
			const sharedCounter = SharedCounter.create(runtime, "test-counter");
			const counterId = getKeyForFluidObject(sharedCounter);

			const visualizer = new DataVisualizerGraph(
				{ counter: sharedCounter },
				defaultVisualizers,
			);

			// Registering and even rendering the root object must not attach an "op" listener:
			// updates should only be broadcast on-demand, once a consumer expresses interest.
			await visualizer.renderRootHandles();
			await visualizer.render(counterId);
			expect(getOpListenerCount(sharedCounter)).to.equal(0);

			// Subscribing attaches the listener and returns the current visualization.
			const visualization = await visualizer.subscribe(counterId);
			expect(visualization).to.not.equal(undefined);
			expect(getOpListenerCount(sharedCounter)).to.equal(1);
		});

		it("Reference-counts subscriptions and detaches only after the final unsubscribe", async () => {
			const runtime = new MockFluidDataStoreRuntime({
				registry: [SharedCounter.getFactory()],
			});
			const sharedCounter = SharedCounter.create(runtime, "test-counter");
			const counterId = getKeyForFluidObject(sharedCounter);

			const visualizer = new DataVisualizerGraph(
				{ counter: sharedCounter },
				defaultVisualizers,
			);
			await visualizer.renderRootHandles();

			// Two independent consumers subscribe; the "op" listener is only attached once.
			await visualizer.subscribe(counterId);
			await visualizer.subscribe(counterId);
			expect(getOpListenerCount(sharedCounter)).to.equal(1);

			// Releasing one subscription must not stop monitoring while another remains.
			visualizer.unsubscribe(counterId);
			expect(getOpListenerCount(sharedCounter)).to.equal(1);

			// Releasing the final subscription detaches the listener.
			visualizer.unsubscribe(counterId);
			expect(getOpListenerCount(sharedCounter)).to.equal(0);
		});

		it("Broadcasts updates while subscribed and stops after unsubscribe", async () => {
			const runtime = new MockFluidDataStoreRuntime({
				registry: [SharedCounter.getFactory()],
			});
			const sharedCounter = SharedCounter.create(runtime, "test-counter");
			const counterId = getKeyForFluidObject(sharedCounter);

			const visualizer = new DataVisualizerGraph(
				{ counter: sharedCounter },
				defaultVisualizers,
			);
			await visualizer.renderRootHandles();

			let updateCount = 0;
			visualizer.on("update", () => {
				updateCount++;
			});

			// Drives the visualizer's "op" handler the same way a real op would, without depending on the
			// mock runtime's local op-delivery semantics.
			function emitOp(): void {
				(sharedCounter as unknown as { emit(event: string): boolean }).emit("op");
			}

			// No updates should be broadcast before a consumer subscribes.
			emitOp();
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(updateCount).to.equal(0);

			await visualizer.subscribe(counterId);

			// While subscribed, ops trigger update broadcasts.
			emitOp();
			// Allow the async "op" handler to render and emit.
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			const updatesWhileSubscribed = updateCount;
			expect(updatesWhileSubscribed).to.be.greaterThan(0);

			// After unsubscribing, further ops must not trigger any additional broadcasts.
			visualizer.unsubscribe(counterId);
			emitOp();
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(updateCount).to.equal(updatesWhileSubscribed);
		});

		it("subscribe and unsubscribe no-op for unregistered objects", async () => {
			const emptyRecord: Record<string, IFluidLoadable> = {};
			const visualizer = new DataVisualizerGraph(emptyRecord, defaultVisualizers);
			await visualizer.renderRootHandles();

			// Requesting a subscription for an unknown object returns undefined rather than throwing.
			const visualization = await visualizer.subscribe("non-existent-id");
			expect(visualization).to.equal(undefined);

			// Unsubscribing an unknown object is a no-op.
			expect(() => visualizer.unsubscribe("non-existent-id")).to.not.throw();
		});
	});

	describe("Nested data objects", () => {
		it("Renders a nested DDS (SharedMap inside a SharedMap via handle) on demand", async () => {
			const runtime = new MockFluidDataStoreRuntime({
				registry: [SharedMap.getFactory()],
			});

			// Build a root SharedMap that references a child SharedMap via a handle.
			const rootMap = SharedMap.create(runtime, "root-map");
			const rootMapId = getKeyForFluidObject(rootMap);
			const childMap = SharedMap.create(runtime, "child-map");
			const childMapId = getKeyForFluidObject(childMap);
			childMap.set("child-key", "child-value");
			rootMap.set("nested-map", childMap.handle);

			const visualizer = new DataVisualizerGraph({ rootMap }, defaultVisualizers);

			// The root visualization should only expose a handle to the root map.
			const rootTrees = await visualizer.renderRootHandles();
			expect(rootTrees.rootMap).to.deep.equal(createHandleNode(rootMapId));

			// Rendering the root map surfaces the nested map as a handle node (not an inline expansion).
			const rootMapTree = await visualizer.render(rootMapId);
			const expectedRootMapTree: FluidObjectTreeNode = {
				fluidObjectId: rootMapId,
				children: {
					"nested-map": {
						fluidObjectId: childMapId,
						typeMetadata: "Fluid Handle",
						nodeKind: VisualNodeKind.FluidHandleNode,
					},
				},
				metadata: { size: 1 },
				typeMetadata: "SharedMap",
				nodeKind: VisualNodeKind.FluidTreeNode,
			};
			expect(rootMapTree).to.deep.equal(expectedRootMapTree);

			// Now that the nested map's handle was encountered, it can be rendered by its own ID.
			const childMapTree = await visualizer.render(childMapId);
			const expectedChildMapTree: FluidObjectTreeNode = {
				fluidObjectId: childMapId,
				children: {
					"child-key": {
						value: "child-value",
						typeMetadata: "string",
						nodeKind: VisualNodeKind.ValueNode,
					},
				},
				metadata: { size: 1 },
				typeMetadata: "SharedMap",
				nodeKind: VisualNodeKind.FluidTreeNode,
			};
			expect(childMapTree).to.deep.equal(expectedChildMapTree);
		});

		// Note: this test reflects the current behavior - a nested shared object is not reachable until a parent has been rendered.
		// If this design is changed, this test will need to be updated.
		it("Does not register a nested DDS until its parent has been rendered", async () => {
			const runtime = new MockFluidDataStoreRuntime({
				registry: [SharedMap.getFactory()],
			});

			const rootMap = SharedMap.create(runtime, "root-map");
			const rootMapId = getKeyForFluidObject(rootMap);
			const childMap = SharedMap.create(runtime, "child-map");
			const childMapId = getKeyForFluidObject(childMap);
			rootMap.set("nested-map", childMap.handle);

			const visualizer = new DataVisualizerGraph({ rootMap }, defaultVisualizers);

			// Before the parent has been rendered, the nested map is unknown to the graph.
			await visualizer.renderRootHandles();
			expect(await visualizer.render(childMapId)).to.equal(undefined);

			// Rendering the parent lazily registers the nested map, making it renderable.
			await visualizer.render(rootMapId);
			expect(await visualizer.render(childMapId)).to.not.equal(undefined);
		});

		it("Subscribes to a nested DDS independently of its parent", async () => {
			const runtime = new MockFluidDataStoreRuntime({
				registry: [SharedMap.getFactory()],
			});

			const rootMap = SharedMap.create(runtime, "root-map");
			const rootMapId = getKeyForFluidObject(rootMap);
			const childMap = SharedMap.create(runtime, "child-map");
			const childMapId = getKeyForFluidObject(childMap);
			rootMap.set("nested-map", childMap.handle);

			const visualizer = new DataVisualizerGraph({ rootMap }, defaultVisualizers);
			await visualizer.renderRootHandles();

			// Render the parent so the nested map gets registered.
			await visualizer.render(rootMapId);

			// The nested map is not monitored until a consumer subscribes to it specifically.
			expect(getOpListenerCount(childMap)).to.equal(0);

			const childVisualization = await visualizer.subscribe(childMapId);
			expect(childVisualization).to.not.equal(undefined);
			expect(getOpListenerCount(childMap)).to.equal(1);

			// Subscribing to the nested map must not have attached a listener to the parent.
			expect(getOpListenerCount(rootMap)).to.equal(0);

			// Releasing the subscription stops monitoring the nested map.
			visualizer.unsubscribe(childMapId);
			expect(getOpListenerCount(childMap)).to.equal(0);
		});

		it("Broadcasts updates for a nested DDS while it is subscribed", async () => {
			const runtime = new MockFluidDataStoreRuntime({
				registry: [SharedMap.getFactory()],
			});

			const rootMap = SharedMap.create(runtime, "root-map");
			const rootMapId = getKeyForFluidObject(rootMap);
			const childMap = SharedMap.create(runtime, "child-map");
			const childMapId = getKeyForFluidObject(childMap);
			rootMap.set("nested-map", childMap.handle);

			const visualizer = new DataVisualizerGraph({ rootMap }, defaultVisualizers);
			await visualizer.renderRootHandles();
			await visualizer.render(rootMapId);

			const updatedObjectIds: string[] = [];
			visualizer.on("update", (visualTree) => {
				updatedObjectIds.push(visualTree.fluidObjectId);
			});

			// Drives the nested map's "op" handler the same way a real op would.
			function emitChildOp(): void {
				(childMap as unknown as { emit(event: string): boolean }).emit("op");
			}

			// No updates before subscribing to the nested map.
			emitChildOp();
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(updatedObjectIds).to.deep.equal([]);

			await visualizer.subscribe(childMapId);

			// While subscribed, ops on the nested map broadcast updates carrying the nested map's ID.
			emitChildOp();
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(updatedObjectIds).to.deep.equal([childMapId]);

			// After unsubscribing, further ops on the nested map are not broadcast.
			visualizer.unsubscribe(childMapId);
			emitChildOp();
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(updatedObjectIds).to.deep.equal([childMapId]);
		});
	});
});
