/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISharedObject } from "@fluidframework/shared-object-base/internal";

/**
 * Defines a set of functions to be passed to the GC test runner.
 *
 * @internal
 */
export interface IGCTestProvider {
	/**
	 * The DDS whose GC data is to be verified.
	 */
	readonly sharedObject: ISharedObject;

	/**
	 * The expected list of outbound routes from this DDS.
	 */
	readonly expectedOutboundRoutes: string[];

	/**
	 * Adds routes to Fluid objects to the DDS' data.
	 */
	addOutboundRoutes(): Promise<void>;

	/**
	 * Deletes routes to Fluid objects to the DDS' data.
	 */
	deleteOutboundRoutes(): Promise<void>;

	/**
	 * Adds nested handles to the DDS' data.
	 */
	addNestedHandles(): Promise<void>;
}

/**
 * Runs a series of GC tests for DDSes to verify that they have correctly implemented GC.
 * The DDSes should store handles and generate the expected GC Data.
 *
 * @internal
 */
export const runGCTests = (ctor: new () => IGCTestProvider): void => {
	let provider: IGCTestProvider;

	function validateGCData(): void {
		const gcNodes = Object.entries(provider.sharedObject.getGCData().gcNodes);
		assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");

		const [id, outboundRoutes] = gcNodes[0];
		assert.strictEqual(id, "/", "GC node's id should be /");
		assert.deepStrictEqual(
			outboundRoutes.sort(),
			provider.expectedOutboundRoutes.sort(),
			"GC node's outbound routes is incorrect",
		);
	}

	beforeEach(() => {
		provider = new ctor();
	});

	it("can generate GC nodes with routes to Fluid objects in data", async () => {
		// Add outbound routes to Fluid object to the DDS' data.
		await provider.addOutboundRoutes();

		// Verify the GC nodes returned by getGCData.
		validateGCData();
	});

	it("can generate GC nodes when handles are deleted from data", async () => {
		// Add outbound routes to Fluid object to the DDS' data.
		await provider.addOutboundRoutes();

		// Verify the GC nodes returned by getGCData.
		validateGCData();

		// Delete routes to Fluid objects from the shared object's data.
		await provider.deleteOutboundRoutes();

		// Verify that GC node's outbound routes are updated correctly.
		validateGCData();
	});

	it("can generate GC nodes when handles are added to data", async () => {
		// Add outbound routes to Fluid object to the DDS' data.
		await provider.addOutboundRoutes();

		validateGCData();

		// Add more routes to Fluid object to the shared object's data.
		await provider.addOutboundRoutes();

		// Verify that GC node's outbound routes are updated correctly.
		validateGCData();
	});

	it("can generate GC nodes with nested handles in data", async () => {
		// Add outbound routes to Fluid object to the DDS' data.
		await provider.addNestedHandles();

		// Verify the GC nodes returned by getGCData.
		validateGCData();
	});
};
