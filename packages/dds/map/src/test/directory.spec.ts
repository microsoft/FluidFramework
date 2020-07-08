/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:no-console

import assert from "assert";
import {
    IBlob,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    MockComponentRuntime,
    MockContainerRuntimeFactory,
    MockSharedObjectServices,
    MockStorage,
} from "@fluidframework/test-runtime-utils";

import { DirectoryFactory, IDirectoryNewStorageFormat, SharedDirectory } from "../directory";
import { MapFactory } from "../map";

async function populate(directory: SharedDirectory, content: object) {
    const storage = new MockSharedObjectServices({
        header: JSON.stringify(content),
    });
    return directory.load("branchId", storage);
}

function serialize(directory: SharedDirectory): string {
    const tree = directory.snapshot();
    assert(tree.entries.length === 1);
    assert(tree.entries[0].path === "header");
    assert(tree.entries[0].type === TreeEntry[TreeEntry.Blob]);
    const contents = (tree.entries[0].value as IBlob).contents;
    return JSON.stringify((JSON.parse(contents) as IDirectoryNewStorageFormat).content);
}

describe("Directory", () => {
    let directory: SharedDirectory;
    let mapFactory: MapFactory;
    let componentRuntime: MockComponentRuntime;

    beforeEach(async () => {
        componentRuntime = new MockComponentRuntime();
        mapFactory = new MapFactory();
        directory = new SharedDirectory("directory", componentRuntime, DirectoryFactory.Attributes);
    });

    describe("SharedDirectory in local state", () => {
        beforeEach(() => {
            componentRuntime.local = true;
        });

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
            const dummyDirectory = directory;
            let called1: boolean = false;
            let called2: boolean = false;
            dummyDirectory.on("op", (agr1, arg2, arg3) => called1 = true);
            dummyDirectory.on("valueChanged", (agr1, arg2, arg3, arg4) => called2 = true);
            dummyDirectory.set("dwyane", "johnson");
            assert.equal(called1, false, "did not receive op event");
            assert.equal(called2, true, "did not receive valueChanged event");
        });

        it("Rejects a undefined and null key set", () => {
            assert.throws(() => {
                directory.set(undefined, "testValue");
            }, "Should throw for key of undefined");
            assert.throws(() => {
                directory.set(null, "testValue");
            }, "Should throw for key of null");
        });

        it("Rejects subdirectories with undefined and null names", () => {
            assert.throws(() => {
                directory.createSubDirectory(undefined);
            }, "Should throw for undefined subdirectory name");
            assert.throws(() => {
                directory.createSubDirectory(null);
            }, "Should throw for null subdirectory name");
        });

        describe(".serialize", () => {
            it("Should serialize an empty directory as a JSON object", () => {
                const serialized = serialize(directory);
                assert.equal(serialized, "{}");
            });

            it("Should serialize a directory without subdirectories as a JSON object", () => {
                directory.set("first", "second");
                directory.set("third", "fourth");
                directory.set("fifth", "sixth");
                const subMap = mapFactory.create(componentRuntime, "subMap");
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
                const subMap = mapFactory.create(componentRuntime, "subMap");
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
                const subMap = mapFactory.create(componentRuntime, "subMap");
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

        describe(".populate", () => {
            it("Should populate the directory from an empty JSON object (old format)", async () => {
                await populate(directory, {});
                assert.equal(directory.size, 0, "Failed to initialize to empty directory storage");
                directory.set("testKey", "testValue");
                assert.equal(directory.get("testKey"), "testValue", "Failed to set testKey");
                directory.createSubDirectory("testSubDir").set("testSubKey", "testSubValue");
                assert.equal(
                    directory.getWorkingDirectory("testSubDir").get("testSubKey"),
                    "testSubValue",
                    "Failed to set testSubKey",
                );
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
                assert.equal(directory.getWorkingDirectory("/foo").get("testKey"), "testValue");
                assert.equal(directory.getWorkingDirectory("foo").get("testKey2"), "testValue2");
                assert.equal(directory.getWorkingDirectory("/bar").get("testKey3"), "testValue3");
                assert.equal(directory.getWorkingDirectory("").get("testKey"), "testValue4");
                assert.equal(directory.getWorkingDirectory("/").get("testKey2"), "testValue5");
                directory.set("testKey", "newValue");
                assert.equal(directory.get("testKey"), "newValue", "Failed to set testKey");
                directory.createSubDirectory("testSubDir").set("testSubKey", "newSubValue");
                assert.equal(
                    directory.getWorkingDirectory("testSubDir").get("testSubKey"),
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
                assert.equal(directory.getWorkingDirectory("/foo").get("testKey"), "testValue");
                assert.equal(directory.getWorkingDirectory("foo").get("testKey2"), undefined);
                assert.equal(directory.getWorkingDirectory("/bar").get("testKey3"), "testValue3");
                assert.equal(directory.getWorkingDirectory("").get("testKey"), "testValue4");
                assert.equal(directory.getWorkingDirectory("/").get("testKey2"), undefined);
                assert.ok(directory.has("testKey2"));
                assert.ok(directory.getWorkingDirectory("/foo").has("testKey2"));
                directory.set("testKey", "newValue");
                assert.equal(directory.get("testKey"), "newValue", "Failed to set testKey");
                directory.createSubDirectory("testSubDir").set("testSubKey", "newSubValue");
                assert.equal(
                    directory.getWorkingDirectory("testSubDir").get("testSubKey"),
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

                const tree = directory.snapshot();
                assert(tree.entries.length === 3);
                assert(tree.entries[0].path === "blob0");
                assert(tree.entries[1].path === "blob1");
                assert(tree.entries[2].path === "header");
                assert((tree.entries[0].value as IBlob).contents.length >= 1024);
                assert((tree.entries[1].value as IBlob).contents.length >= 1024);
                assert((tree.entries[2].value as IBlob).contents.length <= 200);

                const directory2 = new SharedDirectory("test", componentRuntime, DirectoryFactory.Attributes);
                const storage = MockSharedObjectServices.createFromTree(tree);
                await directory2.load("branchId", storage);

                assert.equal(directory2.get("first"), "second");
                assert.equal(directory2.get("long1"), longWord);
                assert.equal(directory2.getWorkingDirectory("/nested").get("deepKey1"), "deepValue1");
                assert.equal(directory2.getWorkingDirectory("/nested").get("long2"), logWord2);
            });
        });
    });

    describe("SharedDirectory op processing in local state", () => {
        /**
         * These tests test the scenario found in the following bug:
         * https://github.com/microsoft/FluidFramework/issues/2400
         *
         * - A SharedDirectory in local state performs a set or directory operation.
         * - A second SharedDirectory is then created from the snapshot of the first one.
         * - The second SharedDirectory performs the same operation as the first one but with a different value.
         * - The expected behavior is that the first SharedDirectory updates the key with the new value. But in the
         *   bug, the first SharedDirectory stores the key in its pending state even though it does not send out an
         *   an op. So when it gets a remote op with the same key, it ignores it as it has a pending op with the
         *   same key.
         */
        it("should correctly process a set operation sent in local state", async () => {
            // Set the component runtime to local.
            componentRuntime.local = true;

            // Set a key in local state.
            const key = "testKey";
            const value = "testValue";
            directory.set(key, value);

            // Load a new SharedDirectory in connected state from the snapshot of the first one.
            const containerRuntimeFactory = new MockContainerRuntimeFactory();
            const componentRuntime2 = new MockComponentRuntime();
            const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(componentRuntime2);
            const services2 = MockSharedObjectServices.createFromTree(directory.snapshot());
            services2.deltaConnection = containerRuntime2.createDeltaConnection();

            const directory2 = new SharedDirectory("directory2", componentRuntime2, DirectoryFactory.Attributes);
            await directory2.load("branchId", services2);

            // Now connect the first SharedDirectory
            componentRuntime.local = false;
            const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(componentRuntime);
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
            // Set the component runtime to local.
            componentRuntime.local = true;

            // Create a sub directory in local state.
            const subDirName = "testSubDir";
            directory.createSubDirectory(subDirName);

            // Load a new SharedDirectory in connected state from the snapshot of the first one.
            const containerRuntimeFactory = new MockContainerRuntimeFactory();
            const componentRuntime2 = new MockComponentRuntime();
            const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(componentRuntime2);
            const services2 = MockSharedObjectServices.createFromTree(directory.snapshot());
            services2.deltaConnection = containerRuntime2.createDeltaConnection();

            const directory2 = new SharedDirectory("directory2", componentRuntime2, DirectoryFactory.Attributes);
            await directory2.load("branchId", services2);

            // Now connect the first SharedDirectory
            componentRuntime.local = false;
            const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(componentRuntime);
            const services1 = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(undefined),
            };
            directory.connect(services1);

            // Verify that both the directories have the key.
            assert.ok(directory.getSubDirectory(subDirName), "The first directory does not have the sub directory");
            assert.ok(directory2.getSubDirectory(subDirName), "The second directory does not have the sub directory");

            // Delete the subdirectory in the second SharedDirectory.
            directory2.deleteSubDirectory(subDirName);

            // Process the message.
            containerRuntimeFactory.processAllMessages();

            // Verify that both the directory have the sub directory deleted.
            assert.equal(
                directory.getSubDirectory(subDirName), undefined, "The first directory did not process the delete");
            assert.equal(
                directory2.getSubDirectory(subDirName), undefined, "The second directory did not process the delete");
        });
    });

    describe("SharedDirectory in connected state with a remote SharedDirectory", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactory;
        let directory2: SharedDirectory;

        beforeEach(async () => {
            // Connect the first directory
            containerRuntimeFactory = new MockContainerRuntimeFactory();
            const containerRuntime = containerRuntimeFactory.createContainerRuntime(componentRuntime);
            const services = {
                deltaConnection: containerRuntime.createDeltaConnection(),
                objectStorage: new MockStorage(undefined),
            };
            directory.connect(services);

            // Create and connect a second directory
            const componentRuntime2 = new MockComponentRuntime();
            directory2 = new SharedDirectory("directory2", componentRuntime2, DirectoryFactory.Attributes);
            const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(componentRuntime2);
            const services2 = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(undefined),
            };
            directory2.connect(services2);
        });

        describe(".set() / .get()", () => {
            it("Can set and get keys one level deep", () => {
                directory.set("testKey", "testValue");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory.get("testKey"), "testValue", "could not retrieve key");

                // Verify the remote SharedDirectory
                assert.equal(directory2.get("testKey"), "testValue", "could not retrieve key from remote directory");
            });

            it("Can set and get keys two levels deep", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory.getWorkingDirectory("foo").get("testKey"), "testValue");
                assert.equal(directory.getWorkingDirectory("foo/").get("testKey2"), "testValue2");
                assert.equal(directory.getWorkingDirectory("bar").get("testKey3"), "testValue3");

                // Verify the remote SharedDirectory
                assert.equal(directory2.getWorkingDirectory("foo").get("testKey"), "testValue");
                assert.equal(directory2.getWorkingDirectory("foo/").get("testKey2"), "testValue2");
                assert.equal(directory2.getWorkingDirectory("bar").get("testKey3"), "testValue3");
            });
        });

        describe(".delete() / .clear()", () => {
            it("Can clear keys stored directly under the root", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                directory.set("testKey", "testValue4");
                directory.set("testKey2", "testValue5");
                directory.clear();

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory.getWorkingDirectory("/foo/").get("testKey"), "testValue");
                assert.equal(directory.getWorkingDirectory("./foo").get("testKey2"), "testValue2");
                assert.equal(directory.getWorkingDirectory("bar").get("testKey3"), "testValue3");
                assert.equal(directory.get("testKey"), undefined);
                assert.equal(directory.get("testKey2"), undefined);

                // Verify the remote SharedDirectory
                assert.equal(directory2.getWorkingDirectory("/foo/").get("testKey"), "testValue");
                assert.equal(directory2.getWorkingDirectory("./foo").get("testKey2"), "testValue2");
                assert.equal(directory2.getWorkingDirectory("bar").get("testKey3"), "testValue3");
                assert.equal(directory2.get("testKey"), undefined);
                assert.equal(directory2.get("testKey2"), undefined);
            });

            it("Can delete keys from the root", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                directory.set("testKey", "testValue4");
                directory.set("testKey2", "testValue5");
                directory.delete("testKey2");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory.getWorkingDirectory("foo").get("testKey"), "testValue");
                assert.equal(directory.getWorkingDirectory("foo").get("testKey2"), "testValue2");
                assert.equal(directory.getWorkingDirectory("bar").get("testKey3"), "testValue3");
                assert.equal(directory.get("testKey"), "testValue4");
                assert.equal(directory.get("testKey2"), undefined);

                // Verify the remote SharedDirectory
                assert.equal(directory2.getWorkingDirectory("foo").get("testKey"), "testValue");
                assert.equal(directory2.getWorkingDirectory("foo").get("testKey2"), "testValue2");
                assert.equal(directory2.getWorkingDirectory("bar").get("testKey3"), "testValue3");
                assert.equal(directory2.get("testKey"), "testValue4");
                assert.equal(directory2.get("testKey2"), undefined);
            });
        });

        describe(".wait()", () => {
            it("Should resolve returned promise for existing keys", async () => {
                directory.set("test", "resolved");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.ok(directory.has("test"));
                await directory.wait("test");

                // Verify the remote SharedDirectory
                assert.ok(directory2.has("test"));
                await directory2.wait("test");
            });

            it("Should resolve returned promise once unavailable key is available", async () => {
                assert.ok(!directory.has("test"));

                const waitP = directory.wait("test");
                const waitP2 = directory2.wait("test");

                directory.set("test", "resolved");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                await waitP;

                // Verify the remote SharedDirectory
                await waitP2;
            });
        });

        describe("SubDirectory", () => {
            it("Can iterate over the subdirectories in the root", () => {
                directory.createSubDirectory("foo");
                directory.createSubDirectory("bar");

                containerRuntimeFactory.processAllMessages();

                const expectedDirectories = new Set(["foo", "bar"]);

                // Verify the local SharedDirectory
                for (const [subDirName] of directory.subdirectories()) {
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
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.ok(directory.getWorkingDirectory("/foo"));
                assert.ok(directory.getSubDirectory("foo"));

                // Verify the remote SharedDirectory
                assert.ok(directory2.getWorkingDirectory("/foo"));
                assert.ok(directory2.getSubDirectory("foo"));
            });

            it("Knows its absolute path", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = fooDirectory.createSubDirectory("bar");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(fooDirectory.absolutePath, "/foo");
                assert.equal(barDirectory.absolutePath, "/foo/bar");

                // Verify the remote SharedDirectory
                const fooDirectory2 = directory2.getSubDirectory("foo");
                const barDirectory2 = fooDirectory2.getSubDirectory("bar");
                assert.equal(fooDirectory2.absolutePath, "/foo");
                assert.equal(barDirectory2.absolutePath, "/foo/bar");
            });

            it("Can get and set keys from a subdirectory using relative paths", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const testSubdir = directory.getWorkingDirectory("/foo");
                assert.equal(testSubdir.has("testKey"), true);
                assert.equal(testSubdir.has("garbage"), false);
                assert.equal(testSubdir.get("testKey"), "testValue");
                assert.equal(testSubdir.get("testKey2"), "testValue2");
                assert.equal(testSubdir.get("testKey3"), undefined);

                // Verify the remote SharedDirectory
                const barSubDir = directory2.getWorkingDirectory("/foo");
                assert.equal(barSubDir.has("testKey"), true);
                assert.equal(barSubDir.has("garbage"), false);
                assert.equal(barSubDir.get("testKey"), "testValue");
                assert.equal(barSubDir.get("testKey2"), "testValue2");
                assert.equal(barSubDir.get("testKey3"), undefined);

                // Set value in sub directory.
                testSubdir.set("fromSubdir", "testValue4");

                containerRuntimeFactory.processAllMessages();

                // Verify the local sub directory
                assert.equal(directory.getWorkingDirectory("foo").get("fromSubdir"), "testValue4");

                // Verify the remote sub directory
                assert.equal(directory.getWorkingDirectory("foo").get("fromSubdir"), "testValue4");
            });

            it("Can be cleared from the subdirectory", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                directory.set("testKey", "testValue4");
                directory.set("testKey2", "testValue5");
                const testSubdir = directory.getWorkingDirectory("/foo");
                testSubdir.clear();

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory.getWorkingDirectory("foo").get("testKey"), undefined);
                assert.equal(directory.getWorkingDirectory("foo").get("testKey2"), undefined);
                assert.equal(directory.getWorkingDirectory("bar").get("testKey3"), "testValue3");
                assert.equal(directory.getWorkingDirectory("..").get("testKey"), "testValue4");
                assert.equal(directory.getWorkingDirectory(".").get("testKey2"), "testValue5");

                // Verify the remote SharedDirectory
                assert.equal(directory2.getWorkingDirectory("foo").get("testKey"), undefined);
                assert.equal(directory2.getWorkingDirectory("foo").get("testKey2"), undefined);
                assert.equal(directory2.getWorkingDirectory("bar").get("testKey3"), "testValue3");
                assert.equal(directory2.getWorkingDirectory("..").get("testKey"), "testValue4");
                assert.equal(directory2.getWorkingDirectory(".").get("testKey2"), "testValue5");
            });

            it("Can delete keys from the subdirectory", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                directory.set("testKey", "testValue4");
                directory.set("testKey2", "testValue5");
                const testSubdirFoo = directory.getWorkingDirectory("/foo");
                testSubdirFoo.delete("testKey2");
                const testSubdirBar = directory.getWorkingDirectory("/bar");
                testSubdirBar.delete("testKey3");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory.getWorkingDirectory("foo").get("testKey"), "testValue");
                assert.equal(directory.getWorkingDirectory("foo").get("testKey2"), undefined);
                assert.equal(directory.getWorkingDirectory("bar").get("testKey3"), undefined);
                assert.equal(directory.get("testKey"), "testValue4");
                assert.equal(directory.get("testKey2"), "testValue5");

                // Verify the remote SharedDirectory
                assert.equal(directory2.getWorkingDirectory("foo").get("testKey"), "testValue");
                assert.equal(directory2.getWorkingDirectory("foo").get("testKey2"), undefined);
                assert.equal(directory2.getWorkingDirectory("bar").get("testKey3"), undefined);
                assert.equal(directory2.get("testKey"), "testValue4");
                assert.equal(directory2.get("testKey2"), "testValue5");
            });

            it("Knows the size of the subdirectory", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                directory.set("testKey", "testValue4");
                directory.set("testKey2", "testValue5");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const testSubdirFoo = directory.getWorkingDirectory("/foo");
                assert.equal(testSubdirFoo.size, 2);
                // Verify the remote SharedDirectory
                const testSubdirFoo2 = directory2.getWorkingDirectory("/foo");
                assert.equal(testSubdirFoo2.size, 2);

                testSubdirFoo.delete("testKey2");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(testSubdirFoo.size, 1);
                // Verify the remote SharedDirectory
                assert.equal(testSubdirFoo2.size, 1);

                directory.delete("testKey");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(testSubdirFoo.size, 1);
                // Verify the remote SharedDirectory
                assert.equal(testSubdirFoo2.size, 1);

                const testSubdirBar = directory.getWorkingDirectory("/bar");
                testSubdirBar.delete("testKey3");

                // Verify the local SharedDirectory
                assert.equal(testSubdirFoo.size, 1);
                // Verify the remote SharedDirectory
                assert.equal(testSubdirFoo2.size, 1);

                directory.clear();

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
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const barSubdir = directory.getWorkingDirectory("/bar");
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
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
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
                assert.equal(barDirectory2.getWorkingDirectory("baz"), undefined);
            });

            it("Can delete a child subdirectory with children", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");
                directory.deleteSubDirectory("bar");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                assert.equal(directory.getWorkingDirectory("bar"), undefined);

                // Verify the remote SharedDirectory
                assert.equal(directory2.getWorkingDirectory("bar"), undefined);
            });

            it("Can get and use a keys iterator", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const fooSubDir = directory.getWorkingDirectory("/foo");
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

                const barSubDir = directory.getWorkingDirectory("/bar");
                const barSubDirIterator = barSubDir.keys();
                const barSubDirResult1 = barSubDirIterator.next();
                assert.equal(barSubDirResult1.value, "testKey3");
                assert.equal(barSubDirResult1.done, false);
                const barSubDirResult2 = barSubDirIterator.next();
                assert.equal(barSubDirResult2.value, undefined);
                assert.equal(barSubDirResult2.done, true);

                // Verify the remote SharedDirectory
                const fooSubDir2 = directory2.getWorkingDirectory("/foo");
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
                const barSubDir2Iterator = barSubDir2.keys();
                const barSubDir2Result1 = barSubDir2Iterator.next();
                assert.equal(barSubDir2Result1.value, "testKey3");
                assert.equal(barSubDir2Result1.done, false);
                const barSubDir2Result2 = barSubDir2Iterator.next();
                assert.equal(barSubDir2Result2.value, undefined);
                assert.equal(barSubDir2Result2.done, true);
            });

            it("Can get and use a values iterator", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const fooSubDir = directory.getWorkingDirectory("/foo");
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

                const barSubDir = directory.getWorkingDirectory("/bar");
                const barSubDirIterator = barSubDir.values();
                const barSubDirResult1 = barSubDirIterator.next();
                assert.equal(barSubDirResult1.value, "testValue3");
                assert.equal(barSubDirResult1.done, false);
                const barSubDirResult2 = barSubDirIterator.next();
                assert.equal(barSubDirResult2.value, undefined);
                assert.equal(barSubDirResult2.done, true);

                // Verify the remote SharedDirectory
                const fooSubDir2 = directory2.getWorkingDirectory("/foo");
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
                const barSubDir2Iterator = barSubDir2.values();
                const barSubDir2Result1 = barSubDir2Iterator.next();
                assert.equal(barSubDir2Result1.value, "testValue3");
                assert.equal(barSubDir2Result1.done, false);
                const barSubDir2Result2 = barSubDir2Iterator.next();
                assert.equal(barSubDir2Result2.value, undefined);
                assert.equal(barSubDir2Result2.done, true);
            });

            it("Can get and use an entries iterator", () => {
                const fooDirectory = directory.createSubDirectory("foo");
                const barDirectory = directory.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedDirectory
                const fooSubDir = directory.getWorkingDirectory("/foo");
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

                const barSubDir = directory.getWorkingDirectory("/bar");

                const expectedEntries = new Set(["testKey3"]);
                for (const entry of barSubDir) {
                    assert.ok(expectedEntries.has(entry[0]));
                    expectedEntries.delete(entry[0]);
                }
                assert.ok(expectedEntries.size === 0);

                // Verify the remote SharedDirectory
                const fooSubDir2 = directory2.getWorkingDirectory("/foo");
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

                const expectedEntries2 = new Set(["testKey3"]);
                for (const entry of barSubDir2) {
                    assert.ok(expectedEntries2.has(entry[0]));
                    expectedEntries2.delete(entry[0]);
                }
                assert.ok(expectedEntries2.size === 0);
            });

            it("Can iterate over its subdirectories", () => {
                const fooDirectory = directory.createSubDirectory("foo");
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
                const expectedDirectories2 = new Set(["bar", "baz"]);
                for (const [subDirName] of fooDirectory2.subdirectories()) {
                    assert.ok(expectedDirectories2.has(subDirName));
                    expectedDirectories2.delete(subDirName);
                }
                assert.ok(expectedDirectories2.size === 0);
            });
        });
    });
});
