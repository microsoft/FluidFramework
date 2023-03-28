/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { SharedCounter } from "@fluidframework/counter";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

import {
	NodeKind,
	visualizeSharedCounter,
	ValueNode,
	FluidObjectValueNode,
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
	it("SharedCounter", async () => {
		const runtime = new MockFluidDataStoreRuntime();
		const sharedCounter = new SharedCounter(
			"test-counter",
			runtime,
			SharedCounter.getFactory().attributes,
		);

		const result = await visualizeSharedCounter(
			sharedCounter,
			"test-label",
			visualizeChildData,
		);

		const expected: FluidObjectValueNode = {
			label: "test-label",
			fluidObjectId: sharedCounter.id,
			value: sharedCounter.value,
			typeMetadata: "SharedCounter",
			nodeKind: NodeKind.FluidValueNode,
		};

		expect(result).to.deep.equal(expected);
	});
});
