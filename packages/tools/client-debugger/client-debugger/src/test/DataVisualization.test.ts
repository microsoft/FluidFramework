/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { SharedCounter } from "@fluidframework/counter";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import {
	createHandleNode,
	defaultVisualizers,
	FluidDataVisualizer,
	FluidObjectValueNode,
	NodeKind,
} from "../data-visualization";

describe("Data Visualization unit tests", () => {
	it("Simple, single-DDS graph", async () => {
		const sharedCounter = new SharedCounter(
			"test-counter",
			new MockFluidDataStoreRuntime(),
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			(SharedCounter.getFactory() as any).attributes,
		);

		const visualizer = new FluidDataVisualizer(
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
			value: "0",
			typeMetadata: "SharedCounter",
			nodeType: NodeKind.FluidValueNode,
		};
		expect(childTree).to.deep.equal(expectedChildTree);

		// Make data change and test re-render
		const delta = 37;
		sharedCounter.increment(delta);

		const childTreeAfterEdit = await visualizer.render(sharedCounter.id);
		const expectedChildTreeAfterEdit: FluidObjectValueNode = {
			label: "counter",
			fluidObjectId: sharedCounter.id,
			value: "37",
			typeMetadata: "SharedCounter",
			nodeType: NodeKind.FluidValueNode,
		};
		expect(childTreeAfterEdit).to.deep.equal(expectedChildTreeAfterEdit);
	});
});
