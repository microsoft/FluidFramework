/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerSchema,
    IFluidContainer,
    LoadableObjectRecord,
    ObjectFactory,
    SharedDirectory,
    SharedMap,
} from "fluid-framework";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { TestDataObject } from "./testDataObject";

const verifyContainerSchema = (container: IFluidContainer, schema: ContainerSchema) => {
    const initialObjects = container.initialObjects;
    for (const schemaKey of Object.keys(schema.initialObjects)) {
        assert.ok(schemaKey in initialObjects, `Object ${schemaKey} defined in schema is not found in container`);
    }
    for (const objectKey of Object.keys(initialObjects)) {
        assert.ok(objectKey in schema.initialObjects, `Container object ${objectKey} is not defined in schema`);
    }
};

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
            verifyContainerSchema(container, initialSchema);
            // Close the container immediately after attaching it to the storage.
            container.dispose();
        });

        afterEach(() => {
        });

        const loadAndVerifyContainer = async (schema: ContainerSchema) => {
            const { container } = await client.getContainer(containerId, schema);
            assert.ok(container, "Container is not loaded correctly.");
            return container;
        };

        // #region Core scenarios

        /** Back-compat scenario. Open a container with the same schema. */
        it("No migrations - no changes in schema", async () => {
            // act
            const container = await loadAndVerifyContainer(initialSchema);

            // assert
            verifyContainerSchema(container, initialSchema);
        });

        it("No migrations - new schema revision", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    // schema modifications below
                    myNewObject: SharedDirectory,
                },
            };

            // act
            const container = await loadAndVerifyContainer(newSchema);

            // assert
            verifyContainerSchema(container, initialSchema);
        });

        it("No-op migration", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    myEntities2: SharedMap,
                    // 👇 new container schema has an additional object specified 👇
                    myNewObject: SharedDirectory,
                },
                migrations: async () => {
                    // the provided migration routine doesn't alter container objects
                    return undefined;
                },
            };

            // act
            const container = await loadAndVerifyContainer(newSchema);

            // assert
            verifyContainerSchema(container, initialSchema);
        });

        it("Add object", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    myEntities2: SharedMap,
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
            const container = await loadAndVerifyContainer(newSchema);

            // assert
            verifyContainerSchema(container, newSchema);
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
            const container = await loadAndVerifyContainer(newSchema);

            // assert
            verifyContainerSchema(container, newSchema);
        });

        it("Rename object", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntitiesRenamed: SharedMap,
                    myEntities2: SharedMap,
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
            const container = await loadAndVerifyContainer(newSchema);

            // assert
            verifyContainerSchema(container, newSchema);
        });

        it("Update object - seed data", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    myEntities2: SharedMap,
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
            const container = await loadAndVerifyContainer(newSchema);

            // assert
            verifyContainerSchema(container, newSchema);
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
            const container = await loadAndVerifyContainer(newSchema);

            // assert
            verifyContainerSchema(container, newSchema);
            const entities = container.initialObjects.myEntities as SharedMap;
            assert.ok(entities.has("newKey"), "New key should be added.");
        });

        it("Split object", async () => {
            assert.fail("TBD");
        });

        it("Merge objects", async () => {
            assert.fail("TBD");
        });

        it("Chained migrations", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    myNewObject: SharedMap,
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
            const container = await loadAndVerifyContainer(newSchema);

            // assert
            verifyContainerSchema(container, newSchema);
        });

        // #endregion

        // #region Data object scenarios

        it("Add data object", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    myEntities2: SharedMap,
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
            const container = await loadAndVerifyContainer(newSchema);

            // assert
            verifyContainerSchema(container, newSchema);
            const newObject = container.initialObjects.myNewDataObject as TestDataObject;
            assert.ok(newObject, "New data object should be created.");
            assert.equal(newObject.value, 42, "Initial value should be set in migration routine.");
        });

        it("Add dynamic object", async () => {
            // arrange
            const newSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    myEntities2: SharedMap,
                },
                dynamicObjectTypes: [TestDataObject],
                migrations: async (snapshot: LoadableObjectRecord, createObject: ObjectFactory) => {
                    const entities = snapshot.myEntities as SharedMap;
                    if ("myNewDynamicObject" in entities === false) {
                        // only create a new object when it doesn't exist
                        const myNewDynamicObject = await createObject(TestDataObject, 42);
                        entities.set("myNewDynamicObject", myNewDynamicObject.handle);
                        return { ...snapshot };
                    }
                    // no change required
                    return undefined;
                },
            };

            // act
            const container = await loadAndVerifyContainer(newSchema);

            // assert
            verifyContainerSchema(container, newSchema);
            const myEntities = container.initialObjects.myEntities as SharedMap;
            assert.ok(myEntities.has("myNewDynamicObject"), "The new dynamic object should be persisted.");
            assert.ok(myEntities.get("myNewDynamicObject"), "It should be a valid object handle");
        });

        it("Delete data object", async () => {
            const createSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                    myDataObject: TestDataObject,
                },
            };
            // arrange
            const { container: createContainer } = await client.createContainer(createSchema);
            containerId = await createContainer.attach();
            verifyContainerSchema(createContainer, createSchema);
            createContainer.dispose();

            const newSchema: ContainerSchema = {
                initialObjects: {
                    myEntities: SharedMap,
                },
                dynamicObjectTypes: [TestDataObject],
                migrations: async (snapshot: LoadableObjectRecord) => {
                    if ("myDataObject" in snapshot) {
                        const { myDataObject: deleted, ...properties } = snapshot;
                        return properties;
                    }
                    // no change required
                    return undefined;
                },
            };

            // act
            const container = await loadAndVerifyContainer(newSchema);

            // assert
            verifyContainerSchema(container, newSchema);
        });

        // #endregion
    });
});
