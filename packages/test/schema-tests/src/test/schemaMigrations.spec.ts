/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { LoadableObjectRecord, ObjectFactory, SharedDirectory, SharedMap } from "fluid-framework";

describe("Schema Migrations", () => {
    /**
     * Container-level object manipulations
     */
    describe("Container-level migrations", () => {
        let client: TinyliciousClient;
        let containerId: string;

        beforeEach(async () => {
            client = new TinyliciousClient();
            const schema = {
                initialObjects: {
                    map: SharedMap,
                },
            };
            const { container } = await client.createContainer(schema);
            containerId = await container.attach();
            container.dispose();
        });

        afterEach(() => {
        });

        // no migrations
        // no-op migration
        it("Add new object", async () => {
            const schema = {
                initialObjects: {
                    map: SharedMap,
                    directory: SharedDirectory,
                },
                migrations: async (snapshot: LoadableObjectRecord, createObject: ObjectFactory) => {
                    if ("directory" in snapshot === false) {
                        const directory = await createObject(SharedDirectory);
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        return { ...snapshot, directory};
                    }
                    return undefined;
                },
            };

            const { container } = await client.getContainer(containerId, schema);

            assert.ok(container);
            assert.ok(container.initialObjects.directory);
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
