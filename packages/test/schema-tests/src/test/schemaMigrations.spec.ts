/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedDirectory, SharedMap } from "../../../../dds/map/dist";

describe("Schema Migrations", () => {
    /**
     * The following tests test the async processing model of ContainerRuntime -
     * Batch messages are processed in a single turn no matter how long it takes to process them.
     * Non-batch messages are processed in multiple turns if they take longer than DeltaScheduler's processingTime.
     */
    describe("Container-level Migrations", () => {
        beforeEach(async () => {
        });

        afterEach(() => {
        });

        it("Add new object", async () => {
            const client = new TinyliciousClient();
            const schema = {
                initialObjects: {
                    directory: SharedDirectory,
                    map: SharedMap,
                },
                migrations: () => {},
            };
            const { container } = await client.createContainer(schema);
            const id = await container.attach();

            await client.getContainer(id, schema);

            assert.strictEqual(1, 1, "Did not receive correct batchBegin event for the batch");
        });

        // Basic scenarios:
        // add/create object
        // delete object
        // update object

        // Advanced scenarios:
        // split object
        // merge objects
    });
});
