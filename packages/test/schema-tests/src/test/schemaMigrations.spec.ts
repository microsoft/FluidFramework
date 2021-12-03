/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    LoadableObjectRecord,
    ObjectFactory,
    SharedDirectory,
    SharedMap,
} from "fluid-framework";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { TestDataObject } from "./testDataObject";

describe("Schema Migrations", () => {
    /**
     * Container-level object manipulations
     */
    describe("Container-level migrations", () => {
        let client: TinyliciousClient;
        let containerId: string;
        // The container is created with an initial schema with two top-level objects.
        const initialSchema = {
            initialObjects: {
                myEntities: SharedMap,
                myEntities2: SharedMap,
            },
        };

        beforeEach(async () => {
            // Test suite requires a live instance of the tinylicious server.
            client = new TinyliciousClient();
            // Create a container with the initial schema.
            const { container } = await client.createContainer(initialSchema);
            containerId = await container.attach();
            // Close the container immediately after attaching it to the storage.
            container.dispose();
        });

        afterEach(() => {
        });

        // #region Core scenarios

        /** Back-compat scenario. Open a container with the same schema. */
        it("No migrations - no changes in schema", async () => {
            // Act
            const { container } = await client.getContainer(containerId, initialSchema);

            // Assert
            assert.ok(container, "Container is not loaded correctly.");
            assert.ok(container.initialObjects.myEntities, "Initial object should be available.");
        });

        it("No migrations - new schema revision", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    myNewObject: SharedDirectory,
                },
            };

            // act
            const { container } = await client.getContainer(containerId, newSchema);

            // assert
            assert.ok(container, "Container is not loaded correctly.");
            assert.ok(container.initialObjects.myEntities, "Initial object should be available.");
            assert.equal(
                typeof container.initialObjects.myNewObject,
                "undefined",
                "New object should not be created in existing container.",
            );
        });

        it("No-op migration", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    // 👇 new container schema has an additional object specified 👇
                    myNewObject: SharedDirectory,
                },
                migrations: async () => {
                    // the provided migration routine doesn't alter container objects
                    return undefined;
                },
            };

            // act
            const { container } = await client.getContainer(containerId, newSchema);

            // assert
            assert.ok(container, "Container is not loaded correctly.");
            assert.ok(container.initialObjects.myEntities, "Initial object should be available.");
            assert.equal(
                typeof container.initialObjects.myNewObject,
                "undefined",
                "New object should not be created in existing container.",
            );
        });

        it("Add object", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    myNewObject: SharedDirectory,
                },
                migrations: async (snapshot: LoadableObjectRecord, createObject: ObjectFactory) => {
                    if ("myNewObject" in snapshot === false) {
                        // only create a new object when it doesn't exist
                        const myNewObject = await createObject(SharedDirectory);
                        return { ...snapshot, myNewObject };
                    }
                    // no change required
                    return undefined;
                },
            };

            // act
            const { container } = await client.getContainer(containerId, newSchema);

            // assert
            assert.ok(container, "Container is not loaded correctly.");
            assert.ok(container.initialObjects.myNewObject, "New object should be created.");
        });

        it("Delete object", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                },
                migrations: async (snapshot: LoadableObjectRecord, createObject: ObjectFactory) => {
                    if ("myEntities2" in snapshot) {
                        const { myEntities2: deleted, ...properties } = snapshot;
                        return properties;
                    }
                    // no change required
                    return undefined;
                },
            };

            // act
            const { container } = await client.getContainer(containerId, newSchema);

            // assert
            assert.ok(container, "Container is not loaded correctly.");
            assert.ok(container.initialObjects.myEntities, "Initial object should be available.");
            assert.equal(
                typeof container.initialObjects.myEntities2,
                "undefined",
                "Deleted object should not exist in the container.",
            );
        });

        it("Rename object", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntitiesRenamed: SharedMap,
                },
                migrations: async (snapshot: LoadableObjectRecord, createObject: ObjectFactory) => {
                    if ("myEntities" in snapshot && "myEntitiesRenamed" in snapshot === false) {
                        const { myEntities, ...properties } = snapshot;
                        return { myEntitiesRenamed: myEntities, ...properties };
                    }
                    // no change required
                    return undefined;
                },
            };

            // act
            const { container } = await client.getContainer(containerId, newSchema);

            // assert
            assert.ok(container, "Container is not loaded correctly.");
            assert.ok(container.initialObjects.myEntitiesRenamed, "Renamed object should be available.");
            assert.equal(
                typeof container.initialObjects.myEntities,
                "undefined",
                "Initial object should not exist in the container.",
            );
        });

        it("Update object", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                },
                migrations: async (snapshot: LoadableObjectRecord) => {
                    const entities = snapshot.myEntities as SharedMap;
                    if (!entities.has("newKey")) {
                        entities.set("newKey", "defaultValue");
                        return snapshot;
                    }
                    return undefined;
                },
            };

            // act
            const { container } = await client.getContainer(containerId, newSchema);

            // assert
            assert.ok(container, "Container is not loaded correctly.");
            assert.ok(container.initialObjects.myEntities, "Initial object should be available.");
            const myEntities = container.initialObjects.myEntities as SharedMap;
            assert.equal(myEntities.get("newKey"), "defaultValue", "New key should be added.");
        });

        // #endregion

        // #region Advanced scenarios
        it("Move object", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                },
                migrations: async (snapshot: LoadableObjectRecord, createObject: ObjectFactory) => {
                    if ("myEntities2" in snapshot) {
                        const { myEntities, myEntities2, ...properties } = snapshot;
                        (myEntities as SharedMap).set("newKey", myEntities2.handle);
                        return { myEntities, ...properties };
                    }
                    // no change required
                    return undefined;
                },
            };

            // act
            const { container } = await client.getContainer(containerId, newSchema);

            // assert
            assert.ok(container, "Container is not loaded correctly.");
            assert.ok(container.initialObjects.myEntities, "Initial object should be available.");
            const entities = container.initialObjects.myEntities as SharedMap;
            assert.ok(entities.has("newKey"), "New key should be added.");
            assert.equal(
                typeof container.initialObjects.myEntities2,
                "undefined",
                "Initial object should move into myEntities map.",
            );
        });

        it("Split object", async () => { });

        it("Merge objects", async () => { });

        it("Chained migrations", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntitiesRenamed: SharedMap,
                },
                migrations: [
                    async (snapshot: LoadableObjectRecord, createObject: ObjectFactory) => {
                        if ("myNewObject" in snapshot === false) {
                            // only create a new object when it doesn't exist
                            const myNewObject = await createObject(SharedDirectory);
                            return { ...snapshot, myNewObject };
                        }
                        // no change required
                        return undefined;
                    },
                    async (snapshot: LoadableObjectRecord, createObject: ObjectFactory) => {
                        if ("myEntities2" in snapshot) {
                            const { myEntities2: deleted, ...properties } = snapshot;
                            return properties;
                        }
                        // no change required
                        return undefined;
                    },
                ],
            };

            // act
            const { container } = await client.getContainer(containerId, newSchema);

            // assert
            assert.ok(container, "Container is not loaded correctly.");
            assert.ok(container.initialObjects.myNewObject, "New object should be available.");
            assert.equal(
                typeof container.initialObjects.myEntities2,
                "undefined",
                "Deleted object should not exist in the container.",
            );
        });

        // #endregion

        // #region Data object scenarios

        it("Create custom data object", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    myNewDataObject: TestDataObject,
                },
                migrations: async (snapshot: LoadableObjectRecord, createObject: ObjectFactory) => {
                    if ("myNewDataObject" in snapshot === false) {
                        // only create a new object when it doesn't exist
                        const myNewDataObject = await createObject(TestDataObject, 42);
                        return { ...snapshot, myNewDataObject };
                    }
                    // no change required
                    return undefined;
                },
            };

            // act
            const { container } = await client.getContainer(containerId, newSchema);

            // assert
            assert.ok(container, "Container is not loaded correctly.");
            const newObject = container.initialObjects.myNewDataObject as TestDataObject;
            assert.ok(newObject, "New object should be created.");
            assert.equal(newObject.value, 42, "Initial value should be set in migration routine.");
        });

        // #endregion
    });
});
