/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

import {
	NodeKind,
	visualizeSharedCounter,
	ValueNode,
	FluidObjectValueNode,
	visualizeSharedCell,
	FluidObjectTreeNode,
} from "../data-visualization";

/**
 * Mock {@link VisualizeChildData} for use in tests
 */
async function visualizeChildData(child: unknown, label: string): Promise<ValueNode> {
	return {
		label,
		value: "test",
		nodeKind: NodeKind.ValueNode,
	};
}

describe("DefaultVisualizers unit tests", () => {
	it("SharedCell", async () => {
		const runtime = new MockFluidDataStoreRuntime();
		const sharedCell = new SharedCell("test-cell", runtime, SharedCell.getFactory().attributes);

		const result = await visualizeSharedCell(sharedCell, "test-label", visualizeChildData);

		const expected: FluidObjectTreeNode = {
			label: "test-label",
			fluidObjectId: sharedCell.id,
			children: [
				{
					label: "data",
					value: "test",
					nodeKind: NodeKind.ValueNode,
				},
			],
			typeMetadata: "SharedCell",
			nodeKind: NodeKind.FluidTreeNode,
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedCounter", async () => {
		const runtime = new MockFluidDataStoreRuntime();
		const sharedCounter = new SharedCounter(
			"test-counter",
			runtime,
			SharedCounter.getFactory().attributes,
		);
		sharedCounter.increment(37);

		const result = await visualizeSharedCounter(
			sharedCounter,
			"test-label",
			visualizeChildData,
		);

		const expected: FluidObjectValueNode = {
			label: "test-label",
			fluidObjectId: sharedCounter.id,
			value: 37,
			typeMetadata: "SharedCounter",
			nodeKind: NodeKind.FluidValueNode,
		};

		expect(result).to.deep.equal(expected);
	});
});
