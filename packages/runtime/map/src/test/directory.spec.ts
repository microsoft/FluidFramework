/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:no-console

import * as assert from "assert";
import * as map from "..";
import { IDirectoryDataObject, SharedDirectory } from "../directory";

describe("Routerlicious", () => {
    describe("Directory", () => {
        // TODO: make these ISharedDirectory again.
        let rootDirectory: map.SharedDirectory;
        let testDirectory: map.SharedDirectory;
        let directoryExtension: map.DirectoryExtension;
        let mapExtension: map.MapExtension;

        beforeEach(async () => {
            directoryExtension = new map.DirectoryExtension();
            mapExtension = new map.MapExtension();
            rootDirectory = directoryExtension.create(null, "root") as SharedDirectory;
            testDirectory = directoryExtension.create(null, "test") as SharedDirectory;
        });

        it("Can get the root directory", () => {
            assert.ok(rootDirectory);
        });

        it("Can create a new directory", () => {
            assert.ok(testDirectory);
        });

        it("Can set and get keys one level deep", () => {
            testDirectory.set("testKey", "testValue");
            testDirectory.set("testKey2", "testValue2");
            assert.equal(testDirectory.get("testKey"), "testValue");
            assert.equal(testDirectory.get("testKey2"), "testValue2");
        });

        it("Can set and get keys two levels deep", () => {
            testDirectory.setKeyAtPath("testKey", "testValue", "/foo");
            testDirectory.setKeyAtPath("testKey2", "testValue2", "foo");
            testDirectory.setKeyAtPath("testKey3", "testValue3", "/bar/");
            assert.equal(testDirectory.getKeyAtPath("testKey", "foo"), "testValue");
            assert.equal(testDirectory.getKeyAtPath("testKey2", "foo/"), "testValue2");
            assert.equal(testDirectory.getKeyAtPath("testKey3", "bar"), "testValue3");
        });

        it("Can clear keys stored directly under the root", () => {
            testDirectory.setKeyAtPath("testKey", "testValue", "foo");
            testDirectory.setKeyAtPath("testKey2", "testValue2", "/foo/");
            testDirectory.setKeyAtPath("testKey3", "testValue3", "./bar/");
            testDirectory.set("testKey", "testValue4");
            testDirectory.set("testKey2", "testValue5");
            testDirectory.clear();
            assert.equal(testDirectory.getKeyAtPath("testKey", "/foo/"), "testValue");
            assert.equal(testDirectory.getKeyAtPath("testKey2", "./foo"), "testValue2");
            assert.equal(testDirectory.getKeyAtPath("testKey3", "bar"), "testValue3");
            assert.equal(testDirectory.get("testKey"), undefined);
            assert.equal(testDirectory.get("testKey2"), undefined);
        });

        it("Can delete keys from the root", () => {
            testDirectory.setKeyAtPath("testKey", "testValue", "/./foo");
            testDirectory.setKeyAtPath("testKey2", "testValue2", "././foo");
            testDirectory.setKeyAtPath("testKey3", "testValue3", "foo/../bar");
            testDirectory.set("testKey", "testValue4");
            testDirectory.set("testKey2", "testValue5");
            testDirectory.delete("testKey2");
            assert.equal(testDirectory.getKeyAtPath("testKey", "foo"), "testValue");
            assert.equal(testDirectory.getKeyAtPath("testKey2", "foo"), "testValue2");
            assert.equal(testDirectory.getKeyAtPath("testKey3", "bar"), "testValue3");
            assert.equal(testDirectory.get("testKey"), "testValue4");
            assert.equal(testDirectory.get("testKey2"), undefined);
        });

        it("Can set keys using new AtPath approach", () => {
            testDirectory.setKeyAtPath("testKey", "testValue", "foo");
            testDirectory.setKeyAtPath("testKey2", "testValue2", "/foo");
            testDirectory.setKeyAtPath("testKey3", "testValue3", "bar");
            testDirectory.setKeyAtPath("testKey", "testValue4", "/");
            testDirectory.setKeyAtPath("testKey2", "testValue5", "");
            assert.equal(testDirectory.getKeyAtPath("testKey", "/foo"), "testValue");
            assert.equal(testDirectory.getKeyAtPath("testKey2", "foo"), "testValue2");
            assert.equal(testDirectory.getKeyAtPath("testKey3", "/bar"), "testValue3");
            assert.equal(testDirectory.getKeyAtPath("testKey", ""), "testValue4");
            assert.equal(testDirectory.getKeyAtPath("testKey2", "/"), "testValue5");
        });

        describe(".serialize", () => {
            it("Should serialize an empty directory as a JSON object", () => {
                const serialized = testDirectory.serialize();
                assert.equal(serialized, "{}");
            });

            it("Should serialize a directory without subdirectories as a JSON object", () => {
                testDirectory.set("first", "second");
                testDirectory.set("third", "fourth");
                testDirectory.set("fifth", "sixth");
                const subMap = mapExtension.create(null, "subMap");
                testDirectory.set("object", subMap);

                const serialized = testDirectory.serialize();
                // tslint:disable-next-line:max-line-length
                const expected = `{"storage":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain","value":"sixth"},"object":{"type":"Shared","value":"subMap"}}}`;
                assert.equal(serialized, expected);
            });

            it("Should serialize a directory with subdirectories as a JSON object", () => {
                testDirectory.set("first", "second");
                testDirectory.set("third", "fourth");
                testDirectory.set("fifth", "sixth");
                const subMap = mapExtension.create(null, "subMap");
                testDirectory.set("object", subMap);
                testDirectory.setKeyAtPath("deepKey1", "deepValue1", "nested");
                testDirectory.setKeyAtPath("deepKey2", "deepValue2", "nested/nested2/nested3");

                const serialized = testDirectory.serialize();
                // tslint:disable-next-line:max-line-length
                const expected = `{"storage":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain","value":"sixth"},"object":{"type":"Shared","value":"subMap"}},"subdirectories":{"nested":{"storage":{"deepKey1":{"type":"Plain","value":"deepValue1"}},"subdirectories":{"nested2":{"subdirectories":{"nested3":{"storage":{"deepKey2":{"type":"Plain","value":"deepValue2"}}}}}}}}}`;
                assert.equal(serialized, expected);
            });
        });

        describe(".populate", () => {
            it("Should populate the directory from an empty JSON object", async () => {
                await testDirectory.populate(JSON.parse("{}") as IDirectoryDataObject);
                assert.equal(testDirectory.size, 0, "Failed to initialize to empty directory storage");
                testDirectory.set("testKey", "testValue");
                assert.equal(testDirectory.get("testKey"), "testValue", "Failed to set testKey");
                testDirectory.setKeyAtPath("testSubKey", "testSubValue", "testSubDir");
                assert.equal(
                    testDirectory.getKeyAtPath("testSubKey", "testSubDir"),
                    "testSubValue",
                    "Failed to set testSubKey",
                );
            });

            it("Should populate the directory from a basic JSON object", async () => {
                // tslint:disable-next-line:max-line-length
                const jsonValue = `{"storage":{"testKey":{"type":"Plain","value":"testValue4"},"testKey2":{"type":"Plain","value":"testValue5"}},"subdirectories":{"foo":{"storage":{"testKey":{"type":"Plain","value":"testValue"},"testKey2":{"type":"Plain","value":"testValue2"}}},"bar":{"storage":{"testKey3":{"type":"Plain","value":"testValue3"}}}}}`;
                await testDirectory.populate(JSON.parse(jsonValue) as IDirectoryDataObject);
                assert.equal(testDirectory.size, 2, "Failed to initialize directory storage correctly");
                assert.equal(testDirectory.getKeyAtPath("testKey", "/foo"), "testValue");
                assert.equal(testDirectory.getKeyAtPath("testKey2", "foo"), "testValue2");
                assert.equal(testDirectory.getKeyAtPath("testKey3", "/bar"), "testValue3");
                assert.equal(testDirectory.getKeyAtPath("testKey", ""), "testValue4");
                assert.equal(testDirectory.getKeyAtPath("testKey2", "/"), "testValue5");
                testDirectory.set("testKey", "newValue");
                assert.equal(testDirectory.get("testKey"), "newValue", "Failed to set testKey");
                testDirectory.setKeyAtPath("testSubKey", "newSubValue", "testSubDir");
                assert.equal(
                    testDirectory.getKeyAtPath("testSubKey", "testSubDir"),
                    "newSubValue",
                    "Failed to set testSubKey",
                );
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
                testDirectory.setKeyAtPath("testKey", "testValue", "/../../foo");
                testDirectory.setKeyAtPath("testKey2", "testValue2", "/././foo");
                testDirectory.setKeyAtPath("testKey3", "testValue3", "../../bar");
                const testSubdir = testDirectory.getWorkingDirectory("/foo");
                assert.ok(testSubdir);
            });

            it("Can get and set keys from a subdirectory using relative paths", () => {
                testDirectory.setKeyAtPath("testKey", "testValue", "/.././foo");
                testDirectory.setKeyAtPath("testKey2", "testValue2", "/.././foo");
                testDirectory.setKeyAtPath("testKey3", "testValue3", "./../bar");
                const testSubdir = testDirectory.getWorkingDirectory("/foo");
                assert.equal(testSubdir.has("testKey"), true);
                assert.equal(testSubdir.has("garbage"), false);
                assert.equal(testSubdir.get("testKey"), "testValue");
                assert.equal(testSubdir.get("testKey2"), "testValue2");
                assert.equal(testSubdir.get("testKey3"), undefined);
                testSubdir.set("fromSubdir", "testValue4");
                assert.equal(testDirectory.getKeyAtPath("fromSubdir", "foo"), "testValue4");
            });

            it("Can be cleared from the subdirectory", () => {
                testDirectory.setKeyAtPath("testKey", "testValue", "foo");
                testDirectory.setKeyAtPath("testKey2", "testValue2", "foo");
                testDirectory.setKeyAtPath("testKey3", "testValue3", "bar");
                testDirectory.setKeyAtPath("testKey", "testValue4", "");
                testDirectory.setKeyAtPath("testKey2", "testValue5", "/");
                const testSubdir = testDirectory.getWorkingDirectory("/foo");
                testSubdir.clear();
                assert.equal(testDirectory.getKeyAtPath("testKey", "foo"), undefined);
                assert.equal(testDirectory.getKeyAtPath("testKey2", "foo"), undefined);
                assert.equal(testDirectory.getKeyAtPath("testKey3", "bar"), "testValue3");
                assert.equal(testDirectory.getKeyAtPath("testKey", ".."), "testValue4");
                assert.equal(testDirectory.getKeyAtPath("testKey2", "."), "testValue5");
            });

            it("Can delete keys from the subdirectory", () => {
                testDirectory.setKeyAtPath("testKey", "testValue", "foo");
                testDirectory.setKeyAtPath("testKey2", "testValue2", "foo");
                testDirectory.setKeyAtPath("testKey3", "testValue3", "bar");
                testDirectory.set("testKey", "testValue4");
                testDirectory.set("testKey2", "testValue5");
                const testSubdirFoo = testDirectory.getWorkingDirectory("/foo");
                testSubdirFoo.delete("testKey2");
                const testSubdirBar = testDirectory.getWorkingDirectory("/bar");
                testSubdirBar.delete("testKey3");
                assert.equal(testDirectory.getKeyAtPath("testKey", "foo"), "testValue");
                assert.equal(testDirectory.getKeyAtPath("testKey2", "foo"), undefined);
                assert.equal(testDirectory.getKeyAtPath("testKey3", "bar"), undefined);
                assert.equal(testDirectory.get("testKey"), "testValue4");
                assert.equal(testDirectory.get("testKey2"), "testValue5");
            });

            it("Knows the size of the subdirectory", () => {
                testDirectory.setKeyAtPath("testKey", "testValue", "foo");
                testDirectory.setKeyAtPath("testKey2", "testValue2", "foo");
                testDirectory.setKeyAtPath("testKey3", "testValue3", "bar");
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
                testDirectory.setKeyAtPath("testKey", "testValue", "foo");
                testDirectory.setKeyAtPath("testKey2", "testValue2", "foo");
                testDirectory.setKeyAtPath("testKey3", "testValue3", "bar");
                testDirectory.setKeyAtPath("testKey4", "testValue4", "bar/baz");
                const testSubdir = testDirectory.getWorkingDirectory("/bar");
                assert.ok(testSubdir);
                const testSubdir2 = testSubdir.getWorkingDirectory("./baz");
                assert.ok(testSubdir2);
                assert.equal(testSubdir2.get("testKey4"), "testValue4");
            });

            it("Can get and use a keys iterator", () => {
                testDirectory.setKeyAtPath("testKey", "testValue", "foo");
                testDirectory.setKeyAtPath("testKey2", "testValue2", "foo");
                testDirectory.setKeyAtPath("testKey3", "testValue3", "bar");
                testDirectory.setKeyAtPath("testKey4", "testValue4", "bar/baz");

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
                testDirectory.setKeyAtPath("testKey", "testValue", "foo");
                testDirectory.setKeyAtPath("testKey2", "testValue2", "foo");
                testDirectory.setKeyAtPath("testKey3", "testValue3", "bar");
                testDirectory.setKeyAtPath("testKey4", "testValue4", "bar/baz");

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
                testDirectory.setKeyAtPath("testKey", "testValue", "foo");
                testDirectory.setKeyAtPath("testKey2", "testValue2", "foo");
                testDirectory.setKeyAtPath("testKey3", "testValue3", "bar");
                testDirectory.setKeyAtPath("testKey4", "testValue4", "bar/baz");

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
        });
    });
});
