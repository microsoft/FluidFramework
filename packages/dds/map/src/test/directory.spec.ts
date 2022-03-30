/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISummaryBlob, SummaryType } from "@fluidframework/protocol-definitions";
import { IGCTestProvider, runGCTests } from "@fluid-internal/test-dds-utils";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockSharedObjectServices,
    MockStorage,
} from "@fluidframework/test-runtime-utils";

import { MapFactory } from "../map";
import { DirectoryFactory, IDirectoryNewStorageFormat, SharedDirectory } from "../directory";
import { IDirectory } from "../interfaces";

function createConnectedDirectory(id: string, runtimeFactory: MockContainerRuntimeFactory) {
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
    const services = {
        deltaConnection: containerRuntime.createDeltaConnection(),
        objectStorage: new MockStorage(),
    };
    const directory = new SharedDirectory(id, dataStoreRuntime, DirectoryFactory.Attributes);
    directory.connect(services);
    return directory;
}

function createLocalMap(id: string) {
    const factory = new MapFactory();
    return factory.create(new MockFluidDataStoreRuntime(), id);
}

// eslint-disable-next-line @typescript-eslint/ban-types
async function populate(directory: SharedDirectory, content: object) {
    const storage = new MockSharedObjectServices({
        header: JSON.stringify(content),
    });
    return directory.load(storage);
}

function serialize(directory1: SharedDirectory): string {
    const summaryTree = directory1.getAttachSummary().summary;
    const summaryObjectKeys = Object.keys(summaryTree.tree);
    assert.strictEqual(summaryObjectKeys.length, 1, "summary tree should only have one blob");
    assert.strictEqual(summaryObjectKeys[0], "header", "summary should have a header blob");
    assert.strictEqual(summaryTree.tree.header.type, SummaryType.Blob, "header is not of SummaryType.Blob");

    const content = summaryTree.tree.header.content as string;
    return JSON.stringify((JSON.parse(content) as IDirectoryNewStorageFormat).content);
}

describe("Directory", () => {
    describe("Local state", () => {
        let directory: SharedDirectory;
        let dataStoreRuntime: MockFluidDataStoreRuntime;

        beforeEach(async () => {
            dataStoreRuntime = new MockFluidDataStoreRuntime();
            dataStoreRuntime.local = true;
            directory = new SharedDirectory("directory", dataStoreRuntime, DirectoryFactory.Attributes);
        });

        describe("API", () => {
            it("Can create a new directory", () => {
                assert.ok(directory, "could not create a new directory");
            });

            it("Knows its absolute path", () => {
                assert.equal(directory.absolutePath, "/", "the absolute path is not correct");
            });

            it("Can set and get keys one level deep", () => {
                directory.set("testKey", "testValue");
                directory.set("testKey2", "testValue2");
                assert.equal(directory.get("testKey"), "testValue", "could not retrieve set key 1");
                assert.equal(directory.get("testKey2"), "testValue2", "could not retrieve set key 2");
            });

            it("should fire correct directory events", async () => {
                let valueChangedExpected: boolean = true;
                let containedValueChangedExpected: boolean = true;
                let clearExpected: boolean = false;
                let previousValue: any;

                directory.on("op", (arg1, arg2, arg3) => {
                    assert.fail("shouldn't receive an op event");
                });
                directory.on("valueChanged", (changed, local, target) => {
                    assert.equal(valueChangedExpected, true, "valueChange event not expected");
                    valueChangedExpected = false;

                    assert.equal(changed.key, "dwayne");
                    assert.equal(changed.previousValue, previousValue);
                    assert.equal(changed.path, directory.absolutePath);

                    assert.equal(local, true, "local should be true for local action for valueChanged event");
                    assert.equal(target, directory, "target should be the directory for valueChanged event");
                });
                directory.on("containedValueChanged", (changed, local, target) => {
                    assert.equal(containedValueChangedExpected, true,
                        "containedValueChanged event not expected for containedValueChanged event");
                    containedValueChangedExpected = false;

                    assert.equal(changed.key, "dwayne");
                    assert.equal(changed.previousValue, previousValue);

                    assert.equal(local, true, "local should be true for local action for containedValueChanged event");
                    assert.equal(target, directory, "target should be the directory for containedValueChanged event");
                });
                directory.on("clear", (local, target) => {
                    assert.equal(clearExpected, true, "clear event not expected");
                    clearExpected = false;

                    assert.equal(local, true, "local should be true for local action for clear event");
                    assert.equal(target, directory, "target should be the directory for clear event");
                });
                directory.on("error", (error) => {
                    // propagate error in the event handlers
                    throw error;
                });

                // Test set
                previousValue = undefined;
                directory.set("dwayne", "johnson");
                assert.equal(valueChangedExpected, false, "missing valueChangedExpected event");
                assert.equal(containedValueChangedExpected, false, "missing containedValueChanged event");

                // Test delete
                previousValue = "johnson";
                valueChangedExpected = true;
                containedValueChangedExpected = true;
                directory.delete("dwayne");
                assert.equal(valueChangedExpected, false, "missing valueChangedExpected event");
                assert.equal(containedValueChangedExpected, false, "missing containedValueChanged event");

                // Test clear
                clearExpected = true;
                directory.clear();
                assert.equal(clearExpected, false, "missing clearExpected event");
            });

            it("Should fire dispose event correctly", () => {
                let valueChangedExpected: boolean = true;
                let previousValue: any;

                directory.on("valueChanged", (changed, local, target) => {
                    assert.equal(valueChangedExpected, true, "valueChange event not expected");
                    valueChangedExpected = false;

                    assert.equal(changed.key, "dwayne", "key should match");
                    assert.equal(changed.previousValue, previousValue, "previous value should match");
                    assert.equal(changed.path, "/rock", "absolute path should match");

                    assert.equal(local, true, "local should be true for local action for valueChanged event");
                    assert.equal(target, directory, "target should be the directory for valueChanged event");
                });

                // Test dispose on subdirectory delete
                let subDirectoryDisposed = false;
                const subDirectory = directory.createSubDirectory("rock");
                subDirectory.on("disposed", (value: IDirectory) => {
                    subDirectoryDisposed = true;
                    assert.equal(value.disposed, true, "sub directory not deleted");
                });
                // Should fire dispose event.
                directory.deleteSubDirectory("rock");
                assert.equal(subDirectoryDisposed, true, "sub directory not disposed!!");

                // Should be able to work on new directory with same name.
                previousValue = undefined;
                valueChangedExpected = true;
                const newSubDirectory = directory.createSubDirectory("rock");
                newSubDirectory.set("dwayne", "johnson");
                assert.equal(valueChangedExpected, false, "missing valueChangedExpected event");

                // Usage Error on accessing disposed directory.
                try {
                    subDirectory.set("throw", "error");
                    assert.fail("Should throw usage error");
                } catch (error) {
                    assert.strictEqual(error.errorType, "usageError", "Should throw usage error");
                }

                // Check recursive dispose event firing
                const subSubDirectory = newSubDirectory.createSubDirectory("rockChild");
                let rockSubDirectoryDisposed = false;
                let subSubDirectoryDisposed = false;
                newSubDirectory.on("disposed", (value: IDirectory) => {
                    rockSubDirectoryDisposed = true;
                    assert.equal(value.disposed, true, "rock sub directory not deleted");
                });
                subSubDirectory.on("disposed", (value: IDirectory) => {
                    subSubDirectoryDisposed = true;
                    assert.equal(value.disposed, true, "sub sub directory not deleted");
                });
                directory.deleteSubDirectory("rock");
                assert(rockSubDirectoryDisposed, "Rock sub directory should be disposed");
                assert(subSubDirectoryDisposed, "sub sub directory should be disposed");
            });

            it("Rejects a undefined and null key set", () => {
                assert.throws(() => {
                    directory.set(undefined as any, "testValue");
                }, "Should throw for key of undefined");
                assert.throws(() => {
                    directory.set(null as any, "testValue");
                }, "Should throw for key of null");
            });

            it("Rejects subdirectories with undefined and null names", () => {
                assert.throws(() => {
                    directory.createSubDirectory(undefined as any);
                }, "Should throw for undefined subdirectory name");
                assert.throws(() => {
                    directory.createSubDirectory(null as any);
                }, "Should throw for null subdirectory name");
            });
        });

        describe("Serialize", () => {
            it("Should serialize an empty directory as a JSON object", () => {
                const serialized = serialize(directory);
                assert.equal(serialized, "{}");
            });

            it("Should serialize a directory without subdirectories as a JSON object", () => {
                directory.set("first", "second");
                directory.set("third", "fourth");
                directory.set("fifth", "sixth");
                const subMap = createLocalMap("subMap");
                directory.set("object", subMap.handle);

                const subMapHandleUrl = subMap.handle.absolutePath;

                const serialized = serialize(directory);
                // eslint-disable-next-line max-len
                const expected = `{"storage":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain","value":"sixth"},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"}}}}`;
                assert.equal(serialized, expected);
            });

            it("Should serialize a directory with subdirectories as a JSON object", () => {
                directory.set("first", "second");
                directory.set("third", "fourth");
                directory.set("fifth", "sixth");
                const subMap = createLocalMap("subMap");
                directory.set("object", subMap.handle);
                const nestedDirectory = directory.createSubDirectory("nested");
                nestedDirectory.set("deepKey1", "deepValue1");
                nestedDirectory.createSubDirectory("nested2")
                    .createSubDirectory("nested3")
                    .set("deepKey2", "deepValue2");

                const subMapHandleUrl = subMap.handle.absolutePath;
                const serialized = serialize(directory);
                // eslint-disable-next-line max-len
                const expected = `{"storage":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain","value":"sixth"},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"}}},"subdirectories":{"nested":{"storage":{"deepKey1":{"type":"Plain","value":"deepValue1"}},"subdirectories":{"nested2":{"subdirectories":{"nested3":{"storage":{"deepKey2":{"type":"Plain","value":"deepValue2"}}}}}}}}}`;
                assert.equal(serialized, expected);
            });

            it("Should serialize an undefined value", () => {
                directory.set("first", "second");
                directory.set("third", "fourth");
                directory.set("fifth", undefined);
                assert.ok(directory.has("fifth"));
                const subMap = createLocalMap("subMap");
                directory.set("object", subMap.handle);
                const nestedDirectory = directory.createSubDirectory("nested");
                nestedDirectory.set("deepKey1", "deepValue1");
                nestedDirectory.set("deepKeyUndefined", undefined);
                assert.ok(nestedDirectory.has("deepKeyUndefined"));
                nestedDirectory.createSubDirectory("nested2")
                    .createSubDirectory("nested3")
                    .set("deepKey2", "deepValue2");

                const subMapHandleUrl = subMap.handle.absolutePath;
                const serialized = serialize(directory);
                // eslint-disable-next-line max-len
                const expected = `{"storage":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain"},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"}}},"subdirectories":{"nested":{"storage":{"deepKey1":{"type":"Plain","value":"deepValue1"},"deepKeyUndefined":{"type":"Plain"}},"subdirectories":{"nested2":{"subdirectories":{"nested3":{"storage":{"deepKey2":{"type":"Plain","value":"deepValue2"}}}}}}}}}`;
                assert.equal(serialized, expected);
            });
        });

        describe("Populate", () => {
            it("Should populate the directory from an empty JSON object (old format)", async () => {
                await populate(directory, {});
                assert.equal(directory.size, 0, "Failed to initialize to empty directory storage");
                directory.set("testKey", "testValue");
                assert.equal(directory.get("testKey"), "testValue", "Failed to set testKey");
                directory.createSubDirectory("testSubDir").set("testSubKey", "testSubValue");
                const subdir = directory.getWorkingDirectory("testSubDir");
                assert(subdir);
                assert.equal(subdir.get("testSubKey"), "testSubValue", "Failed to set testSubKey");
            });

            it("Should populate the directory from a basic JSON object (old format)", async () => {
                await populate(directory, {
                    storage: {
                        testKey: {
                            type: "Plain",
                            value: "testValue4",
                        },
                        testKey2: {
                            type: "Plain",
                            value: "testValue5",
                        },
                    },
                    subdirectories: {
                        foo: {
                            storage: {
                                testKey: {
                                    type: "Plain",
                                    value: "testValue",
                                },
                                testKey2: {
                                    type: "Plain",
                                    value: "testValue2",
                                },
                            },
                        },
                        bar: {
                            storage: {
                                testKey3: {
                                    type: "Plain",
                                    value: "testValue3",
                                },
                            },
                        },
                    },
                });
                assert.equal(directory.size, 2, "Failed to initialize directory storage correctly");
                assert.equal(directory.getWorkingDirectory("/foo")?.get("testKey"), "testValue");
                assert.equal(directory.getWorkingDirectory("foo")?.get("testKey2"), "testValue2");
                assert.equal(directory.getWorkingDirectory("/bar")?.get("testKey3"), "testValue3");
                assert.equal(directory.getWorkingDirectory("")?.get("testKey"), "testValue4");
                assert.equal(directory.getWorkingDirectory("/")?.get("testKey2"), "testValue5");
                directory.set("testKey", "newValue");
                assert.equal(directory.get("testKey"), "newValue", "Failed to set testKey");
                directory.createSubDirectory("testSubDir").set("testSubKey", "newSubValue");
                assert.equal(
                    directory.getWorkingDirectory("testSubDir")?.get("testSubKey"),
                    "newSubValue",
                    "Failed to set testSubKey",
                );
            });

            it("Should populate the directory with undefined values (old format)", async () => {
                await populate(directory, {
                    storage: {
                        testKey: {
                            type: "Plain",
                            value: "testValue4",
                        },
                        testKey2: {
                            type: "Plain",
                        },
                    },
                    subdirectories: {
                        foo: {
                            storage: {
                                testKey: {
                                    type: "Plain",
                                    value: "testValue",
                                },
                                testKey2: {
                                    type: "Plain",
                                },
                            },
                        },
                        bar: {
                            storage: {
                                testKey3: {
                                    type: "Plain",
                                    value: "testValue3",
                                },
                            },
                        },
                    },
                });
                assert.equal(directory.size, 2, "Failed to initialize directory storage correctly");
                assert.equal(directory.getWorkingDirectory("/foo")?.get("testKey"), "testValue");
                assert.equal(directory.getWorkingDirectory("foo")?.get("testKey2"), undefined);
                assert.equal(directory.getWorkingDirectory("/bar")?.get("testKey3"), "testValue3");
                assert.equal(directory.getWorkingDirectory("")?.get("testKey"), "testValue4");
                assert.equal(directory.getWorkingDirectory("/")?.get("testKey2"), undefined);
                assert.ok(directory.has("testKey2"));
                assert.ok(directory.getWorkingDirectory("/foo")?.has("testKey2"));
                directory.set("testKey", "newValue");
                assert.equal(directory.get("testKey"), "newValue", "Failed to set testKey");
                directory.createSubDirectory("testSubDir").set("testSubKey", "newSubValue");
                assert.equal(
                    directory.getWorkingDirectory("testSubDir")?.get("testSubKey"),
                    "newSubValue",
                    "Failed to set testSubKey",
                );
            });

            it("Should populate, serialize and de-serialize directory with long property values", async () => {
                // 40K word
                let longWord = "0123456789";
                for (let i = 0; i < 12; i++) {
                    longWord = longWord + longWord;
                }
                const logWord2 = `${longWord}_2`;

                directory.set("first", "second");
                directory.set("long1", longWord);
                const nestedDirectory = directory.createSubDirectory("nested");
                nestedDirectory.set("deepKey1", "deepValue1");
                nestedDirectory.set("long2", logWord2);

                const summarizeResult = directory.getAttachSummary();
                const summaryTree = summarizeResult.summary;
                assert.strictEqual(summaryTree.type, SummaryType.Tree, "summary should be a tree");

                assert.strictEqual(Object.keys(summaryTree.tree).length, 3, "number of blobs in summary is incorrect");

                const blob0 = summaryTree.tree.blob0 as ISummaryBlob;
                assert(blob0 !== undefined, "blob0 not present in summary");
                assert.strictEqual(blob0.type, SummaryType.Blob, "blob0 is not of SummaryType.Blob");
                assert(blob0.content.length >= 1024, "blob0's length is incorrect");

                const blob1 = summaryTree.tree.blob1 as ISummaryBlob;
                assert(blob1 !== undefined, "blob1 not present in summary");
                assert.strictEqual(blob1.type, SummaryType.Blob, "blob1 is not of SummaryType.Blob");
                assert(blob1.content.length >= 1024, "blob1's length is incorrect");

                const header = summaryTree.tree.header as ISummaryBlob;
                assert(header !== undefined, "header not present in summary");
                assert.strictEqual(header.type, SummaryType.Blob, "header is not of SummaryType.Blob");
                assert(header.content.length <= 200, "header's length is incorrect");

                const directory2 = new SharedDirectory("test", dataStoreRuntime, DirectoryFactory.Attributes);
                const storage = MockSharedObjectServices.createFromSummary(summarizeResult.summary);
                await directory2.load(storage);

                assert.equal(directory2.get("first"), "second");
                assert.equal(directory2.get("long1"), longWord);
                const nestedSubDir = directory2.getWorkingDirectory("/nested");
                assert(nestedSubDir);
                assert.equal(nestedSubDir.get("deepKey1"), "deepValue1");
                assert.equal(nestedSubDir.get("long2"), logWord2);
            });
        });

        describe("Op processing", () => {
            /**
             * These tests test the scenario found in the following bug:
             * https://github.com/microsoft/FluidFramework/issues/2400
             *
             * - A SharedDirectory in local state performs a set or directory operation.
             * - A second SharedDirectory is then created from the summarize of the first one.
             * - The second SharedDirectory performs the same operation as the first one but with a different value.
             * - The expected behavior is that the first SharedDirectory updates the key with the new value. But in the
             *   bug, the first SharedDirectory stores the key in its pending state even though it does not send out an
             *   an op. So when it gets a remote op with the same key, it ignores it as it has a pending op with the
             *   same key.
             */
            it("should correctly process a set operation sent in local state", async () => {
                // Set a key in local state.
                const key = "testKey";
                const value = "testValue";
                directory.set(key, value);

                // Load a new SharedDirectory in connected state from the summarize of the first one.
                const containerRuntimeFactory = new MockContainerRuntimeFactory();
                const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
                const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
                const services2 = MockSharedObjectServices.createFromSummary(directory.getAttachSummary().summary);
                services2.deltaConnection = containerRuntime2.createDeltaConnection();

                const directory2 = new SharedDirectory("directory2", dataStoreRuntime2, DirectoryFactory.Attributes);
                await directory2.load(services2);

                // Now connect the first SharedDirectory
                dataStoreRuntime.local = false;
                const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
                const services1 = {
                    deltaConnection: containerRuntime1.createDeltaConnection(),
                    objectStorage: new MockStorage(undefined),
                };
                directory.connect(services1);

                // Verify that both the directories have the key.
                assert.equal(directory.get(key), value, "The first directory does not have the key");
                assert.equal(directory2.get(key), value, "The second directory does not have the key");

                // Set a new value for the same key in the second SharedDirectory.
                const newValue = "newvalue";
                directory2.set(key, newValue);

                // Process the message.
                containerRuntimeFactory.processAllMessages();

                // Verify that both the directories get the new value.
                assert.equal(directory.get(key), newValue, "The first directory did not get the new value");
                assert.equal(directory2.get(key), newValue, "The second directory did not get the new value");
            });

            it("should correctly process a sub directory operation sent in local state", async () => {
                // Set the data store runtime to local.
                dataStoreRuntime.local = true;

                // Create a sub directory in local state.
                const subDirName = "testSubDir";
                directory.createSubDirectory(subDirName);

                // Load a new SharedDirectory in connected state from the summarize of the first one.
                const containerRuntimeFactory = new MockContainerRuntimeFactory();
                const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
                const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
                const services2 = MockSharedObjectServices.createFromSummary(directory.getAttachSummary().summary);
                services2.deltaConnection = containerRuntime2.createDeltaConnection();

                const directory2 = new SharedDirectory("directory2", dataStoreRuntime2, DirectoryFactory.Attributes);
                await directory2.load(services2);

                // Now connect the first SharedDirectory
                dataStoreRuntime.local = false;
                const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
                const services1 = {
                    deltaConnection: containerRuntime1.createDeltaConnection(),
                    objectStorage: new MockStorage(undefined),
                };
                directory.connect(services1);

                // Verify that both the directories have the key.
                assert.ok(directory.getSubDirectory(subDirName), "The first directory does not have sub directory");
                assert.ok(directory2.getSubDirectory(subDirName), "The second directory does not have sub directory");

                // Delete the subdirectory in the second SharedDirectory.
                directory2.deleteSubDirectory(subDirName);

                // Process the message.
                containerRuntimeFactory.processAllMessages();

                // Verify that both the directory have the sub directory deleted.
                assert.equal(
                    directory.getSubDirectory(subDirName), undefined, "The first directory did not process delete");
                assert.equal(
                    directory2.getSubDirectory(subDirName), undefined, "The second directory did not process delete");
            });
        });
    });

    describe("Connected state", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactory;
        let directory1: SharedDirectory;
        let directory2: SharedDirectory;

        beforeEach(async () => {
            containerRuntimeFactory = new MockContainerRuntimeFactory();
            // Create the first directory1.
            directory1 = createConnectedDirectory("directory1", containerRuntimeFactory);
            // Create a second directory1
            directory2 = createConnectedDirectory("directory2", containerRuntimeFactory);
        });

        describe("API", () => {
            it("Can set and get keys one level deep", () => {
                directory1.set("testKey", "testValue");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory1.get("testKey"), "testValue", "could not retrieve key");

                // Verify the remote SharedDirectory
                assert.equal(directory2.get("testKey"), "testValue", "could not retrieve key from remote directory1");
            });

            it("Can set and get keys two levels deep", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory1.getWorkingDirectory("foo")?.get("testKey"), "testValue");
                assert.equal(directory1.getWorkingDirectory("foo/")?.get("testKey2"), "testValue2");
                assert.equal(directory1.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");

                // Verify the remote SharedDirectory
                assert.equal(directory2.getWorkingDirectory("foo")?.get("testKey"), "testValue");
                assert.equal(directory2.getWorkingDirectory("foo/")?.get("testKey2"), "testValue2");
                assert.equal(directory2.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
            });

            it("Can clear keys stored directly under the root", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                directory1.set("testKey", "testValue4");
                directory1.set("testKey2", "testValue5");
                directory1.clear();

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory1.getWorkingDirectory("/foo/")?.get("testKey"), "testValue");
                assert.equal(directory1.getWorkingDirectory("./foo")?.get("testKey2"), "testValue2");
                assert.equal(directory1.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
                assert.equal(directory1.get("testKey"), undefined);
                assert.equal(directory1.get("testKey2"), undefined);

                // Verify the remote SharedDirectory
                assert.equal(directory2.getWorkingDirectory("/foo/")?.get("testKey"), "testValue");
                assert.equal(directory2.getWorkingDirectory("./foo")?.get("testKey2"), "testValue2");
                assert.equal(directory2.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
                assert.equal(directory2.get("testKey"), undefined);
                assert.equal(directory2.get("testKey2"), undefined);
            });

            it("Can delete keys from the root", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                directory1.set("testKey", "testValue4");
                directory1.set("testKey2", "testValue5");
                directory1.delete("testKey2");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory1.getWorkingDirectory("foo")?.get("testKey"), "testValue");
                assert.equal(directory1.getWorkingDirectory("foo")?.get("testKey2"), "testValue2");
                assert.equal(directory1.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
                assert.equal(directory1.get("testKey"), "testValue4");
                assert.equal(directory1.get("testKey2"), undefined);

                // Verify the remote SharedDirectory
                assert.equal(directory2.getWorkingDirectory("foo")?.get("testKey"), "testValue");
                assert.equal(directory2.getWorkingDirectory("foo")?.get("testKey2"), "testValue2");
                assert.equal(directory2.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
                assert.equal(directory2.get("testKey"), "testValue4");
                assert.equal(directory2.get("testKey2"), undefined);
            });
        });

        describe("SubDirectory", () => {
            it("Can iterate over the subdirectories in the root", () => {
                directory1.createSubDirectory("foo");
                directory1.createSubDirectory("bar");

                containerRuntimeFactory.processAllMessages();

                const expectedDirectories = new Set(["foo", "bar"]);

                // Verify the local SharedDirectory
                for (const [subDirName] of directory1.subdirectories()) {
                    assert.ok(expectedDirectories.has(subDirName));
                }

                // Verify the remote SharedDirectory
                for (const [subDirName] of directory2.subdirectories()) {
                    assert.ok(expectedDirectories.has(subDirName));
                    expectedDirectories.delete(subDirName);
                }
                assert.ok(expectedDirectories.size === 0);
            });

            it("Can get a subdirectory", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.ok(directory1.getWorkingDirectory("/foo"));
                assert.ok(directory1.getSubDirectory("foo"));

                // Verify the remote SharedDirectory
                assert.ok(directory2.getWorkingDirectory("/foo"));
                assert.ok(directory2.getSubDirectory("foo"));
            });

            it("Knows its absolute path", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = fooDirectory.createSubDirectory("bar");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(fooDirectory.absolutePath, "/foo");
                assert.equal(barDirectory.absolutePath, "/foo/bar");

                // Verify the remote SharedDirectory
                const fooDirectory2 = directory2.getSubDirectory("foo");
                assert(fooDirectory2);
                const barDirectory2 = fooDirectory2.getSubDirectory("bar");
                assert(barDirectory2);
                assert.equal(fooDirectory2.absolutePath, "/foo");
                assert.equal(barDirectory2.absolutePath, "/foo/bar");
            });

            it("Can get and set keys from a subdirectory using relative paths", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const testSubdir = directory1.getWorkingDirectory("/foo");
                assert(testSubdir);
                assert.equal(testSubdir.has("testKey"), true);
                assert.equal(testSubdir.has("garbage"), false);
                assert.equal(testSubdir.get("testKey"), "testValue");
                assert.equal(testSubdir.get("testKey2"), "testValue2");
                assert.equal(testSubdir.get("testKey3"), undefined);

                // Verify the remote SharedDirectory
                const barSubDir = directory2.getWorkingDirectory("/foo");
                assert(barSubDir);
                assert.equal(barSubDir.has("testKey"), true);
                assert.equal(barSubDir.has("garbage"), false);
                assert.equal(barSubDir.get("testKey"), "testValue");
                assert.equal(barSubDir.get("testKey2"), "testValue2");
                assert.equal(barSubDir.get("testKey3"), undefined);

                // Set value in sub directory1.
                testSubdir.set("fromSubdir", "testValue4");

                containerRuntimeFactory.processAllMessages();

                // Verify the local sub directory1
                assert.equal(directory1.getWorkingDirectory("foo")?.get("fromSubdir"), "testValue4");

                // Verify the remote sub directory1
                assert.equal(directory2.getWorkingDirectory("foo")?.get("fromSubdir"), "testValue4");
            });

            it("raises the containedValueChanged event when keys are set and deleted from a subdirectory", () => {
                directory1.createSubDirectory("foo");
                directory1.createSubDirectory("bar");
                containerRuntimeFactory.processAllMessages();

                const foo1 = directory1.getWorkingDirectory("/foo");
                assert(foo1);
                const foo2 = directory2.getWorkingDirectory("/foo");
                assert(foo2);
                const bar1 = directory1.getWorkingDirectory("/bar");
                assert(bar1);
                const bar2 = directory2.getWorkingDirectory("/bar");
                assert(bar2);

                let called1 = 0;
                let called2 = 0;
                let called3 = 0;
                let called4 = 0;
                foo1.on("containedValueChanged", () => called1++);
                foo2.on("containedValueChanged", () => called2++);
                bar1.on("containedValueChanged", () => called3++);
                bar2.on("containedValueChanged", () => called4++);

                foo1.set("testKey", "testValue");
                containerRuntimeFactory.processAllMessages();

                assert.strictEqual(called1, 1, "containedValueChanged on local foo subdirectory after set()");
                assert.strictEqual(called2, 1, "containedValueChanged on remote foo subdirectory after set()");
                assert.strictEqual(called3, 0, "containedValueChanged on local bar subdirectory after set()");
                assert.strictEqual(called4, 0, "containedValueChanged on remote bar subdirectory after set()");

                foo1.delete("testKey");
                containerRuntimeFactory.processAllMessages();

                assert.strictEqual(called1, 2, "containedValueChanged on local subdirectory after delete()");
                assert.strictEqual(called2, 2, "containedValueChanged on remote subdirectory after delete()");
                assert.strictEqual(called3, 0, "containedValueChanged on local bar subdirectory after delete()");
                assert.strictEqual(called4, 0, "containedValueChanged on remote bar subdirectory after delete()");
            });

            it("Can be cleared from the subdirectory", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                directory1.set("testKey", "testValue4");
                directory1.set("testKey2", "testValue5");
                const testSubdir = directory1.getWorkingDirectory("/foo");
                assert(testSubdir);
                testSubdir.clear();

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const fooSubDirectory1 = directory1.getWorkingDirectory("foo");
                assert(fooSubDirectory1);
                assert.equal(fooSubDirectory1.get("testKey"), undefined);
                assert.equal(fooSubDirectory1.get("testKey2"), undefined);
                assert.equal(directory1.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
                assert.equal(directory1.getWorkingDirectory("..")?.get("testKey"), "testValue4");
                assert.equal(directory1.getWorkingDirectory(".")?.get("testKey2"), "testValue5");

                // Verify the remote SharedDirectory
                const fooSubDirectory2 = directory2.getWorkingDirectory("foo");
                assert(fooSubDirectory2);
                assert.equal(fooSubDirectory2.get("testKey"), undefined);
                assert.equal(fooSubDirectory2.get("testKey2"), undefined);
                assert.equal(directory2.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
                assert.equal(directory2.getWorkingDirectory("..")?.get("testKey"), "testValue4");
                assert.equal(directory2.getWorkingDirectory(".")?.get("testKey2"), "testValue5");
            });

            it("Can delete keys from the subdirectory", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                directory1.set("testKey", "testValue4");
                directory1.set("testKey2", "testValue5");
                const testSubdirFoo = directory1.getWorkingDirectory("/foo");
                assert(testSubdirFoo);
                testSubdirFoo.delete("testKey2");
                const testSubdirBar = directory1.getWorkingDirectory("/bar");
                assert(testSubdirBar);
                testSubdirBar.delete("testKey3");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const fooSubDirectory1 = directory1.getWorkingDirectory("foo");
                assert(fooSubDirectory1);
                const barSubDirectory1 = directory1.getWorkingDirectory("bar");
                assert(barSubDirectory1);
                assert.equal(fooSubDirectory1.get("testKey"), "testValue");
                assert.equal(fooSubDirectory1.get("testKey2"), undefined);
                assert.equal(barSubDirectory1.get("testKey3"), undefined);
                assert.equal(directory1.get("testKey"), "testValue4");
                assert.equal(directory1.get("testKey2"), "testValue5");

                // Verify the remote SharedDirectory
                const fooSubDirectory2 = directory2.getWorkingDirectory("foo");
                assert(fooSubDirectory2);
                const barSubDirectory2 = directory2.getWorkingDirectory("bar");
                assert(barSubDirectory2);
                assert.equal(fooSubDirectory2.get("testKey"), "testValue");
                assert.equal(fooSubDirectory2.get("testKey2"), undefined);
                assert.equal(barSubDirectory2.get("testKey3"), undefined);
                assert.equal(directory2.get("testKey"), "testValue4");
                assert.equal(directory2.get("testKey2"), "testValue5");
            });

            it("Knows the size of the subdirectory", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                directory1.set("testKey", "testValue4");
                directory1.set("testKey2", "testValue5");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const testSubdirFoo = directory1.getWorkingDirectory("/foo");
                assert(testSubdirFoo);
                assert.equal(testSubdirFoo.size, 2);
                // Verify the remote SharedDirectory
                const testSubdirFoo2 = directory2.getWorkingDirectory("/foo");
                assert(testSubdirFoo2);
                assert.equal(testSubdirFoo2.size, 2);

                testSubdirFoo.delete("testKey2");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(testSubdirFoo.size, 1);
                // Verify the remote SharedDirectory
                assert.equal(testSubdirFoo2.size, 1);

                directory1.delete("testKey");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(testSubdirFoo.size, 1);
                // Verify the remote SharedDirectory
                assert.equal(testSubdirFoo2.size, 1);

                const testSubdirBar = directory1.getWorkingDirectory("/bar");
                assert(testSubdirBar);
                testSubdirBar.delete("testKey3");

                // Verify the local SharedDirectory
                assert.equal(testSubdirFoo.size, 1);
                // Verify the remote SharedDirectory
                assert.equal(testSubdirFoo2.size, 1);

                directory1.clear();

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(testSubdirFoo.size, 1);
                // Verify the remote SharedDirectory
                assert.equal(testSubdirFoo2.size, 1);

                testSubdirFoo.clear();

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(testSubdirFoo.size, 0);
                // Verify the remote SharedDirectory
                assert.equal(testSubdirFoo2.size, 0);
            });

            it("Can get a subdirectory from a subdirectory", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const barSubdir = directory1.getWorkingDirectory("/bar");
                assert.ok(barSubdir);
                const bazSubDir = barSubdir.getWorkingDirectory("./baz");
                assert.ok(bazSubDir);
                assert.equal(bazSubDir.get("testKey4"), "testValue4");

                // Verify the remote SharedDirectory
                const barSubdir2 = directory2.getWorkingDirectory("/bar");
                assert.ok(barSubdir2);
                const bazSubDir2 = barSubdir2.getWorkingDirectory("./baz");
                assert.ok(bazSubDir2);
                assert.equal(bazSubDir2.get("testKey4"), "testValue4");
            });

            it("Can delete a child subdirectory", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");
                barDirectory.deleteSubDirectory("baz");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(barDirectory.getWorkingDirectory("baz"), undefined);

                // Verify the remote SharedDirectory
                const barDirectory2 = directory2.getSubDirectory("bar");
                assert(barDirectory2);
                assert.equal(barDirectory2.getWorkingDirectory("baz"), undefined);
            });

            it("Can delete a child subdirectory with children", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");
                directory1.deleteSubDirectory("bar");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory1.getWorkingDirectory("bar"), undefined);

                // Verify the remote SharedDirectory
                assert.equal(directory2.getWorkingDirectory("bar"), undefined);
            });

            it("Can get and use a keys iterator", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const fooSubDir = directory1.getWorkingDirectory("/foo");
                assert(fooSubDir);
                const fooSubDirIterator = fooSubDir.keys();
                const fooSubDirResult1 = fooSubDirIterator.next();
                assert.equal(fooSubDirResult1.value, "testKey");
                assert.equal(fooSubDirResult1.done, false);
                const fooSubDirResult2 = fooSubDirIterator.next();
                assert.equal(fooSubDirResult2.value, "testKey2");
                assert.equal(fooSubDirResult2.done, false);
                const fooSubDirResult3 = fooSubDirIterator.next();
                assert.equal(fooSubDirResult3.value, undefined);
                assert.equal(fooSubDirResult3.done, true);

                const barSubDir = directory1.getWorkingDirectory("/bar");
                assert(barSubDir);
                const barSubDirIterator = barSubDir.keys();
                const barSubDirResult1 = barSubDirIterator.next();
                assert.equal(barSubDirResult1.value, "testKey3");
                assert.equal(barSubDirResult1.done, false);
                const barSubDirResult2 = barSubDirIterator.next();
                assert.equal(barSubDirResult2.value, undefined);
                assert.equal(barSubDirResult2.done, true);

                // Verify the remote SharedDirectory
                const fooSubDir2 = directory2.getWorkingDirectory("/foo");
                assert(fooSubDir2);
                const fooSubDir2Iterator = fooSubDir2.keys();
                const fooSubDir2Result1 = fooSubDir2Iterator.next();
                assert.equal(fooSubDir2Result1.value, "testKey");
                assert.equal(fooSubDir2Result1.done, false);
                const fooSubDir2Result2 = fooSubDir2Iterator.next();
                assert.equal(fooSubDir2Result2.value, "testKey2");
                assert.equal(fooSubDir2Result2.done, false);
                const fooSubDir2Result3 = fooSubDir2Iterator.next();
                assert.equal(fooSubDir2Result3.value, undefined);
                assert.equal(fooSubDir2Result3.done, true);

                const barSubDir2 = directory2.getWorkingDirectory("/bar");
                assert(barSubDir2);
                const barSubDir2Iterator = barSubDir2.keys();
                const barSubDir2Result1 = barSubDir2Iterator.next();
                assert.equal(barSubDir2Result1.value, "testKey3");
                assert.equal(barSubDir2Result1.done, false);
                const barSubDir2Result2 = barSubDir2Iterator.next();
                assert.equal(barSubDir2Result2.value, undefined);
                assert.equal(barSubDir2Result2.done, true);
            });

            it("Can get and use a values iterator", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const fooSubDir = directory1.getWorkingDirectory("/foo");
                assert(fooSubDir);
                const fooSubDirIterator = fooSubDir.values();
                const fooSubDirResult1 = fooSubDirIterator.next();
                assert.equal(fooSubDirResult1.value, "testValue");
                assert.equal(fooSubDirResult1.done, false);
                const fooSubDirResult2 = fooSubDirIterator.next();
                assert.equal(fooSubDirResult2.value, "testValue2");
                assert.equal(fooSubDirResult2.done, false);
                const fooSubDirResult3 = fooSubDirIterator.next();
                assert.equal(fooSubDirResult3.value, undefined);
                assert.equal(fooSubDirResult3.done, true);

                const barSubDir = directory1.getWorkingDirectory("/bar");
                assert(barSubDir);
                const barSubDirIterator = barSubDir.values();
                const barSubDirResult1 = barSubDirIterator.next();
                assert.equal(barSubDirResult1.value, "testValue3");
                assert.equal(barSubDirResult1.done, false);
                const barSubDirResult2 = barSubDirIterator.next();
                assert.equal(barSubDirResult2.value, undefined);
                assert.equal(barSubDirResult2.done, true);

                // Verify the remote SharedDirectory
                const fooSubDir2 = directory2.getWorkingDirectory("/foo");
                assert(fooSubDir2);
                const fooSubDir2Iterator = fooSubDir2.values();
                const fooSubDir2Result1 = fooSubDir2Iterator.next();
                assert.equal(fooSubDir2Result1.value, "testValue");
                assert.equal(fooSubDir2Result1.done, false);
                const fooSubDir2Result2 = fooSubDir2Iterator.next();
                assert.equal(fooSubDir2Result2.value, "testValue2");
                assert.equal(fooSubDir2Result2.done, false);
                const fooSubDir2Result3 = fooSubDir2Iterator.next();
                assert.equal(fooSubDir2Result3.value, undefined);
                assert.equal(fooSubDir2Result3.done, true);

                const barSubDir2 = directory2.getWorkingDirectory("/bar");
                assert(barSubDir2);
                const barSubDir2Iterator = barSubDir2.values();
                const barSubDir2Result1 = barSubDir2Iterator.next();
                assert.equal(barSubDir2Result1.value, "testValue3");
                assert.equal(barSubDir2Result1.done, false);
                const barSubDir2Result2 = barSubDir2Iterator.next();
                assert.equal(barSubDir2Result2.value, undefined);
                assert.equal(barSubDir2Result2.done, true);
            });

            it("Can get and use an entries iterator", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                const barDirectory = directory1.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const fooSubDir = directory1.getWorkingDirectory("/foo");
                assert(fooSubDir);
                const fooSubDirIterator = fooSubDir.entries();
                const fooSubDirResult1 = fooSubDirIterator.next();
                assert.equal(fooSubDirResult1.value[0], "testKey");
                assert.equal(fooSubDirResult1.value[1], "testValue");
                assert.equal(fooSubDirResult1.done, false);
                const fooSubDirResult2 = fooSubDirIterator.next();
                assert.equal(fooSubDirResult2.value[0], "testKey2");
                assert.equal(fooSubDirResult2.value[1], "testValue2");
                assert.equal(fooSubDirResult2.done, false);
                const fooSubDirResult3 = fooSubDirIterator.next();
                assert.equal(fooSubDirResult3.value, undefined);
                assert.equal(fooSubDirResult3.done, true);

                const barSubDir = directory1.getWorkingDirectory("/bar");
                assert(barSubDir);

                const expectedEntries = new Set(["testKey3"]);
                for (const entry of barSubDir) {
                    assert.ok(expectedEntries.has(entry[0]));
                    expectedEntries.delete(entry[0]);
                }
                assert.ok(expectedEntries.size === 0);

                // Verify the remote SharedDirectory
                const fooSubDir2 = directory2.getWorkingDirectory("/foo");
                assert(fooSubDir2);
                const fooSubDir2Iterator = fooSubDir2.entries();
                const fooSubDir2Result1 = fooSubDir2Iterator.next();
                assert.equal(fooSubDir2Result1.value[0], "testKey");
                assert.equal(fooSubDir2Result1.value[1], "testValue");
                assert.equal(fooSubDir2Result1.done, false);
                const fooSubDir2Result2 = fooSubDir2Iterator.next();
                assert.equal(fooSubDir2Result2.value[0], "testKey2");
                assert.equal(fooSubDir2Result2.value[1], "testValue2");
                assert.equal(fooSubDir2Result2.done, false);
                const fooSubDir2Result3 = fooSubDir2Iterator.next();
                assert.equal(fooSubDir2Result3.value, undefined);
                assert.equal(fooSubDir2Result3.done, true);

                const barSubDir2 = directory2.getWorkingDirectory("/bar");
                assert(barSubDir2);

                const expectedEntries2 = new Set(["testKey3"]);
                for (const entry of barSubDir2) {
                    assert.ok(expectedEntries2.has(entry[0]));
                    expectedEntries2.delete(entry[0]);
                }
                assert.ok(expectedEntries2.size === 0);
            });

            it("Can iterate over its subdirectories", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                fooDirectory.createSubDirectory("bar");
                fooDirectory.createSubDirectory("baz");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const expectedDirectories = new Set(["bar", "baz"]);
                for (const [subDirName] of fooDirectory.subdirectories()) {
                    assert.ok(expectedDirectories.has(subDirName));
                    expectedDirectories.delete(subDirName);
                }
                assert.ok(expectedDirectories.size === 0);

                // Verify the remote SharedDirectory
                const fooDirectory2 = directory2.getSubDirectory("foo");
                assert(fooDirectory2);
                const expectedDirectories2 = new Set(["bar", "baz"]);
                for (const [subDirName] of fooDirectory2.subdirectories()) {
                    assert.ok(expectedDirectories2.has(subDirName));
                    expectedDirectories2.delete(subDirName);
                }
                assert.ok(expectedDirectories2.size === 0);
            });

            it("Only creates a subdirectory once", () => {
                const fooDirectory = directory1.createSubDirectory("foo");
                fooDirectory.set("testKey", "testValue");
                const fooDirectory2 = directory1.createSubDirectory("foo");
                fooDirectory2.set("testKey2", "testValue2");
                assert.strictEqual(fooDirectory, fooDirectory2, "Created two separate subdirectories");
                assert.strictEqual(fooDirectory.get("testKey2"), "testValue2", "Value 2 not present");
                assert.strictEqual(fooDirectory2.get("testKey"), "testValue", "Value 1 not present");
            });
        });
    });

    describe("Garbage Collection", () => {
        class GCSharedDirectoryProvider implements IGCTestProvider {
            private subMapCount = 0;
            private _expectedRoutes: string[] = [];
            private readonly directory1: SharedDirectory;
            private readonly directory2: SharedDirectory;
            private readonly containerRuntimeFactory: MockContainerRuntimeFactory;

            constructor() {
                this.containerRuntimeFactory = new MockContainerRuntimeFactory();
                this.directory1 = createConnectedDirectory("directory1", this.containerRuntimeFactory);
                this.directory2 = createConnectedDirectory("directory2", this.containerRuntimeFactory);
            }

            public get sharedObject() {
                // Return the remote SharedDirectory because we want to verify its summary data.
                return this.directory2;
            }

            public get expectedOutboundRoutes() {
                return this._expectedRoutes;
            }

            public async addOutboundRoutes() {
                const subMapId1 = `subMap-${++this.subMapCount}`;
                const subMap1 = createLocalMap(subMapId1);
                this.directory1.set(subMapId1, subMap1.handle);
                this._expectedRoutes.push(subMap1.handle.absolutePath);

                const fooDirectory =
                    this.directory1.getSubDirectory("foo") ?? this.directory1.createSubDirectory("foo");
                const subMapId2 = `subMap-${++this.subMapCount}`;
                const subMap2 = createLocalMap(subMapId2);
                fooDirectory.set(subMapId2, subMap2.handle);
                this._expectedRoutes.push(subMap2.handle.absolutePath);

                this.containerRuntimeFactory.processAllMessages();
            }

            public async deleteOutboundRoutes() {
                // Delete the last handle that was added.
                const fooDirectory = this.directory1.getSubDirectory("foo");
                assert(fooDirectory, "Route must be added before deleting");

                const subMapId = `subMap-${this.subMapCount}`;
                const deletedHandle = fooDirectory.get(subMapId);
                assert(deletedHandle, "Route must be added before deleting");

                fooDirectory.delete(subMapId);
                // Remove deleted handle's route from expected routes.
                this._expectedRoutes = this._expectedRoutes.filter((route) => route !== deletedHandle.absolutePath);

                this.containerRuntimeFactory.processAllMessages();
            }

            public async addNestedHandles() {
                const fooDirectory =
                    this.directory1.getSubDirectory("foo") ?? this.directory1.createSubDirectory("foo");
                const subMapId1 = `subMap-${++this.subMapCount}`;
                const subMapId2 = `subMap-${++this.subMapCount}`;
                const subMap = createLocalMap(subMapId1);
                const subMap2 = createLocalMap(subMapId2);
                const containingObject = {
                    subMapHandle: subMap.handle,
                    nestedObj: {
                        subMap2Handle: subMap2.handle,
                    },
                };
                fooDirectory.set(subMapId2, containingObject);
                this.containerRuntimeFactory.processAllMessages();
                this._expectedRoutes.push(subMap.handle.absolutePath, subMap2.handle.absolutePath);
            }
        }

        runGCTests(GCSharedDirectoryProvider);
    });
});
