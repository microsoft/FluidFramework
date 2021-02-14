/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISharedDirectory, ISharedMap, SharedDirectory, SharedMap } from "@fluidframework/map";
import { MessageType } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ChannelFactoryRegistry,
} from "@fluidframework/test-utils";
import {
    generateTest,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "./compatUtils";

const directoryId = "directoryKey";
const registry: ChannelFactoryRegistry = [[directoryId, SharedDirectory.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

const tests = (argsFactory: () => ITestObjectProvider) => {
    let args: ITestObjectProvider;
    beforeEach(()=>{
        args = argsFactory();
    });
    afterEach(() => {
        args.reset();
    });

    let dataObject1: ITestFluidObject;
    let sharedDirectory1: ISharedDirectory;
    let sharedDirectory2: ISharedDirectory;
    let sharedDirectory3: ISharedDirectory;

    beforeEach(async () => {
        // Create a Container for the first client.
        const container1 = await args.makeTestContainer(testContainerConfig);
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        sharedDirectory1 = await dataObject1.getSharedObject<SharedDirectory>(directoryId);

        // Load the Container that was created by the first client.
        const container2 = await args.loadTestContainer(testContainerConfig);
        const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        sharedDirectory2 = await dataObject2.getSharedObject<SharedDirectory>(directoryId);

        // Load the Container that was created by the first client.
        const container3 = await args.loadTestContainer(testContainerConfig);
        const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        sharedDirectory3 = await dataObject3.getSharedObject<SharedDirectory>(directoryId);

        await args.opProcessingController.process();
    });

    function expectAllValues(msg, key, path, value1, value2, value3) {
        const user1Value = sharedDirectory1.getWorkingDirectory(path)?.get(key);
        assert.equal(user1Value, value1, `Incorrect value for ${key} in container 1 ${msg}`);
        const user2Value = sharedDirectory2.getWorkingDirectory(path)?.get(key);
        assert.equal(user2Value, value2, `Incorrect value for ${key} in container 2 ${msg}`);
        const user3Value = sharedDirectory3.getWorkingDirectory(path)?.get(key);
        assert.equal(user3Value, value3, `Incorrect value for ${key} in container 3 ${msg}`);
    }

    function expectAllBeforeValues(key, path, value1, value2, value3) {
        expectAllValues("before process", key, path, value1, value2, value3);
    }

    function expectAllAfterValues(key, path, value) {
        expectAllValues("after process", key, path, value, value, value);
    }

    function expectAllSize(size: number, path?: string) {
        const dir1 = path ? sharedDirectory1.getWorkingDirectory(path) : sharedDirectory1;
        const dir2 = path ? sharedDirectory2.getWorkingDirectory(path) : sharedDirectory2;
        const dir3 = path ? sharedDirectory3.getWorkingDirectory(path) : sharedDirectory3;

        assert(dir1);
        assert(dir2);
        assert(dir3);

        const keys1 = Array.from(dir1.keys());
        assert.equal(keys1.length, size, "Incorrect number of Keys in container 1");
        const keys2 = Array.from(dir2.keys());
        assert.equal(keys2.length, size, "Incorrect number of Keys in container 2");
        const keys3 = Array.from(dir3.keys());
        assert.equal(keys3.length, size, "Incorrect number of Keys in container 3");

        assert.equal(dir1.size, size, "Incorrect map size in container 1");
        assert.equal(dir2.size, size, "Incorrect map size in container 2");
        assert.equal(dir3.size, size, "Incorrect map size in container 3");
    }

    describe("Smoke test", () => {
        it("should create the directory in 3 containers correctly", async () => {
            // Directory was created in beforeEach
            assert.ok(sharedDirectory1, `Couldn't find the directory in root1, instead got ${sharedDirectory1}`);
            assert.ok(sharedDirectory2, `Couldn't find the directory in root2, instead got ${sharedDirectory2}`);
            assert.ok(sharedDirectory3, `Couldn't find the directory in root3, instead got ${sharedDirectory3}`);
        });

        it("should set a key in the directory in three containers correctly", async () => {
            sharedDirectory1.set("testKey1", "testValue1");
            await args.opProcessingController.process();
            expectAllAfterValues("testKey1", "/", "testValue1");
        });
    });

    describe("Root operations", () => {
        beforeEach("Populate with a value under the root", async () => {
            sharedDirectory1.set("testKey1", "testValue1");
            await args.opProcessingController.process();
            expectAllAfterValues("testKey1", "/", "testValue1");
        });

        it("should delete a value in 3 containers correctly", async () => {
            sharedDirectory2.delete("testKey1");
            await args.opProcessingController.process();

            const hasKey1 = sharedDirectory1.has("testKey1");
            assert.equal(hasKey1, false, "testKey1 not deleted in container 1");

            const hasKey2 = sharedDirectory2.has("testKey1");
            assert.equal(hasKey2, false, "testKey1 not deleted in container 2");

            const hasKey3 = sharedDirectory3.has("testKey1");
            assert.equal(hasKey3, false, "testKey1 not deleted in container 3");
        });

        it("should have the correct size in three containers", async () => {
            sharedDirectory3.set("testKey3", true);

            await args.opProcessingController.process();

            // check the number of keys in the map (2 keys set)
            expectAllSize(2);
        });

        it("should set key value to undefined in three containers correctly", async () => {
            sharedDirectory2.set("testKey1", undefined);
            sharedDirectory2.set("testKey2", undefined);

            await args.opProcessingController.process();

            expectAllAfterValues("testKey1", "/", undefined);
            expectAllAfterValues("testKey2", "/", undefined);
        });

        it("should update value and trigger onValueChanged on other two containers", async () => {
            let user1ValueChangedCount: number = 0;
            let user2ValueChangedCount: number = 0;
            let user3ValueChangedCount: number = 0;
            sharedDirectory1.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    assert(msg);
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in container 1");
                        user1ValueChangedCount = user1ValueChangedCount + 1;
                    }
                }
            });
            sharedDirectory2.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    assert(msg);
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in container 2");
                        user2ValueChangedCount = user2ValueChangedCount + 1;
                    }
                }
            });
            sharedDirectory3.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    assert(msg);
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in container 3");
                        user3ValueChangedCount = user3ValueChangedCount + 1;
                    }
                }
            });

            sharedDirectory1.set("testKey1", "updatedValue");

            await args.opProcessingController.process();

            assert.equal(user1ValueChangedCount, 0, "Incorrect number of valueChanged op received in container 1");
            assert.equal(user2ValueChangedCount, 1, "Incorrect number of valueChanged op received in container 2");
            assert.equal(user3ValueChangedCount, 1, "Incorrect number of valueChanged op received in container 3");

            expectAllAfterValues("testKey1", "/", "updatedValue");
        });

        describe("Eventual consistency after simultaneous operations", () => {
            it("set/set", async () => {
                sharedDirectory1.set("testKey1", "value1");
                sharedDirectory2.set("testKey1", "value2");
                sharedDirectory3.set("testKey1", "value0");
                sharedDirectory3.set("testKey1", "value3");

                expectAllBeforeValues("testKey1", "/", "value1", "value2", "value3");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey1", "/", "value3");
            });

            it("delete/set", async () => {
                // set after delete
                sharedDirectory1.set("testKey1", "value1.1");
                sharedDirectory2.delete("testKey1");
                sharedDirectory3.set("testKey1", "value1.3");

                expectAllBeforeValues("testKey1", "/", "value1.1", undefined, "value1.3");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey1", "/", "value1.3");
            });

            it("delete/set from the same container", async () => {
                // delete and then set on the same container
                sharedDirectory1.set("testKey2", "value2.1");
                sharedDirectory2.delete("testKey2");
                sharedDirectory3.set("testKey2", "value2.3");

                // drain the outgoing so that the next set will come after
                await args.opProcessingController.processOutgoing();

                sharedDirectory2.set("testKey2", "value2.2");

                expectAllBeforeValues("testKey2", "/", "value2.1", "value2.2", "value2.3");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey2", "/", "value2.2");
            });

            it("set/delete", async () => {
                // delete after set
                sharedDirectory1.set("testKey3", "value3.1");
                sharedDirectory2.set("testKey3", "value3.2");
                sharedDirectory3.delete("testKey3");

                expectAllBeforeValues("testKey3", "/", "value3.1", "value3.2", undefined);

                await args.opProcessingController.process();

                expectAllAfterValues("testKey3", "/", undefined);
            });

            it("set/clear", async () => {
                // clear after set
                sharedDirectory1.set("testKey1", "value1.1");
                sharedDirectory2.set("testKey1", "value1.2");
                sharedDirectory3.clear();

                expectAllBeforeValues("testKey1", "/", "value1.1", "value1.2", undefined);

                assert.equal(sharedDirectory3.size, 0, "Incorrect map size after clear");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey1", "/", undefined);
                expectAllSize(0);
            });

            it("clear/set on the same container", async () => {
                // set after clear on the same map
                sharedDirectory1.set("testKey2", "value2.1");
                sharedDirectory2.clear();
                sharedDirectory3.set("testKey2", "value2.3");

                // drain the outgoing so that the next set will come after
                await args.opProcessingController.processOutgoing();

                sharedDirectory2.set("testKey2", "value2.2");
                expectAllBeforeValues("testKey2", "/", "value2.1", "value2.2", "value2.3");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey2", "/", "value2.2");
                expectAllSize(1);
            });

            it("clear/set", async () => {
                // set after clear
                sharedDirectory1.set("testKey3", "value3.1");
                sharedDirectory2.clear();
                sharedDirectory3.set("testKey3", "value3.3");
                expectAllBeforeValues("testKey3", "/", "value3.1", undefined, "value3.3");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey3", "/", "value3.3");
                expectAllSize(1);
            });
        });

        describe("Nested map support", () => {
            it("supports setting a map as a value", async () => {
                const newMap = SharedMap.create(dataObject1.runtime);
                sharedDirectory1.set("mapKey", newMap.handle);

                await args.opProcessingController.process();

                const [map1, map2, map3] = await Promise.all([
                    sharedDirectory1.get<IFluidHandle<ISharedMap>>("mapKey")?.get(),
                    sharedDirectory2.get<IFluidHandle<ISharedMap>>("mapKey")?.get(),
                    sharedDirectory3.get<IFluidHandle<ISharedMap>>("mapKey")?.get(),
                ]);

                assert.ok(map1, "Map did not correctly set as value in container 1");
                assert.ok(map2, "Map did not correctly set as value in container 2");
                assert.ok(map3, "Map did not correctly set as value in container 3");

                map2.set("testMapKey", "testMapValue");

                await args.opProcessingController.process();

                assert.equal(map3.get("testMapKey"), "testMapValue", "Wrong values in map in container 3");
            });
        });
    });

    describe("SubDirectory operations", () => {
        it("should set a key in a SubDirectory in three containers correctly", async () => {
            sharedDirectory1.createSubDirectory("testSubDir1").set("testKey1", "testValue1");

            await args.opProcessingController.process();

            expectAllAfterValues("testKey1", "testSubDir1", "testValue1");
        });

        it("should delete a key in a SubDirectory in three containers correctly", async () => {
            sharedDirectory2.createSubDirectory("testSubDir1").set("testKey1", "testValue1");

            await args.opProcessingController.process();

            expectAllAfterValues("testKey1", "testSubDir1", "testValue1");
            const subDir1 = sharedDirectory3.getWorkingDirectory("testSubDir1");
            assert(subDir1);
            subDir1.delete("testKey1");

            await args.opProcessingController.process();

            expectAllAfterValues("testKey1", "testSubDir1", undefined);
        });

        it("should delete a child SubDirectory in a SubDirectory in three containers correctly", async () => {
            sharedDirectory2.createSubDirectory("testSubDir1").set("testKey1", "testValue1");

            await args.opProcessingController.process();

            expectAllAfterValues("testKey1", "testSubDir1", "testValue1");
            sharedDirectory3.deleteSubDirectory("testSubDir1");

            await args.opProcessingController.process();

            assert.equal(
                sharedDirectory1.getWorkingDirectory("testSubDir1"),
                undefined,
                "SubDirectory not deleted in container 1");
            assert.equal(
                sharedDirectory2.getWorkingDirectory("testSubDir1"),
                undefined,
                "SubDirectory not deleted in container 2");
            assert.equal(
                sharedDirectory3.getWorkingDirectory("testSubDir1"),
                undefined,
                "SubDirectory not deleted in container 3");
        });

        it("should have the correct size in three containers", async () => {
            sharedDirectory1.createSubDirectory("testSubDir1").set("testKey1", "testValue1");
            sharedDirectory2.createSubDirectory("testSubDir1").set("testKey2", "testValue2");
            sharedDirectory3.createSubDirectory("otherSubDir2").set("testKey3", "testValue3");

            await args.opProcessingController.process();

            expectAllSize(2, "testSubDir1");
            sharedDirectory3.getWorkingDirectory("testSubDir1")?.clear();

            await args.opProcessingController.process();

            expectAllSize(0, "testSubDir1");
        });

        it("should update value and trigger onValueChanged on other two containers", async () => {
            let user1ValueChangedCount: number = 0;
            let user2ValueChangedCount: number = 0;
            let user3ValueChangedCount: number = 0;
            sharedDirectory1.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    assert(msg);
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for key in container 1");
                        assert.equal(changed.path, "/testSubDir1", "Incorrect value for path in container 1");
                        user1ValueChangedCount = user1ValueChangedCount + 1;
                    }
                }
            });
            sharedDirectory2.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    assert(msg);
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for key in container 2");
                        assert.equal(changed.path, "/testSubDir1", "Incorrect value for path in container 2");
                        user2ValueChangedCount = user2ValueChangedCount + 1;
                    }
                }
            });
            sharedDirectory3.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    assert(msg);
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for key in container 3");
                        assert.equal(changed.path, "/testSubDir1", "Incorrect value for path in container 3");
                        user3ValueChangedCount = user3ValueChangedCount + 1;
                    }
                }
            });

            sharedDirectory1.createSubDirectory("testSubDir1").set("testKey1", "updatedValue");

            await args.opProcessingController.process();

            assert.equal(user1ValueChangedCount, 0, "Incorrect number of valueChanged op received in container 1");
            assert.equal(user2ValueChangedCount, 1, "Incorrect number of valueChanged op received in container 2");
            assert.equal(user3ValueChangedCount, 1, "Incorrect number of valueChanged op received in container 3");

            expectAllAfterValues("testKey1", "/testSubDir1", "updatedValue");
        });

        describe("Eventual consistency after simultaneous operations", () => {
            let root1SubDir;
            let root2SubDir;
            let root3SubDir;
            beforeEach(async () => {
                sharedDirectory1.createSubDirectory("testSubDir").set("dummyKey", "dummyValue");

                await args.opProcessingController.process();

                root1SubDir = sharedDirectory1.getWorkingDirectory("testSubDir");
                root2SubDir = sharedDirectory2.getWorkingDirectory("testSubDir");
                root3SubDir = sharedDirectory3.getWorkingDirectory("testSubDir");
            });

            it("set/set", async () => {
                root1SubDir.set("testKey1", "value1");
                root2SubDir.set("testKey1", "value2");
                root3SubDir.set("testKey1", "value0");
                root3SubDir.set("testKey1", "value3");

                expectAllBeforeValues("testKey1", "/testSubDir", "value1", "value2", "value3");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey1", "/testSubDir", "value3");
            });

            it("delete/set", async () => {
                // set after delete
                root1SubDir.set("testKey1", "value1.1");
                root2SubDir.delete("testKey1");
                root3SubDir.set("testKey1", "value1.3");

                expectAllBeforeValues("testKey1", "/testSubDir", "value1.1", undefined, "value1.3");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey1", "/testSubDir", "value1.3");
            });

            it("delete/set from the same container", async () => {
                // delete and then set on the same container
                root1SubDir.set("testKey2", "value2.1");
                root2SubDir.delete("testKey2");
                root3SubDir.set("testKey2", "value2.3");

                // drain the outgoing so that the next set will come after
                await args.opProcessingController.processOutgoing();

                root2SubDir.set("testKey2", "value2.2");
                expectAllBeforeValues("testKey2", "/testSubDir", "value2.1", "value2.2", "value2.3");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey2", "/testSubDir", "value2.2");
            });

            it("set/delete", async () => {
                // delete after set
                root1SubDir.set("testKey3", "value3.1");
                root2SubDir.set("testKey3", "value3.2");
                root3SubDir.delete("testKey3");

                expectAllBeforeValues("testKey3", "/testSubDir", "value3.1", "value3.2", undefined);

                await args.opProcessingController.process();

                expectAllAfterValues("testKey3", "/testSubDir", undefined);
            });

            it("set/clear", async () => {
                // clear after set
                root1SubDir.set("testKey1", "value1.1");
                root2SubDir.set("testKey1", "value1.2");
                root3SubDir.clear();
                expectAllBeforeValues("testKey1", "/testSubDir", "value1.1", "value1.2", undefined);
                assert.equal(root3SubDir.size, 0, "Incorrect map size after clear");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey1", "/testSubDir", undefined);
                expectAllSize(0, "/testSubDir");
            });

            it("clear/set on the same container", async () => {
                // set after clear on the same map
                root1SubDir.set("testKey2", "value2.1");
                root2SubDir.clear();
                root3SubDir.set("testKey2", "value2.3");

                // drain the outgoing so that the next set will come after
                await args.opProcessingController.processOutgoing();

                root2SubDir.set("testKey2", "value2.2");
                expectAllBeforeValues("testKey2", "/testSubDir", "value2.1", "value2.2", "value2.3");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey2", "/testSubDir", "value2.2");
                expectAllSize(1, "/testSubDir");
            });

            it("clear/set", async () => {
                // set after clear
                root1SubDir.set("testKey3", "value3.1");
                root2SubDir.clear();
                root3SubDir.set("testKey3", "value3.3");
                expectAllBeforeValues("testKey3", "/testSubDir", "value3.1", undefined, "value3.3");

                await args.opProcessingController.process();

                expectAllAfterValues("testKey3", "/testSubDir", "value3.3");
                expectAllSize(1, "/testSubDir");
            });
        });
    });

    describe("Operations in local state", () => {
        describe("Load new directory with data from local state and process ops", () => {
            /**
             * These tests test the scenario found in the following bug:
             * https://github.com/microsoft/FluidFramework/issues/2400
             *
             * - A SharedDirectory in local state performs a set or directory operation.
             * - A second SharedDirectory is then created from the summary of the first one.
             * - The second SharedDirectory performs the same operation as the first one but with a different value.
             * - The expected behavior is that the first SharedDirectory updates the key with the new value. But in the
             *   bug, the first SharedDirectory stores the key in its pending state even though it does not send out an
             *   an op. So when it gets a remote op with the same key, it ignores it as it has a pending op with the
             *   same key.
             */

            it("can process set in local state", async () => {
                // Create a new directory in local (detached) state.
                const newDirectory1 = SharedDirectory.create(dataObject1.runtime);

                // Set a value while in local state.
                newDirectory1.set("newKey", "newValue");

                // Now add the handle to an attached directory so the new directory gets attached too.
                sharedDirectory1.set("newSharedDirectory", newDirectory1.handle);

                await args.opProcessingController.process();

                // The new directory should be available in the remote client and it should contain that key that was
                // set in local state.
                const newDirectory2Handle = sharedDirectory2.get<IFluidHandle<SharedDirectory>>("newSharedDirectory");
                assert(newDirectory2Handle);
                const newDirectory2 = await newDirectory2Handle.get();
                assert.equal(
                    newDirectory2.get("newKey"),
                    "newValue",
                    "The data set in local state is not available in directory 2");

                // Set a new value for the same key in the remote directory.
                newDirectory2.set("newKey", "anotherNewValue");

                await args.opProcessingController.process();

                // Verify that the new value is updated in both the directories.
                assert.equal(
                    newDirectory2.get("newKey"),
                    "anotherNewValue",
                    "The new value is not updated in directory 2");
                assert.equal(
                    newDirectory1.get("newKey"),
                    "anotherNewValue",
                    "The new value is not updated in directory 1");
            });

            it("can process sub directory ops in local state", async () => {
                // Create a new directory in local (detached) state.
                const newDirectory1 = SharedDirectory.create(dataObject1.runtime);

                // Create a sub directory while in local state.
                const subDirName = "testSubDir";
                newDirectory1.createSubDirectory(subDirName);

                // Now add the handle to an attached directory so the new directory gets attached too.
                sharedDirectory1.set("newSharedDirectory", newDirectory1.handle);

                await args.opProcessingController.process();

                // The new directory should be available in the remote client and it should contain that key that was
                // set in local state.
                const newDirectory2Handle = sharedDirectory2.get<IFluidHandle<SharedDirectory>>("newSharedDirectory");
                assert(newDirectory2Handle);
                const newDirectory2 = await newDirectory2Handle.get();
                assert.ok(
                    newDirectory2.getSubDirectory(subDirName),
                    "The subdirectory created in local state is not available in directory 2");

                // Delete the sub directory from the remote client.
                newDirectory2.deleteSubDirectory(subDirName);

                await args.opProcessingController.process();

                // Verify that the sub directory is deleted from both the directories.
                assert.equal(
                    newDirectory2.getSubDirectory(subDirName),
                    undefined,
                    "The sub directory is not deleted from directory 2");
                assert.equal(
                    newDirectory1.getSubDirectory(subDirName),
                    undefined,
                    "The sub directory is not deleted from directory 1");
            });
        });
    });
};

describe("Directory", () => {
    generateTest(tests);
});
