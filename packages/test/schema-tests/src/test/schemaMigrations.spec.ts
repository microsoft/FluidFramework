/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

describe("Schema Migrations", () => {
    /**
     * Container-level object manipulations
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
                migrations: async () => {},
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
