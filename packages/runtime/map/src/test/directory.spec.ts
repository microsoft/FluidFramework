/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:no-console

import assert from "assert";
import {
    IBlob,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import {
    MockRuntime,
    MockSharedObjectServices,
} from "@microsoft/fluid-test-runtime-utils";

import * as map from "../";
import { SharedDirectory } from "../directory";

async function populate(directory: map.ISharedDirectory, content: object) {
    const storage = new MockSharedObjectServices({
        header: JSON.stringify(content),
    });
    return (directory as SharedDirectory).load("branchId", storage);
}

function serialize(directory: map.ISharedDirectory): string {
    const tree = directory.snapshot();
    assert(tree.entries.length === 1);
    assert(tree.entries[0].path === "header");
    assert(tree.entries[0].type === TreeEntry[TreeEntry.Blob]);
    const contents = (tree.entries[0].value as IBlob).contents;
    return JSON.stringify((JSON.parse(contents) as map.IDirectoryNewStorageFormat).content);
}

describe("Routerlicious", () => {
    describe("Directory", () => {
        let rootDirectory: map.ISharedDirectory;
        let testDirectory: map.ISharedDirectory;
        let directoryFactory: map.DirectoryFactory;
        let mapFactory: map.MapFactory;
        let runtime: MockRuntime;

        beforeEach(async () => {
            runtime = new MockRuntime();
            directoryFactory = new map.DirectoryFactory();
            mapFactory = new map.MapFactory();
            rootDirectory = directoryFactory.create(runtime, "root");
            testDirectory = directoryFactory.create(runtime, "test");
        });

        it("Can get the root directory", () => {
            assert.ok(rootDirectory);
        });

        it("Can create a new directory", () => {
            assert.ok(testDirectory);
        });

        it("Knows its absolute path", () => {
            assert.equal(rootDirectory.absolutePath, "/");
        });

        it("Can set and get keys one level deep", () => {
            testDirectory.set("testKey", "testValue");
            testDirectory.set("testKey2", "testValue2");
            assert.equal(testDirectory.get("testKey"), "testValue");
            assert.equal(testDirectory.get("testKey2"), "testValue2");
        });

        it("Rejects a undefined and null key set", () => {
            assert.throws(() => {
                testDirectory.set(undefined, "testValue");
            }, "Should throw for key of undefined");
            assert.throws(() => {
                testDirectory.set(null, "testValue");
            }, "Should throw for key of null");
        });

        it("Can set and get keys two levels deep", () => {
            const fooDirectory = testDirectory.createSubDirectory("foo");
            const barDirectory = testDirectory.createSubDirectory("bar");
            fooDirectory.set("testKey", "testValue");
            fooDirectory.set("testKey2", "testValue2");
            barDirectory.set("testKey3", "testValue3");
            assert.equal(testDirectory.getWorkingDirectory("foo").get("testKey"), "testValue");
            assert.equal(testDirectory.getWorkingDirectory("foo/").get("testKey2"), "testValue2");
            assert.equal(testDirectory.getWorkingDirectory("bar").get("testKey3"), "testValue3");
        });

        it("Can clear keys stored directly under the root", () => {
            const fooDirectory = testDirectory.createSubDirectory("foo");
            const barDirectory = testDirectory.createSubDirectory("bar");
            fooDirectory.set("testKey", "testValue");
            fooDirectory.set("testKey2", "testValue2");
            barDirectory.set("testKey3", "testValue3");
            testDirectory.set("testKey", "testValue4");
            testDirectory.set("testKey2", "testValue5");
            testDirectory.clear();
            assert.equal(testDirectory.getWorkingDirectory("/foo/").get("testKey"), "testValue");
            assert.equal(testDirectory.getWorkingDirectory("./foo").get("testKey2"), "testValue2");
            assert.equal(testDirectory.getWorkingDirectory("bar").get("testKey3"), "testValue3");
            assert.equal(testDirectory.get("testKey"), undefined);
            assert.equal(testDirectory.get("testKey2"), undefined);
        });

        it("Can delete keys from the root", () => {
            const fooDirectory = testDirectory.createSubDirectory("foo");
            const barDirectory = testDirectory.createSubDirectory("bar");
            fooDirectory.set("testKey", "testValue");
            fooDirectory.set("testKey2", "testValue2");
            barDirectory.set("testKey3", "testValue3");
            testDirectory.set("testKey", "testValue4");
            testDirectory.set("testKey2", "testValue5");
            testDirectory.delete("testKey2");
            assert.equal(testDirectory.getWorkingDirectory("foo").get("testKey"), "testValue");
            assert.equal(testDirectory.getWorkingDirectory("foo").get("testKey2"), "testValue2");
            assert.equal(testDirectory.getWorkingDirectory("bar").get("testKey3"), "testValue3");
            assert.equal(testDirectory.get("testKey"), "testValue4");
            assert.equal(testDirectory.get("testKey2"), undefined);
        });

        it("Can iterate over the subdirectories in the root", () => {
            testDirectory.createSubDirectory("foo");
            testDirectory.createSubDirectory("bar");
            const expectedDirectories = new Set(["foo", "bar"]);
            for (const [subDirName] of testDirectory.subdirectories()) {
                assert.ok(expectedDirectories.has(subDirName));
                expectedDirectories.delete(subDirName);
            }
            assert.ok(expectedDirectories.size === 0);
        });

        describe(".serialize", () => {
            it("Should serialize an empty directory as a JSON object", () => {
                const serialized = serialize(testDirectory);
                assert.equal(serialized, "{}");
            });

            it("Should serialize a directory without subdirectories as a JSON object", () => {
                testDirectory.set("first", "second");
                testDirectory.set("third", "fourth");
                testDirectory.set("fifth", "sixth");
                const subMap = mapFactory.create(runtime, "subMap");
                testDirectory.set("object", subMap.handle);

                const serialized = serialize(testDirectory);
                // eslint-disable-next-line max-len
                const expected = `{"storage":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain","value":"sixth"},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"subMap"}}}}`;
                assert.equal(serialized, expected);
            });

            it("Should serialize a directory with subdirectories as a JSON object", () => {
                testDirectory.set("first", "second");
                testDirectory.set("third", "fourth");
                testDirectory.set("fifth", "sixth");
                const subMap = mapFactory.create(runtime, "subMap");
                testDirectory.set("object", subMap.handle);
                const nestedDirectory = testDirectory.createSubDirectory("nested");
                nestedDirectory.set("deepKey1", "deepValue1");
                nestedDirectory.createSubDirectory("nested2")
                    .createSubDirectory("nested3")
                    .set("deepKey2", "deepValue2");

                const serialized = serialize(testDirectory);
                // eslint-disable-next-line max-len
                const expected = `{"storage":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain","value":"sixth"},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"subMap"}}},"subdirectories":{"nested":{"storage":{"deepKey1":{"type":"Plain","value":"deepValue1"}},"subdirectories":{"nested2":{"subdirectories":{"nested3":{"storage":{"deepKey2":{"type":"Plain","value":"deepValue2"}}}}}}}}}`;
                assert.equal(serialized, expected);
            });

            it("Should serialize an undefined value", () => {
                testDirectory.set("first", "second");
                testDirectory.set("third", "fourth");
                testDirectory.set("fifth", undefined);
                assert.ok(testDirectory.has("fifth"));
                const subMap = mapFactory.create(runtime, "subMap");
                testDirectory.set("object", subMap.handle);
                const nestedDirectory = testDirectory.createSubDirectory("nested");
                nestedDirectory.set("deepKey1", "deepValue1");
                nestedDirectory.set("deepKeyUndefined", undefined);
                assert.ok(nestedDirectory.has("deepKeyUndefined"));
                nestedDirectory.createSubDirectory("nested2")
                    .createSubDirectory("nested3")
                    .set("deepKey2", "deepValue2");

                const serialized = serialize(testDirectory);
                // eslint-disable-next-line max-len
                const expected = `{"storage":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain"},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"subMap"}}},"subdirectories":{"nested":{"storage":{"deepKey1":{"type":"Plain","value":"deepValue1"},"deepKeyUndefined":{"type":"Plain"}},"subdirectories":{"nested2":{"subdirectories":{"nested3":{"storage":{"deepKey2":{"type":"Plain","value":"deepValue2"}}}}}}}}}`;
                assert.equal(serialized, expected);
            });
        });

        describe(".populate", () => {
            it("Should populate the directory from an empty JSON object (old format)", async () => {
                await populate(testDirectory, {});
                assert.equal(testDirectory.size, 0, "Failed to initialize to empty directory storage");
                testDirectory.set("testKey", "testValue");
                assert.equal(testDirectory.get("testKey"), "testValue", "Failed to set testKey");
                testDirectory.createSubDirectory("testSubDir").set("testSubKey", "testSubValue");
                assert.equal(
                    testDirectory.getWorkingDirectory("testSubDir").get("testSubKey"),
                    "testSubValue",
                    "Failed to set testSubKey",
                );
            });

            it("Should populate the directory from a basic JSON object (old format)", async () => {
                await populate(testDirectory, {
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
                assert.equal(testDirectory.size, 2, "Failed to initialize directory storage correctly");
                assert.equal(testDirectory.getWorkingDirectory("/foo").get("testKey"), "testValue");
                assert.equal(testDirectory.getWorkingDirectory("foo").get("testKey2"), "testValue2");
                assert.equal(testDirectory.getWorkingDirectory("/bar").get("testKey3"), "testValue3");
                assert.equal(testDirectory.getWorkingDirectory("").get("testKey"), "testValue4");
                assert.equal(testDirectory.getWorkingDirectory("/").get("testKey2"), "testValue5");
                testDirectory.set("testKey", "newValue");
                assert.equal(testDirectory.get("testKey"), "newValue", "Failed to set testKey");
                testDirectory.createSubDirectory("testSubDir").set("testSubKey", "newSubValue");
                assert.equal(
                    testDirectory.getWorkingDirectory("testSubDir").get("testSubKey"),
                    "newSubValue",
                    "Failed to set testSubKey",
                );
            });

            it("Should populate the directory with undefined values (old format)", async () => {
                await populate(testDirectory, {
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
                assert.equal(testDirectory.size, 2, "Failed to initialize directory storage correctly");
                assert.equal(testDirectory.getWorkingDirectory("/foo").get("testKey"), "testValue");
                assert.equal(testDirectory.getWorkingDirectory("foo").get("testKey2"), undefined);
                assert.equal(testDirectory.getWorkingDirectory("/bar").get("testKey3"), "testValue3");
                assert.equal(testDirectory.getWorkingDirectory("").get("testKey"), "testValue4");
                assert.equal(testDirectory.getWorkingDirectory("/").get("testKey2"), undefined);
                assert.ok(testDirectory.has("testKey2"));
                assert.ok(testDirectory.getWorkingDirectory("/foo").has("testKey2"));
                testDirectory.set("testKey", "newValue");
                assert.equal(testDirectory.get("testKey"), "newValue", "Failed to set testKey");
                testDirectory.createSubDirectory("testSubDir").set("testSubKey", "newSubValue");
                assert.equal(
                    testDirectory.getWorkingDirectory("testSubDir").get("testSubKey"),
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

                testDirectory.set("first", "second");
                testDirectory.set("long1", longWord);
                const nestedDirectory = testDirectory.createSubDirectory("nested");
                nestedDirectory.set("deepKey1", "deepValue1");
                nestedDirectory.set("long2", logWord2);

                const tree = testDirectory.snapshot();
                assert(tree.entries.length === 3);
                assert(tree.entries[0].path === "blob0");
                assert(tree.entries[1].path === "blob1");
                assert(tree.entries[2].path === "header");
                assert((tree.entries[0].value as IBlob).contents.length >= 1024);
                assert((tree.entries[1].value as IBlob).contents.length >= 1024);
                assert((tree.entries[2].value as IBlob).contents.length <= 200);

                const testDirectory2 = directoryFactory.create(runtime, "test");
                const storage = MockSharedObjectServices.createFromTree(tree);
                await (testDirectory2 as SharedDirectory).load("branchId", storage);

                assert.equal(testDirectory2.get("first"), "second");
                assert.equal(testDirectory2.get("long1"), longWord);
                assert.equal(testDirectory2.getWorkingDirectory("/nested").get("deepKey1"), "deepValue1");
                assert.equal(testDirectory2.getWorkingDirectory("/nested").get("long2"), logWord2);
            });
        });

        describe("eventsDirectory", () => {
            it("listeners should listen to fired map events", async () => {
                const dummyDirectory = testDirectory;
                let called1: boolean = false;
                let called2: boolean = false;
                dummyDirectory.on("op", (agr1, arg2, arg3) => called1 = true);
                dummyDirectory.on("valueChanged", (agr1, arg2, arg3, arg4) => called2 = true);
                dummyDirectory.set("dwyane", "johnson");
                assert.equal(called1, false, "op");
                assert.equal(called2, true, "valueChanged");
            });
        });

        describe("SubDirectory", () => {
            it("Can get a subdirectory", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = testDirectory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                const testSubdir = testDirectory.getWorkingDirectory("/foo");
                assert.ok(testSubdir);
            });

            it("Knows its absolute path", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = fooDirectory.createSubDirectory("bar");
                assert.equal(fooDirectory.absolutePath, "/foo");
                assert.equal(barDirectory.absolutePath, "/foo/bar");
            });

            it("Can get and set keys from a subdirectory using relative paths", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = testDirectory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                const testSubdir = testDirectory.getWorkingDirectory("/foo");
                assert.equal(testSubdir.has("testKey"), true);
                assert.equal(testSubdir.has("garbage"), false);
                assert.equal(testSubdir.get("testKey"), "testValue");
                assert.equal(testSubdir.get("testKey2"), "testValue2");
                assert.equal(testSubdir.get("testKey3"), undefined);
                testSubdir.set("fromSubdir", "testValue4");
                assert.equal(testDirectory.getWorkingDirectory("foo").get("fromSubdir"), "testValue4");
            });

            it("Rejects subdirectories with undefined and null names", () => {
                assert.throws(() => {
                    testDirectory.createSubDirectory(undefined);
                }, "Should throw for undefined subdirectory name");
                assert.throws(() => {
                    testDirectory.createSubDirectory(null);
                }, "Should throw for null subdirectory name");
            });

            describe(".wait()", () => {
                it("Should resolve returned promise for existing keys", async () => {
                    testDirectory.set("test", "resolved");
                    assert.ok(testDirectory.has("test"));
                    await testDirectory.wait("test");
                });

                it("Should resolve returned promise once unavailable key is available", async () => {
                    assert.ok(!testDirectory.has("test"));

                    const waitP = testDirectory.wait("test");
                    testDirectory.set("test", "resolved");

                    await waitP;
                });
            });

            it("Can be cleared from the subdirectory", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = testDirectory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                testDirectory.set("testKey", "testValue4");
                testDirectory.set("testKey2", "testValue5");
                const testSubdir = testDirectory.getWorkingDirectory("/foo");
                testSubdir.clear();
                assert.equal(testDirectory.getWorkingDirectory("foo").get("testKey"), undefined);
                assert.equal(testDirectory.getWorkingDirectory("foo").get("testKey2"), undefined);
                assert.equal(testDirectory.getWorkingDirectory("bar").get("testKey3"), "testValue3");
                assert.equal(testDirectory.getWorkingDirectory("..").get("testKey"), "testValue4");
                assert.equal(testDirectory.getWorkingDirectory(".").get("testKey2"), "testValue5");
            });

            it("Can delete keys from the subdirectory", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = testDirectory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                testDirectory.set("testKey", "testValue4");
                testDirectory.set("testKey2", "testValue5");
                const testSubdirFoo = testDirectory.getWorkingDirectory("/foo");
                testSubdirFoo.delete("testKey2");
                const testSubdirBar = testDirectory.getWorkingDirectory("/bar");
                testSubdirBar.delete("testKey3");
                assert.equal(testDirectory.getWorkingDirectory("foo").get("testKey"), "testValue");
                assert.equal(testDirectory.getWorkingDirectory("foo").get("testKey2"), undefined);
                assert.equal(testDirectory.getWorkingDirectory("bar").get("testKey3"), undefined);
                assert.equal(testDirectory.get("testKey"), "testValue4");
                assert.equal(testDirectory.get("testKey2"), "testValue5");
            });

            it("Knows the size of the subdirectory", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = testDirectory.createSubDirectory("bar");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                testDirectory.set("testKey", "testValue4");
                testDirectory.set("testKey2", "testValue5");
                const testSubdirFoo = testDirectory.getWorkingDirectory("/foo");
                assert.equal(testSubdirFoo.size, 2);
                testSubdirFoo.delete("testKey2");
                assert.equal(testSubdirFoo.size, 1);
                testDirectory.delete("testKey");
                assert.equal(testSubdirFoo.size, 1);
                const testSubdirBar = testDirectory.getWorkingDirectory("/bar");
                testSubdirBar.delete("testKey3");
                assert.equal(testSubdirFoo.size, 1);
                testDirectory.clear();
                assert.equal(testSubdirFoo.size, 1);
                testSubdirFoo.clear();
                assert.equal(testSubdirFoo.size, 0);
            });

            it("Can get a subdirectory from a subdirectory", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = testDirectory.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");
                const testSubdir = testDirectory.getWorkingDirectory("/bar");
                assert.ok(testSubdir);
                const testSubdir2 = testSubdir.getWorkingDirectory("./baz");
                assert.ok(testSubdir2);
                assert.equal(testSubdir2.get("testKey4"), "testValue4");
            });

            it("Can delete a child subdirectory", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = testDirectory.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");
                barDirectory.deleteSubDirectory("baz");
                assert.equal(barDirectory.getWorkingDirectory("baz"), undefined);
            });

            it("Can delete a child subdirectory with children", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = testDirectory.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");
                testDirectory.deleteSubDirectory("bar");
                assert.equal(testDirectory.getWorkingDirectory("bar"), undefined);
            });

            it("Can get and use a keys iterator", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = testDirectory.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");

                const testSubdir1 = testDirectory.getWorkingDirectory("/foo");
                const testSubdir1Iterator = testSubdir1.keys();
                const testSubdir1Result1 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result1.value, "testKey");
                assert.equal(testSubdir1Result1.done, false);
                const testSubdir1Result2 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result2.value, "testKey2");
                assert.equal(testSubdir1Result2.done, false);
                const testSubdir1Result3 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result3.value, undefined);
                assert.equal(testSubdir1Result3.done, true);

                const testSubdir2 = testDirectory.getWorkingDirectory("/bar");
                const testSubdir2Iterator = testSubdir2.keys();
                const testSubdir2Result1 = testSubdir2Iterator.next();
                assert.equal(testSubdir2Result1.value, "testKey3");
                assert.equal(testSubdir2Result1.done, false);
                const testSubdir2Result2 = testSubdir2Iterator.next();
                assert.equal(testSubdir2Result2.value, undefined);
                assert.equal(testSubdir2Result2.done, true);
            });

            it("Can get and use a values iterator", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = testDirectory.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");

                const testSubdir1 = testDirectory.getWorkingDirectory("/foo");
                const testSubdir1Iterator = testSubdir1.values();
                const testSubdir1Result1 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result1.value, "testValue");
                assert.equal(testSubdir1Result1.done, false);
                const testSubdir1Result2 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result2.value, "testValue2");
                assert.equal(testSubdir1Result2.done, false);
                const testSubdir1Result3 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result3.value, undefined);
                assert.equal(testSubdir1Result3.done, true);

                const testSubdir2 = testDirectory.getWorkingDirectory("/bar");
                const testSubdir2Iterator = testSubdir2.values();
                const testSubdir2Result1 = testSubdir2Iterator.next();
                assert.equal(testSubdir2Result1.value, "testValue3");
                assert.equal(testSubdir2Result1.done, false);
                const testSubdir2Result2 = testSubdir2Iterator.next();
                assert.equal(testSubdir2Result2.value, undefined);
                assert.equal(testSubdir2Result2.done, true);
            });

            it("Can get and use an entries iterator", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                const barDirectory = testDirectory.createSubDirectory("bar");
                const bazDirectory = barDirectory.createSubDirectory("baz");
                fooDirectory.set("testKey", "testValue");
                fooDirectory.set("testKey2", "testValue2");
                barDirectory.set("testKey3", "testValue3");
                bazDirectory.set("testKey4", "testValue4");

                const testSubdir1 = testDirectory.getWorkingDirectory("/foo");
                const testSubdir1Iterator = testSubdir1.entries();
                const testSubdir1Result1 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result1.value[0], "testKey");
                assert.equal(testSubdir1Result1.value[1], "testValue");
                assert.equal(testSubdir1Result1.done, false);
                const testSubdir1Result2 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result2.value[0], "testKey2");
                assert.equal(testSubdir1Result2.value[1], "testValue2");
                assert.equal(testSubdir1Result2.done, false);
                const testSubdir1Result3 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result3.value, undefined);
                assert.equal(testSubdir1Result3.done, true);

                const testSubdir2 = testDirectory.getWorkingDirectory("/bar");

                const expectedEntries = new Set(["testKey3"]);
                for (const entry of testSubdir2) {
                    assert.ok(expectedEntries.has(entry[0]));
                    expectedEntries.delete(entry[0]);
                }
                assert.ok(expectedEntries.size === 0);
            });

            it("Can iterate over its subdirectories", () => {
                const fooDirectory = testDirectory.createSubDirectory("foo");
                fooDirectory.createSubDirectory("bar");
                fooDirectory.createSubDirectory("baz");
                const expectedDirectories = new Set(["bar", "baz"]);
                for (const [subDirName] of fooDirectory.subdirectories()) {
                    assert.ok(expectedDirectories.has(subDirName));
                    expectedDirectories.delete(subDirName);
                }
                assert.ok(expectedDirectories.size === 0);
            });
        });
    });
});
