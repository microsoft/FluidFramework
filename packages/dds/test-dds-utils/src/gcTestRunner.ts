/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISharedObject } from "@fluidframework/shared-object-base";

/**
 * Defines a set of functions to be passed to the GC test runner.
 */
export interface IGCTestProvider {
    /** The DDS whose GC data is to be verified */
    readonly sharedObject: ISharedObject;
    /** The expected list of outbound routes from this DDS */
    readonly expectedOutboundRoutes: string[];
    /** Function that adds routes to Fluid objects to the DDS' data */
    addOutboundRoutes(): Promise<void>;
    /** Function that deletes routes to Fluid objects to the DDS' data */
    deleteOutboundRoutes(): Promise<void>;
    /** Function that adds nested handles to the DDS' data */
    addNestedHandles(): Promise<void>;
}

export const runGCTests = (ctor: new () => IGCTestProvider) => {
    let provider: IGCTestProvider;

    beforeEach(() => {
        provider = new ctor();
    });

    it("can generate GC nodes with routes to Fluid objects in data", async () => {
        // Get the shared object and add routes to Fluid object in its data.
        const dds = provider.sharedObject;
        await provider.addOutboundRoutes();

        // Verify the GC nodes returned by summarize.
        const gcNodes = dds.summarize().gcNodes;
        assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
        assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
        assert.deepStrictEqual(
            gcNodes[0].outboundRoutes.sort(),
            provider.expectedOutboundRoutes.sort(),
            "GC node's outbound routes is incorrect");
    });

    it("can generate GC nodes when handles are deleted from data", async () => {
        // Get the shared object and add routes to Fluid object in its data.
        const dds = provider.sharedObject;
        await provider.addOutboundRoutes();

        // Verify the GC nodes returned by summarize.
        let gcNodes = dds.summarize().gcNodes;
        assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
        assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
        assert.deepStrictEqual(
            gcNodes[0].outboundRoutes.sort(),
            provider.expectedOutboundRoutes.sort(),
            "GC node's outbound routes is incorrect");

        // Delete routes to Fluid objects from the shared object's data.
        await provider.deleteOutboundRoutes();

        // Verify that GC node's outbound routes are updated correctly.
        gcNodes = dds.summarize().gcNodes;
        assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
        assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
        assert.deepStrictEqual(
            gcNodes[0].outboundRoutes.sort(),
            provider.expectedOutboundRoutes.sort(),
            "GC node's outbound routes should have been udpated after deleting routes");
    });

    it("can generate GC nodes when handles are added to data", async () => {
        // Get the shared object and add routes to Fluid object in its data.
        const dds = provider.sharedObject;
        await provider.addOutboundRoutes();

        // Verify the GC nodes returned by summarize.
        let gcNodes = dds.summarize().gcNodes;
        assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
        assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
        assert.deepStrictEqual(
            gcNodes[0].outboundRoutes.sort(),
            provider.expectedOutboundRoutes.sort(),
            "GC node's outbound routes is incorrect");

        // Add more routes to Fluid object to the shared object's data.
        await provider.addOutboundRoutes();

        // Verify that GC node's outbound routes are updated correctly.
        gcNodes = dds.summarize().gcNodes;
        assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
        assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
        assert.deepStrictEqual(
            gcNodes[0].outboundRoutes.sort(),
            provider.expectedOutboundRoutes.sort(),
            "GC node's outbound routes should have been updated after adding routes");
    });

    it("can generate GC nodes with nested handles in data", async () => {
        // Get the shared object and add nested handles to its data.
        const dds = provider.sharedObject;
        await provider.addNestedHandles();

        // Verify the GC nodes returned by summarize.
        const gcNodes = dds.summarize().gcNodes;
        assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
        assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
        assert.deepStrictEqual(
            gcNodes[0].outboundRoutes.sort(),
            provider.expectedOutboundRoutes.sort(),
            "GC node's outbound routes is incorrect");
    });
};
